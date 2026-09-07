import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { positionForTrain, buildRouteIndex } from '@motionstudies/core/domain/network'
import { compileToei } from '../scripts/toei/compile.mjs'
import { inspectFeed, selectServices, serviceDate, time } from '../scripts/toei/feed.mjs'

const fixture = fileURLToPath(new URL('./fixtures/toei/', import.meta.url))
const provenance = JSON.parse(await readFile(join(fixture, 'provenance.json'), 'utf8'))
const defaults = { serviceDate: '2026-09-07', routeIds: ['DEMO-LOOP'], provenance }

async function archive(t, changes = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'norikae-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const tables = {}
  for (const name of await readdir(fixture)) if (name.endsWith('.txt')) tables[name] = await readFile(join(fixture, name), 'utf8')
  for (const [name, change] of Object.entries(changes)) tables[name] = typeof change === 'function' ? change(tables[name]) : change
  for (const [name, text] of Object.entries(tables)) if (text !== null) await writeFile(join(directory, name), text)
  const path = join(directory, 'feed.zip')
  execFileSync('zip', ['-q', path, ...Object.keys(tables).filter((name) => tables[name] !== null).sort()], { cwd: directory })
  return { path, directory }
}

test('audits actual tables, optional omissions, names and source fingerprint', async (t) => {
  const { path } = await archive(t, { 'stops.txt': (s) => `\uFEFF${s}`, 'agency_jp.txt': 'agency_id,agency_official_name\nDEMO,架空事業者\n' })
  const { report } = await inspectFeed(path)
  assert.match(report.sourceSha256, /^[a-f0-9]{64}$/)
  assert.equal(report.tables['agency_jp.txt'].rows, 1)
  assert.equal(report.tables['stops.txt'].rows, 5)
  assert.equal(report.indicators.afterMidnightCalls, 2)
  assert.equal(report.indicators.stopLocationTypes['1'], 1)
  assert.equal(report.routes[0].route_long_name, '架空環状線')
  assert.ok(report.missingOptionalTables.includes('pathways.txt'))
  assert.ok(!report.missingOptionalTables.includes('shapes.txt'))
})

test('compiles loop, service additions/removals, scoped identities and translations deterministically', async (t) => {
  const { path } = await archive(t)
  const result = await compileToei({ ...defaults, archive: path })
  const again = await compileToei({ ...defaults, archive: path })
  assert.deepEqual(result, again)
  const { snapshot, records, audit } = result
  assert.equal(snapshot.trains.length, 2)
  assert.equal(snapshot.stops.length, 4)
  assert.equal(audit.selection.loopTrips, 1)
  assert.equal(audit.geometry.matchedSegments, 5)
  assert.equal(audit.geometry.totalSegments, 5)
  assert.equal(audit.geometry.sourceDistanceTrips, 2)
  const loop = snapshot.trains.find((trip) => trip.id.endsWith(':trip:loop'))
  assert.equal(loop.stops[0][0], loop.stops.at(-1)[0])
  assert.equal(loop.pathSegments.length, 4)
  assert.deepEqual(snapshot.paths[loop.pathSegments[0]][0], snapshot.paths[loop.pathSegments.at(-1)].at(-1))
  assert.ok(loop.pathSegments.every((index, i, values) => i === 0 || index !== values[i - 1]))
  assert.equal(snapshot.stops[0][2], '架空, "中央"')
  assert.match(snapshot.stops[0][4], /^toei:[a-f0-9]{64}:stop:A$/)
  assert.match(loop.route, /:route:DEMO-LOOP$/)
  assert.equal(records.translations.find((entry) => entry.id.endsWith(':stop:B')).text, 'Fictional East')
  assert.match(records.stops[0].parentStationId, /:stop:P$/)
  assert.equal(snapshot.metadata.serviceDate, '2026-09-07')
  assert.match(snapshot.metadata.model, /SYNTHETIC FIXTURE/)
  assert.equal(snapshot.metadata.interchangeStudy, undefined)
  assert.equal(audit.payload.gzipBytes, gzipSync(JSON.stringify(snapshot)).byteLength)
  assert.equal(buildRouteIndex(snapshot).length, 1)
  const position = positionForTrain(loop, 7 * 3600 + 3 * 60)
  assert.equal(position.progress, 0.5)
  assert.equal(position.segmentIndex, 0)
  assert.deepEqual(snapshot.paths[loop.pathSegments[position.segmentIndex]][0], snapshot.stops[position.fromStop].slice(0, 2))
  assert.equal(positionForTrain(loop, loop.end).toStop, loop.stops[0][0])
})

test('supports calendar-only and exception-only feeds', async (t) => {
  const onlyCalendar = await archive(t, {
    'calendar_dates.txt': null,
    'trips.txt': (s) => s.split('\n').filter((line) => !line.includes(',special,') && !line.includes(',removed,')).join('\n'),
  })
  const a = await compileToei({ ...defaults, archive: onlyCalendar.path })
  assert.equal(a.snapshot.trains.length, 1)
  const onlyExceptions = await archive(t, {
    'calendar.txt': null,
    'calendar_dates.txt': 'service_id,date,exception_type\nweekday,20260907,1\nremoved,20260907,2\nspecial,20260907,1\n',
  })
  const b = await compileToei({ ...defaults, archive: onlyExceptions.path })
  assert.equal(b.snapshot.trains.length, 2)
})

test('keeps after-midnight time on the original service date and does not wrap the clock', async (t) => {
  const { path } = await archive(t)
  const result = await compileToei({ ...defaults, archive: path, windowStart: '24:00:00', windowEnd: '25:00:00' })
  assert.equal(result.snapshot.trains.length, 1)
  assert.equal(result.snapshot.trains[0].start, 87000)
  assert.equal(result.snapshot.trains[0].end, 87600)
  assert.equal(result.snapshot.metadata.serviceDate, '2026-09-07')
})

test('keeps complete trip tails at window edges and uses half-open intersection', async (t) => {
  const { path } = await archive(t)
  const result = await compileToei({ ...defaults, archive: path, windowStart: '07:10:00', windowEnd: '07:30:00' })
  assert.equal(result.snapshot.trains.length, 1) // extra starts exactly at the excluded end
  assert.equal(result.snapshot.trains[0].stops.length, 5)
  assert.equal(result.snapshot.trains[0].start, 25200)
})

test('projects forward around a loop when source distances are absent', async (t) => {
  const removeDistances = (text) => text.split('\n').map((line) => {
    const cells = line.split(',')
    if (cells[0] !== 'trip_id') cells[5] = ''
    return cells.join(',')
  }).join('\n')
  const { path } = await archive(t, { 'stop_times.txt': removeDistances })
  const result = await compileToei({ ...defaults, archive: path })
  assert.equal(result.audit.geometry.projectedTrips, 2)
  assert.equal(result.audit.geometry.matchedSegments, 5)
  assert.equal(result.audit.geometry.maximumGapMetres, 0)
})

test('does not merge distinct shaped paths for the same stop pair', async (t) => {
  const { path } = await archive(t, {
    'trips.txt': (s) => s.replace('extra,架空東,0,square', 'extra,架空東,1,detour'),
    'shapes.txt': (s) => s + 'detour,35.700,139.700,0,0\ndetour,35.701,139.705,1,0.5\ndetour,35.700,139.710,2,1\n',
  })
  const { snapshot } = await compileToei({ ...defaults, archive: path })
  const extra = snapshot.trains.find((trip) => trip.id.endsWith(':extra'))
  const loop = snapshot.trains.find((trip) => trip.id.endsWith(':loop'))
  assert.notEqual(extra.pathSegments[0], loop.pathSegments[0])
  assert.equal(snapshot.paths[extra.pathSegments[0]].length, 3)
})

test('missing shapes fail by default; diagnostic fallback remains explicit and uncounted', async (t) => {
  const { path } = await archive(t, { 'shapes.txt': null })
  await assert.rejects(compileToei({ ...defaults, archive: path }), /Missing trip shape/)
  const result = await compileToei({ ...defaults, archive: path, allowStraightLines: true })
  assert.equal(result.audit.diagnostic, true)
  assert.equal(result.audit.geometry.matchedSegments, 0)
  assert.equal(result.audit.geometry.totalSegments, 5)
  assert.equal(result.audit.geometry.fallbackTrips.length, 2)
  assert.match(result.snapshot.metadata.model, /DIAGNOSTIC/)
})

const invalidFeeds = [
  ['no service tables', { 'calendar.txt': null, 'calendar_dates.txt': null }, /calendar.txt or calendar_dates.txt/],
  ['calendar typo', { 'calendar.txt': (s) => s.replace('weekday,1', 'weekday,2') }, /calendar.monday/],
  ['duplicate exception', { 'calendar_dates.txt': (s) => s + 'special,20260907,1\n' }, /Duplicate calendar exception/],
  ['unknown service', { 'trips.txt': (s) => s.replace(',weekday,loop', ',missing,loop') }, /Unknown service/],
  ['duplicate trip', { 'trips.txt': (s) => s + 'DEMO-LOOP,weekday,loop,架空,0,square\n' }, /Duplicate trip/],
  ['missing time', { 'stop_times.txt': (s) => s.replace('07:05:00', '') }, /blank stop times/],
  ['invalid minute', { 'stop_times.txt': (s) => s.replace('07:05:00', '07:65:00') }, /Invalid arrival_time/],
  ['estimated time', { 'stop_times.txt': (s) => s.replace('A,1,0,1', 'A,1,0,0') }, /estimated stop times/],
  ['backwards clock', { 'stop_times.txt': (s) => s.replace('07:05:00', '06:05:00') }, /Non-monotonic/],
  ['duplicate call sequence', { 'stop_times.txt': (s) => s.replace('B,2,1,1', 'B,1,1,1') }, /Duplicate stop sequence/],
  ['missing stop', { 'stops.txt': (s) => s.split('\n').filter((line) => !line.startsWith('B,')).join('\n') }, /missing stops/],
  ['bad coordinates', { 'stops.txt': (s) => s.replace('35.700,139.710', ',139.710') }, /stop latitude/],
  ['bad timezone', { 'agency.txt': (s) => s.replace('Asia/Tokyo', 'Europe/Zurich') }, /Asia\/Tokyo/],
  ['bus selection', { 'routes.txt': (s) => s.replace('架空環状線,1', '架空環状線,3') }, /not a subway/],
  ['frequency template', { 'frequencies.txt': 'trip_id,start_time,end_time,headway_secs,exact_times\nloop,07:00:00,09:00:00,300,0\n' }, /frequency expansion/],
  ['reversed shape distance', { 'stop_times.txt': (s) => s.replace('C,3,2,1', 'C,3,0.5,1') }, /Decreasing shape distance/],
  ['shape outside corridor', { 'shapes.txt': (s) => s.replaceAll('35.700', '35.600').replaceAll('35.710', '35.610') }, /200 metres/],
]
for (const [label, changes, expected] of invalidFeeds) {
  test(`rejects ${label}`, async (t) => {
    const { path } = await archive(t, changes)
    await assert.rejects(compileToei({ ...defaults, archive: path }), expected)
  })
}

test('validates date, route selection, feed validity and credential-free provenance', async (t) => {
  assert.throws(() => serviceDate('2026-02-30'), /real YYYY-MM-DD/)
  assert.throws(() => time('07:99:00', 'window'), /Invalid window/)
  const { path } = await archive(t)
  for (const [changes, expected] of [
    [{ serviceDate: '2026-10-01' }, /feed validity/],
    [{ serviceDate: '2026-09-06' }, /No scheduled trips/],
    [{ routeIds: ['unknown'] }, /Unknown selected route/],
    [{ routeIds: [] }, /distinct route IDs/],
    [{ windowStart: '09:00:00', windowEnd: '07:00:00' }, /end must be after start/],
    [{ provenance: { ...provenance, sourceUrl: 'https://example.org/feed?acl:consumerKey=secret' } }, /credential-free/],
    [{ provenance: { ...provenance, retrievedAt: '2026-02-30T00:00:00Z' } }, /real YYYY-MM-DD/],
  ]) await assert.rejects(compileToei({ ...defaults, archive: path, ...changes }), expected)
  const feed = await inspectFeed(path)
  assert.deepEqual([...selectServices(feed, '2026-09-07').active].sort(), ['special', 'weekday'])
})

test('CLI audits and writes a complete offline artifact with no secret fields copied', async (t) => {
  const { path, directory } = await archive(t)
  const cli = fileURLToPath(new URL('../scripts/toei.mjs', import.meta.url))
  const auditPath = join(directory, 'report.json')
  const audit = spawnSync(process.execPath, [cli, 'audit', '--archive', path, '--output', auditPath], { encoding: 'utf8' })
  assert.equal(audit.status, 0, audit.stderr)
  assert.equal(JSON.parse(await readFile(auditPath)).routes.length, 1)
  const provenancePath = join(directory, 'provenance.json')
  await writeFile(provenancePath, JSON.stringify({ ...provenance, ODPT_CONSUMER_KEY: 'must-not-be-copied' }))
  const output = join(directory, 'compiled')
  const compile = spawnSync(process.execPath, [cli, 'compile', '--archive', path, '--provenance', provenancePath, '--service-date', defaults.serviceDate, '--route-id', 'DEMO-LOOP', '--output', output], { encoding: 'utf8' })
  assert.equal(compile.status, 0, compile.stderr)
  assert.deepEqual((await readdir(output)).sort(), ['audit.json', 'snapshot.json', 'source-records.json'])
  for (const name of await readdir(output)) assert.ok(!(await readFile(join(output, name), 'utf8')).includes('must-not-be-copied'))
  const invalid = spawnSync(process.execPath, [cli, 'compile', '--arhcive', path], { encoding: 'utf8' })
  assert.notEqual(invalid.status, 0)
})
