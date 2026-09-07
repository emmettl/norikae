import { number } from './feed.mjs'

export function coordinate(longitude, latitude, label) {
  return [number(longitude, `${label} longitude`, -180, 180), number(latitude, `${label} latitude`, -90, 90)]
}

function distance(a, b) {
  const x = (a[0] - b[0]) * Math.cos((a[1] + b[1]) * Math.PI / 360)
  return Math.hypot(x, a[1] - b[1]) * 111_195
}

function interpolate(a, b, fraction) {
  return [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction]
}

function pointAt(points, position) {
  const index = Math.min(Math.floor(position), points.length - 2)
  return interpolate(points[index], points[index + 1], position - index)
}

function positionAtDistance(distances, value) {
  if (value < distances[0] || value > distances.at(-1)) throw new Error('Stop shape distance lies outside its shape')
  const index = distances.findIndex((end, i) => i > 0 && end >= value)
  return index - 1 + (value - distances[index - 1]) / (distances[index] - distances[index - 1])
}

function projectForward(points, stop, minimum) {
  let best
  for (let index = Math.floor(minimum); index < points.length - 1; index++) {
    const a = points[index]
    const b = points[index + 1]
    const scale = Math.cos(stop[1] * Math.PI / 180)
    const dx = (b[0] - a[0]) * scale
    const dy = b[1] - a[1]
    const denominator = dx * dx + dy * dy
    if (denominator === 0) continue
    const fraction = Math.max(Math.max(0, minimum - index), Math.min(1, ((stop[0] - a[0]) * scale * dx + (stop[1] - a[1]) * dy) / denominator))
    const point = interpolate(a, b, fraction)
    const gap = distance(point, stop)
    if (!best || gap < best.gap - 0.01) best = { position: index + fraction, gap }
  }
  if (!best) throw new Error('No forward shape segment for stop')
  return best
}

export function prepareShape(rows) {
  const ordered = rows.map((row) => ({
    sequence: number(row.shape_pt_sequence, 'shape_pt_sequence'),
    point: coordinate(row.shape_pt_lon, row.shape_pt_lat, 'shape'),
    distance: row.shape_dist_traveled === undefined || row.shape_dist_traveled === '' ? null : number(row.shape_dist_traveled, 'shape_dist_traveled'),
  })).sort((a, b) => a.sequence - b.sequence)
  if (ordered.length < 2) throw new Error('Shape needs at least two points')
  if (ordered.some((row, i) => !Number.isInteger(row.sequence) || (i > 0 && row.sequence === ordered[i - 1].sequence))) throw new Error('Invalid or duplicate shape sequence')
  const distances = ordered.map((row) => row.distance)
  if (distances.every((value) => value !== null) && distances.some((value, i) => i > 0 && value <= distances[i - 1])) throw new Error('Shape distances must increase strictly')
  return { points: ordered.map((row) => row.point), distances: distances.every((value) => value !== null) ? distances : null }
}

export function tripGeometry(calls, stops, shape, maxGap = 200) {
  if (!shape) throw new Error('Missing trip shape')
  const { points, distances } = shape
  const useDistances = distances && calls.every((call) => call.distance !== null)
  const positions = []
  let previous = 0
  let maximumGap = 0
  for (const call of calls) {
    const stop = stops.get(call.stopId).point
    const match = useDistances
      ? { position: positionAtDistance(distances, call.distance) }
      : projectForward(points, stop, previous)
    const gap = distance(pointAt(points, match.position), stop)
    if (gap > maxGap) throw new Error('Shape is more than 200 metres from a scheduled stop')
    if (match.position < previous) throw new Error('Shape progresses backwards')
    positions.push(match.position)
    previous = match.position
    maximumGap = Math.max(maximumGap, gap)
  }
  const paths = []
  for (let i = 1; i < positions.length; i++) {
    const from = positions[i - 1]
    const to = positions[i]
    if (to <= from) throw new Error('Shape does not advance between calls; loop/dwell needs source distances or feed inspection')
    const path = [pointAt(points, from)]
    for (let j = Math.floor(from) + 1; j < to; j++) path.push(points[j])
    path.push(pointAt(points, to))
    paths.push(path.map((point) => point.map((value) => Math.round(value * 1e6) / 1e6)))
  }
  return { paths, method: useDistances ? 'source-distance' : 'forward-projection', maximumGapMetres: Math.round(maximumGap * 10) / 10 }
}
