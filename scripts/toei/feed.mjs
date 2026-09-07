import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import { rowsFromArchive, parseGtfsTime, weekdayField } from '@motionstudies/data/gtfs'

const exec = promisify(execFile)
const REQUIRED = ['agency.txt', 'routes.txt', 'trips.txt', 'stops.txt', 'stop_times.txt']
const RETAIN = new Set(['agency.txt', 'routes.txt', 'calendar.txt', 'calendar_dates.txt', 'feed_info.txt'])
const OPTIONAL = ['feed_info.txt', 'calendar.txt', 'calendar_dates.txt', 'shapes.txt', 'translations.txt', 'transfers.txt', 'pathways.txt', 'levels.txt', 'attributions.txt', 'frequencies.txt']

export function requireValue(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${label}`)
  return value
}

export function serviceDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw new Error('Service date must be a real YYYY-MM-DD date')
  }
  return value
}

export function gtfsDate(value, label) {
  if (!/^\d{8}$/.test(value)) throw new Error(`Invalid ${label}: expected YYYYMMDD`)
  return serviceDate(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}`)
}

export function time(value, label) {
  if (!/^\d{1,3}:[0-5]\d:[0-5]\d$/.test(value)) throw new Error(`Invalid ${label}: expected H:MM:SS (hours may exceed 24); blank stop times are not interpolated`)
  return parseGtfsTime(value)
}

export function number(value, label, min = 0, max = Infinity) {
  if (typeof value !== 'string' || !value.trim() || !Number.isFinite(Number(value)) || Number(value) < min || Number(value) > max) throw new Error(`Invalid ${label}`)
  return Number(value)
}

export function unique(rows, key, label) {
  const result = new Map()
  for (const row of rows) {
    const id = requireValue(row[key], `${label}.${key}`)
    if (result.has(id)) throw new Error(`Duplicate ${label} ID: ${id}`)
    result.set(id, row)
  }
  return result
}

// GTFS files must be root ZIP entries. No archive member is extracted to disk.
export async function inspectFeed(archivePath) {
  const archive = resolve(archivePath)
  const { stdout } = await exec('unzip', ['-Z1', archive], { maxBuffer: 2 * 1024 * 1024 })
  const members = stdout.trim().split(/\r?\n/)
  const files = members.filter((name) => /^[a-z][a-z0-9_]*\.txt$/.test(name)).sort()
  if (new Set(files).size !== files.length) throw new Error('Duplicate GTFS ZIP member')
  for (const file of REQUIRED) if (!files.includes(file)) throw new Error(`Missing root GTFS table: ${file}`)
  if (!files.includes('calendar.txt') && !files.includes('calendar_dates.txt')) throw new Error('A calendar.txt or calendar_dates.txt table is required')
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(archive)) hash.update(chunk)
  const tables = {}
  const retained = {}
  const indicators = { afterMidnightCalls: 0, callsWithMissingTimes: 0, callsWithShapeDistance: 0, stopLocationTypes: {} }
  for (const file of files) {
    let count = 0
    let columns = []
    if (RETAIN.has(file)) retained[file] = []
    for await (const row of rowsFromArchive(archive, file)) {
      if (count === 0) columns = Object.keys(row)
      count++
      if (RETAIN.has(file)) retained[file].push(row)
      if (file === 'stop_times.txt') {
        if (!row.arrival_time || !row.departure_time) indicators.callsWithMissingTimes++
        if (Number(row.arrival_time?.split(':')[0]) >= 24 || Number(row.departure_time?.split(':')[0]) >= 24) indicators.afterMidnightCalls++
        if (row.shape_dist_traveled) indicators.callsWithShapeDistance++
      }
      if (file === 'stops.txt') {
        const kind = row.location_type || '0'
        indicators.stopLocationTypes[kind] = (indicators.stopLocationTypes[kind] ?? 0) + 1
      }
    }
    tables[file] = { rows: count, columns }
  }
  for (const file of REQUIRED) if (!tables[file].rows) throw new Error(`Empty required table: ${file}`)
  const report = {
    schemaVersion: 1,
    sourceSha256: hash.digest('hex'),
    tables,
    missingOptionalTables: OPTIONAL.filter((file) => !files.includes(file)),
    ignoredMembers: members.filter((file) => !files.includes(file)),
    agencies: retained['agency.txt'],
    routes: retained['routes.txt'],
    feedInfo: retained['feed_info.txt'] ?? [],
    serviceCalendars: (retained['calendar.txt'] ?? []).map((row) => ({ serviceId: row.service_id, startDate: row.start_date, endDate: row.end_date })),
    exceptionDates: [...new Set((retained['calendar_dates.txt'] ?? []).map((row) => row.date))].sort(),
    indicators,
    notes: ['Inventory only; this is not a full GTFS conformance or publication-rights validation.', 'Columns are inferred from the first data row; header-only tables have an empty column inventory.'],
  }
  return { archive, files: new Set(files), retained, report }
}

export function selectServices(feed, date) {
  serviceDate(date)
  const day = weekdayField(date)
  const active = new Set()
  const calendars = unique(feed.retained['calendar.txt'] ?? [], 'service_id', 'calendar')
  const known = new Set(calendars.keys())
  for (const row of calendars.values()) {
    const start = gtfsDate(row.start_date, 'calendar.start_date')
    const end = gtfsDate(row.end_date, 'calendar.end_date')
    if (start > end) throw new Error('Calendar validity is reversed')
    for (const field of ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']) {
      if (!['0', '1'].includes(row[field])) throw new Error(`Invalid calendar.${field}`)
    }
    if (date >= start && date <= end && row[day] === '1') active.add(row.service_id)
  }
  const exceptions = new Set()
  for (const row of feed.retained['calendar_dates.txt'] ?? []) {
    requireValue(row.service_id, 'calendar_dates.service_id')
    known.add(row.service_id)
    const exceptionDate = gtfsDate(row.date, 'calendar_dates.date')
    const key = JSON.stringify([row.service_id, exceptionDate])
    if (exceptions.has(key)) throw new Error('Duplicate calendar exception')
    exceptions.add(key)
    if (!['1', '2'].includes(row.exception_type)) throw new Error('Invalid calendar exception_type')
    if (exceptionDate !== date) continue
    if (row.exception_type === '1') active.add(row.service_id)
    else active.delete(row.service_id)
  }
  for (const info of feed.retained['feed_info.txt'] ?? []) {
    if (info.feed_start_date && date < gtfsDate(info.feed_start_date, 'feed_start_date')) throw new Error('Service date precedes feed validity')
    if (info.feed_end_date && date > gtfsDate(info.feed_end_date, 'feed_end_date')) throw new Error('Service date exceeds feed validity')
  }
  return { active, known }
}

export function validateProvenance(value) {
  if (!value || typeof value !== 'object') throw new Error('Expected a provenance JSON object')
  for (const field of ['publisher', 'sourceUrl', 'retrievedAt', 'license', 'licenseUrl', 'attribution']) requireValue(value[field], `provenance.${field}`)
  if (!['operator-feed', 'synthetic-fixture'].includes(value.kind)) throw new Error('provenance.kind must be operator-feed or synthetic-fixture')
  for (const field of ['sourceUrl', 'licenseUrl']) {
    let url
    try { url = new URL(value[field]) } catch { throw new Error(`Invalid provenance.${field}`) }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error(`provenance.${field} must be a credential-free HTTPS URL without query or fragment`)
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value.retrievedAt) || !Number.isFinite(Date.parse(value.retrievedAt))) throw new Error('provenance.retrievedAt must be a UTC ISO timestamp')
  serviceDate(value.retrievedAt.slice(0, 10))
  // Keep only the documented fields; never copy arbitrary credential fields.
  return Object.fromEntries(['kind', 'publisher', 'sourceUrl', 'retrievedAt', 'license', 'licenseUrl', 'attribution'].map((key) => [key, value[key]]))
}
