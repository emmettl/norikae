import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'

test('builds a deterministic, labelled preview only from authored fixture sources', async () => {
  execFileSync(process.execPath, ['scripts/build-synthetic-preview.mjs'], { env: { ...process.env, TZ: 'Asia/Tokyo' } })
  const first = await readFile('public/data/synthetic-preview.json', 'utf8')
  execFileSync(process.execPath, ['scripts/build-synthetic-preview.mjs'], { env: { ...process.env, TZ: 'America/New_York' } })
  assert.equal(await readFile('public/data/synthetic-preview.json', 'utf8'), first)
  const data = JSON.parse(first)
  assert.equal(data.kind, 'synthetic-fixture')
  assert.equal(data.records.provenance.kind, 'synthetic-fixture')
  assert.match(data.snapshot.metadata.model, /SYNTHETIC FIXTURE/)
  assert.equal(data.snapshot.trains.length, 65)
  assert.equal(data.snapshot.stops.length, 7)
  assert.equal(data.records.routes.length, 2)
  assert.ok(data.records.routes.every((route) => route.sourceId.startsWith('DEMO-')))
  assert.ok(gzipSync(first).byteLength < 102400)
  for (const stop of data.snapshot.stops) {
    assert.ok(data.records.translations.some((entry) => entry.id === stop[4] && entry.language === 'en'))
  }
})
