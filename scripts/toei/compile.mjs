import { gzipSync } from 'node:zlib'
import { rowsFromArchive, transportModeForRouteType } from '@motionstudies/data/gtfs'
import { inspectFeed, selectServices, requireValue, validateProvenance, time, number, unique } from './feed.mjs'
import { coordinate, prepareShape, tripGeometry } from './geometry.mjs'

const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0

export async function compileToei(options) {
  const provenance = validateProvenance(options.provenance)
  const start = time(options.windowStart ?? '07:00:00', 'window start')
  const end = time(options.windowEnd ?? '09:00:00', 'window end')
  if (end <= start) throw new Error('Window end must be after start; use hours beyond 24 for overnight windows')
  if (!options.routeIds?.length || new Set(options.routeIds).size !== options.routeIds.length) throw new Error('Select one or more distinct route IDs from the audit')
  const feed = await inspectFeed(options.archive)
  const services = selectServices(feed, options.serviceDate)
  const allRoutes = unique(feed.retained['routes.txt'], 'route_id', 'routes')
  const agencies = feed.retained['agency.txt']
  const agencyIds = new Set()
  for (const row of agencies) {
    if ((!row.agency_id && agencies.length > 1) || agencyIds.has(row.agency_id ?? '')) throw new Error('Missing or duplicate agency ID')
    agencyIds.add(row.agency_id ?? '')
  }
  const routes = new Map()
  for (const id of [...options.routeIds].sort(compare)) {
    const route = allRoutes.get(id)
    if (!route) throw new Error(`Unknown selected route ID: ${id}`)
    if (!route.route_type || transportModeForRouteType(route.route_type) !== 'metro') throw new Error(`Selected route ${id} is not a subway route`)
    const agency = route.agency_id ? agencies.find((item) => item.agency_id === route.agency_id) : agencies.length === 1 ? agencies[0] : undefined
    if (!agency) throw new Error(`Cannot resolve agency for route ${id}`)
    if (agency.agency_timezone !== 'Asia/Tokyo') throw new Error('Selected route agency must use Asia/Tokyo')
    requireValue(route.route_long_name || route.route_short_name, `route ${id} name`)
    routes.set(id, route)
  }

  const trips = new Map()
  const seenTrips = new Set()
  for await (const row of rowsFromArchive(feed.archive, 'trips.txt')) {
    const id = requireValue(row.trip_id, 'trips.trip_id')
    if (seenTrips.has(id)) throw new Error(`Duplicate trip ID: ${id}`)
    seenTrips.add(id)
    if (!routes.has(row.route_id)) continue
    if (!services.known.has(row.service_id)) throw new Error(`Unknown service ID for trip ${id}`)
    if (!services.active.has(row.service_id)) continue
    trips.set(id, { ...row, calls: [] })
  }
  if (feed.files.has('frequencies.txt')) {
    for await (const row of rowsFromArchive(feed.archive, 'frequencies.txt')) {
      if (trips.has(row.trip_id)) throw new Error('Selected active trips use frequencies.txt; frequency expansion is not implemented and template trips cannot be published as scheduled departures')
    }
  }
  for await (const row of rowsFromArchive(feed.archive, 'stop_times.txt')) {
    const trip = trips.get(row.trip_id)
    if (!trip) continue
    const sequence = number(row.stop_sequence, 'stop_sequence')
    if (!Number.isInteger(sequence)) throw new Error('stop_sequence must be an integer')
    if (row.timepoint === '0') throw new Error('Selected trips contain estimated stop times (timepoint=0); exact-time proof requires inspection')
    trip.calls.push({
      stopId: requireValue(row.stop_id, 'stop_times.stop_id'), sequence,
      arrival: time(row.arrival_time, 'arrival_time'), departure: time(row.departure_time, 'departure_time'),
      distance: row.shape_dist_traveled === undefined || row.shape_dist_traveled === '' ? null : number(row.shape_dist_traveled, 'stop_times.shape_dist_traveled'),
    })
  }
  const selected = []
  for (const trip of trips.values()) {
    trip.calls.sort((a, b) => a.sequence - b.sequence)
    if (trip.calls.length < 2) throw new Error(`Trip ${trip.trip_id} has fewer than two calls`)
    for (let i = 0; i < trip.calls.length; i++) {
      const call = trip.calls[i]
      const previous = trip.calls[i - 1]
      if (call.arrival > call.departure || (previous && call.arrival < previous.departure)) throw new Error(`Non-monotonic stop times in trip ${trip.trip_id}`)
      if (previous && call.sequence === previous.sequence) throw new Error(`Duplicate stop sequence in trip ${trip.trip_id}`)
      if (previous && call.distance !== null && previous.distance !== null && call.distance < previous.distance) throw new Error(`Decreasing shape distance in trip ${trip.trip_id}`)
    }
    if (trip.calls.at(-1).departure <= trip.calls[0].arrival) throw new Error(`Trip ${trip.trip_id} has no positive duration`)
    // Retain full calls for trips intersecting [start, end), including edge tails.
    if (trip.calls[0].arrival < end && trip.calls.at(-1).departure > start) selected.push(trip)
  }
  selected.sort((a, b) => compare(a.trip_id, b.trip_id))
  if (!selected.length) throw new Error('No scheduled trips intersect the selected service-day window')
  for (const id of routes.keys()) if (!selected.some((trip) => trip.route_id === id)) throw new Error(`Selected route ${id} has no trips in the window`)

  const usedStops = new Set(selected.flatMap((trip) => trip.calls.map((call) => call.stopId)))
  const stops = new Map()
  for await (const row of rowsFromArchive(feed.archive, 'stops.txt')) {
    if (!usedStops.has(row.stop_id)) continue
    if (stops.has(row.stop_id)) throw new Error(`Duplicate selected stop: ${row.stop_id}`)
    if (row.location_type && row.location_type !== '0') throw new Error(`Trip calls at a non-platform stop: ${row.stop_id}`)
    stops.set(row.stop_id, { ...row, point: coordinate(row.stop_lon, row.stop_lat, 'stop') })
    requireValue(row.stop_name, 'stop_name')
  }
  if (stops.size !== usedStops.size) throw new Error('Selected trips reference missing stops')
  const shapeIds = new Set(selected.map((trip) => trip.shape_id).filter(Boolean))
  const shapeRows = new Map()
  if (feed.files.has('shapes.txt')) {
    for await (const row of rowsFromArchive(feed.archive, 'shapes.txt')) {
      if (!shapeIds.has(row.shape_id)) continue
      const rows = shapeRows.get(row.shape_id) ?? []
      rows.push(row)
      shapeRows.set(row.shape_id, rows)
    }
  }
  const shapes = new Map([...shapeRows].map(([id, rows]) => [id, prepareShape(rows)]))
  const namespace = `toei:${feed.report.sourceSha256}`
  const sourceId = (table, id) => `${namespace}:${table}:${encodeURIComponent(id)}`
  const orderedStops = [...stops.values()].sort((a, b) => compare(a.stop_id, b.stop_id))
  const stopIndexes = new Map(orderedStops.map((row, index) => [row.stop_id, index]))
  const paths = []
  const pathIndexes = new Map()
  const edges = []
  const edgePaths = []
  const seenEdges = new Set()
  const geometry = { sourceDistanceTrips: 0, projectedTrips: 0, fallbackTrips: [], maximumGapMetres: 0, matchedSegments: 0, totalSegments: 0 }
  const tripSources = []
  const trains = selected.map((trip) => {
    let resolved
    try {
      resolved = tripGeometry(trip.calls, stops, shapes.get(trip.shape_id))
    } catch (error) {
      if (!options.allowStraightLines) throw new Error(`Trip ${trip.trip_id}: ${error.message}. Inspect the feed or explicitly use --allow-straight-lines for a diagnostic artifact.`)
      resolved = { paths: trip.calls.slice(1).map((call, i) => [stops.get(trip.calls[i].stopId).point, stops.get(call.stopId).point]), method: 'straight-stop-chord', maximumGapMetres: null }
      geometry.fallbackTrips.push({ tripId: sourceId('trip', trip.trip_id), reason: error.message })
    }
    if (resolved.method === 'source-distance') geometry.sourceDistanceTrips++
    if (resolved.method === 'forward-projection') geometry.projectedTrips++
    geometry.maximumGapMetres = Math.max(geometry.maximumGapMetres, resolved.maximumGapMetres ?? 0)
    const pathSegments = resolved.paths.map((path, i) => {
      const key = JSON.stringify(path)
      let index = pathIndexes.get(key)
      if (index === undefined) { index = paths.length; pathIndexes.set(key, index); paths.push(path) }
      const from = stopIndexes.get(trip.calls[i].stopId)
      const to = stopIndexes.get(trip.calls[i + 1].stopId)
      const edgeKey = JSON.stringify([from, to, index])
      if (!seenEdges.has(edgeKey)) { seenEdges.add(edgeKey); edges.push([from, to]); edgePaths.push(index) }
      geometry.totalSegments++
      if (resolved.method !== 'straight-stop-chord') geometry.matchedSegments++
      return index
    })
    const route = routes.get(trip.route_id)
    tripSources.push({ id: sourceId('trip', trip.trip_id), sourceId: trip.trip_id, routeId: sourceId('route', trip.route_id), serviceId: sourceId('service', trip.service_id), shapeId: trip.shape_id ? sourceId('shape', trip.shape_id) : null, directionId: trip.direction_id || null, geometryMethod: resolved.method })
    return {
      id: sourceId('trip', trip.trip_id), route: sourceId('route', trip.route_id),
      headsign: trip.trip_headsign || stops.get(trip.calls.at(-1).stopId).stop_name,
      shortName: trip.trip_short_name || route.route_short_name || route.route_long_name,
      category: 'metro', mode: 'subway',
      start: trip.calls[0].arrival, end: trip.calls.at(-1).departure,
      stops: trip.calls.map((call) => [stopIndexes.get(call.stopId), call.arrival, call.departure]), pathSegments,
    }
  })

  const translations = []
  if (feed.files.has('translations.txt')) {
    for await (const row of rowsFromArchive(feed.archive, 'translations.txt')) {
      const records = row.table_name === 'stops' && row.field_name === 'stop_name' ? stops
        : row.table_name === 'routes' && ['route_short_name', 'route_long_name'].includes(row.field_name) ? routes : null
      if (!records) continue
      const matches = row.record_id ? [records.get(row.record_id)].filter(Boolean)
        : row.field_value ? [...records.values()].filter((record) => record[row.field_name] === row.field_value) : []
      for (const record of matches) {
        translations.push({ id: sourceId(row.table_name === 'stops' ? 'stop' : 'route', record.stop_id ?? record.route_id), field: row.field_name, language: requireValue(row.language, 'translation language'), text: requireValue(row.translation, 'translation text') })
      }
    }
  }
  translations.sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b)))
  const allPoints = [...orderedStops.map((stop) => stop.point), ...paths.flat()]
  const bounds = allPoints.reduce((b, [x, y]) => ({ minLongitude: Math.min(b.minLongitude, x), maxLongitude: Math.max(b.maxLongitude, x), minLatitude: Math.min(b.minLatitude, y), maxLatitude: Math.max(b.maxLatitude, y) }), { minLongitude: Infinity, maxLongitude: -Infinity, minLatitude: Infinity, maxLatitude: -Infinity })
  const diagnostic = geometry.fallbackTrips.length > 0
  const snapshot = {
    metadata: {
      publisher: provenance.publisher, feedVersion: `sha256:${feed.report.sourceSha256}`,
      serviceDate: options.serviceDate, windowStart: start, windowEnd: end, focusTime: Math.floor((start + end) / 2),
      sourceUrl: provenance.sourceUrl, sourceSha256: feed.report.sourceSha256, retrievedAt: provenance.retrievedAt,
      license: provenance.license, licenseUrl: provenance.licenseUrl,
      model: `${provenance.kind === 'synthetic-fixture' ? 'SYNTHETIC FIXTURE / ' : ''}${diagnostic ? 'DIAGNOSTIC straight-line fallback / ' : ''}scheduled GTFS interpolation; not observed movement`,
      note: `${provenance.attribution}. Modified by NORIKAE: selected service day/routes/window, namespaced IDs and segmented geometry. Full trip calls retained across window boundaries. No transfer, through-running or elevation inference.`,
      modes: ['subway'], localRouteIds: [...routes.keys()].map((id) => sourceId('route', id)),
      geometry: { publisher: provenance.publisher, feedVersion: `sha256:${feed.report.sourceSha256}`, sourceUrl: provenance.sourceUrl, sourceSha256: feed.report.sourceSha256, model: diagnostic ? 'Mixed source geometry and explicitly requested stop-to-stop chords; diagnostic only' : 'GTFS trip shapes; source distances where complete, otherwise forward stop projection within 200m', matchedSegments: geometry.matchedSegments, totalSegments: geometry.totalSegments, resolvedStops: stops.size, totalStops: stops.size },
    },
    bounds,
    stops: orderedStops.map((stop) => [stop.point[0], stop.point[1], stop.stop_name, stop.platform_code || '', sourceId('stop', stop.stop_id)]),
    edges, paths, edgePaths, trains,
  }
  const records = {
    schemaVersion: 1, namespace, provenance, timezone: 'Asia/Tokyo',
    routes: [...routes.values()].map((row) => ({ id: sourceId('route', row.route_id), sourceId: row.route_id, shortName: row.route_short_name || '', name: row.route_long_name || row.route_short_name, agencyId: row.agency_id ? sourceId('agency', row.agency_id) : null, sourceAgencyId: row.agency_id || null })),
    stops: orderedStops.map((row) => ({ id: sourceId('stop', row.stop_id), sourceId: row.stop_id, name: row.stop_name, parentStationId: row.parent_station ? sourceId('stop', row.parent_station) : null })),
    trips: tripSources, translations,
  }
  const snapshotJson = JSON.stringify(snapshot)
  const gzipBytes = gzipSync(snapshotJson).byteLength
  return {
    snapshot, records,
    audit: { ...feed.report, selection: { serviceDate: options.serviceDate, timezone: 'Asia/Tokyo', windowStart: start, windowEnd: end, routeIds: [...routes.keys()], activeServices: [...services.active].sort(compare), trips: trains.length, stops: stops.size, loopTrips: selected.filter((trip) => trip.calls[0].stopId === trip.calls.at(-1).stopId).length }, geometry, diagnostic, payload: { bytes: Buffer.byteLength(snapshotJson), gzipBytes, targetGzipBytes: 102400, withinTarget: gzipBytes <= 102400 }, unsupportedSemantics: ['No frequency expansion or missing/estimated stop-time interpolation', 'Transfers, pathways, levels and through-running are inventoried but not inferred', 'Translations support standard GTFS stops/routes name fields; other extensions remain inventory-only'] },
  }
}
