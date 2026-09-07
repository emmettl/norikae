import { parseArgs } from 'node:util'
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { inspectFeed, requireValue, selectServices } from './toei/feed.mjs'
import { compileToei } from './toei/compile.mjs'

const HELP = `NORIKAE offline Toei tools (Node 22.12+, unzip on PATH)

Audit a downloaded root-layout GTFS ZIP:
  npm run data:toei:audit -- --archive sources/toei.zip --output sources/toei-audit.json

Compile selected route IDs from that audit:
  npm run data:toei:compile -- --archive sources/toei.zip \\
    --provenance sources/toei-source.json --service-date YYYY-MM-DD \\
    --route-id EXACT_ID --route-id ANOTHER_ID --output sources/compiled/toei

Options:
  --window-start H:MM:SS    Default 07:00:00; hours may exceed 24
  --window-end H:MM:SS      Default 09:00:00; greater than start
  --allow-straight-lines   Diagnostic fallback for missing/unmatched shapes
  --service-date          Required for compile; optional service report for audit
  --output                Audit JSON file or compile directory (defaults under sources/)

No network requests are made. No API key is required by these offline commands.
See docs/DATA.md for the provenance file and supported GTFS scope.
`

async function writeJson(path, value, pretty = true) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${randomUUID()}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, pretty ? 2 : undefined)}\n`, { flag: 'wx' })
  await rename(temporary, path)
}

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      archive: { type: 'string' }, provenance: { type: 'string' },
      'service-date': { type: 'string' }, 'route-id': { type: 'string', multiple: true },
      'window-start': { type: 'string' }, 'window-end': { type: 'string' },
      output: { type: 'string' }, 'allow-straight-lines': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h' },
    },
  })
  if (values.help) {
    console.log(HELP)
  } else {
    const [command] = positionals
    if (positionals.length !== 1 || !['audit', 'compile'].includes(command)) throw new Error('Expected audit or compile; use --help')
    const archive = resolve(requireValue(values.archive, '--archive'))
    if (command === 'audit') {
      const feed = await inspectFeed(archive)
      if (values['service-date']) feed.report.serviceSelection = { date: values['service-date'], timezone: 'Asia/Tokyo', activeServiceIds: [...selectServices(feed, values['service-date']).active].sort() }
      const output = resolve(values.output ?? 'sources/toei-audit.json')
      if (output === archive) throw new Error('Output must not replace the input archive')
      await writeJson(output, feed.report)
      console.log(`Audited ${Object.keys(feed.report.tables).length} tables and ${feed.report.routes.length} routes. Report: ${output}`)
    } else {
      const provenancePath = resolve(requireValue(values.provenance, '--provenance'))
      const output = resolve(values.output ?? 'sources/compiled/toei')
      for (const name of ['snapshot.json', 'source-records.json', 'audit.json']) {
        if ([archive, provenancePath].includes(resolve(output, name))) throw new Error('Output must not replace an input file')
      }
      const result = await compileToei({
        archive, provenance: JSON.parse(await readFile(provenancePath, 'utf8')),
        serviceDate: requireValue(values['service-date'], '--service-date'), routeIds: values['route-id'],
        windowStart: values['window-start'], windowEnd: values['window-end'],
        allowStraightLines: values['allow-straight-lines'],
      })
      await writeJson(resolve(output, 'snapshot.json'), result.snapshot, false)
      await writeJson(resolve(output, 'source-records.json'), result.records)
      await writeJson(resolve(output, 'audit.json'), result.audit)
      console.log(`Compiled ${result.snapshot.trains.length} trips and ${result.snapshot.stops.length} stops. Snapshot gzip: ${result.audit.payload.gzipBytes} bytes. Output: ${output}`)
      if (result.audit.diagnostic) console.log('DIAGNOSTIC: straight stop-to-stop chords are present; this is not a verified railway-geometry artifact.')
      if (!result.audit.payload.withinTarget) console.log('Payload exceeds the 100 KiB gzip opening target; narrow the scope or add chunking before publication.')
    }
  }
} catch (error) {
  console.error(`Toei importer: ${error.message}`)
  process.exitCode = 1
}
