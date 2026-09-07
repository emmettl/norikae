import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, writeFile, readdir, rm, mkdir, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compileToei } from './toei/compile.mjs'

// Authored test geometry and departures only. Never accepts an operator archive.
const directory = await mkdtemp(join(tmpdir(), 'norikae-preview-'))
const fixture = new URL('../tests/fixtures/toei/', import.meta.url)
const clock = (seconds) => `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
try {
  const tables = {}
  for (const name of await readdir(fixture)) {
    if (name.endsWith('.txt')) tables[name] = await readFile(new URL(name, fixture), 'utf8')
  }
  tables['routes.txt'] += 'DEMO-CROSS,DEMO,横断,架空横断線,1\n'
  tables['stops.txt'] += 'E,架空西口,35.705,139.695,0,,\nF,架空中点,35.705,139.705,0,,\nG,架空東口,35.705,139.715,0,,\n'
  tables['shapes.txt'] += 'cross,35.705,139.695,0,0\ncross,35.705,139.705,1,1\ncross,35.705,139.715,2,2\n'
  tables['translations.txt'] += 'stops,stop_name,en,Fictional Northeast,C,\nstops,stop_name,en,Fictional Northwest,D,\nstops,stop_name,en,Fictional West Gate,E,\nstops,stop_name,en,Fictional Midpoint,F,\nstops,stop_name,en,Fictional East Gate,G,\nroutes,route_long_name,en,Fictional Crossing,DEMO-CROSS,\n'
  tables['trips.txt'] = 'route_id,service_id,trip_id,trip_headsign,direction_id,shape_id\n'
  tables['stop_times.txt'] = 'trip_id,arrival_time,departure_time,stop_id,stop_sequence,shape_dist_traveled,timepoint\n'
  for (let departure = 6 * 3600 + 40 * 60; departure < 9 * 3600; departure += 4 * 60) {
    for (const [route, shape, stops, spacing] of [
      ['DEMO-LOOP', 'square', ['A', 'B', 'C', 'D', 'A'], 5 * 60],
      ['DEMO-CROSS', 'cross', ['E', 'F', 'G'], 4 * 60],
    ]) {
      const id = `${route}-${departure}`
      tables['trips.txt'] += `${route},weekday,${id},架空試験,0,${shape}\n`
      stops.forEach((stop, index) => {
        const arrival = departure + index * spacing
        const dwell = index === stops.length - 1 ? 0 : 30
        tables['stop_times.txt'] += `${id},${clock(arrival)},${clock(arrival + dwell)},${stop},${index + 1},${index},1\n`
      })
    }
  }
  const names = Object.keys(tables).sort()
  for (const name of names) {
    const path = join(directory, name)
    await writeFile(path, tables[name])
    await utimes(path, new Date('2000-01-01T00:00:00Z'), new Date('2000-01-01T00:00:00Z'))
  }
  const archive = join(directory, 'synthetic.zip')
  execFileSync('zip', ['-q', '-X', archive, ...names], { cwd: directory, env: { ...process.env, TZ: 'UTC' } })
  const provenance = JSON.parse(await readFile(new URL('provenance.json', fixture), 'utf8'))
  if (provenance.kind !== 'synthetic-fixture') throw new Error('Preview build requires the authored synthetic fixture')
  const { snapshot, records } = await compileToei({ archive, provenance, serviceDate: '2026-09-07', routeIds: ['DEMO-LOOP', 'DEMO-CROSS'] })
  snapshot.metadata.focusTime = 7 * 3600 + 5 * 60
  const output = new URL('../public/data/', import.meta.url)
  await mkdir(output, { recursive: true })
  await writeFile(new URL('synthetic-preview.json', output), JSON.stringify({ kind: 'synthetic-fixture', snapshot, records }))
  console.log(`Built synthetic preview: ${snapshot.trains.length} invented trips / ${snapshot.stops.length} stops / 2 fictional lines.`)
} finally {
  await rm(directory, { recursive: true, force: true })
}
