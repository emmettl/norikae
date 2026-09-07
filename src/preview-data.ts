import type { NetworkSnapshot } from '@motionstudies/core/domain/network'

export interface PreviewData {
  kind: 'synthetic-fixture'
  snapshot: NetworkSnapshot
  records: {
    provenance: { kind: 'synthetic-fixture' }
    routes: readonly { id: string; sourceId: string; name: string }[]
    translations: readonly { id: string; field: string; language: string; text: string }[]
  }
}

export function parsePreview(value: unknown): PreviewData {
  const data = value as PreviewData | undefined
  if (data?.kind !== 'synthetic-fixture' || data.records?.provenance?.kind !== 'synthetic-fixture' || !data.snapshot?.metadata?.model?.includes('SYNTHETIC FIXTURE') || !Array.isArray(data.snapshot.trains) || !data.snapshot.trains.length || !Array.isArray(data.snapshot.stops) || !Array.isArray(data.records.routes) || !Array.isArray(data.records.translations)) {
    throw new Error('The synthetic preview file is missing or invalid.')
  }
  return data
}

export function formatTime(seconds: number): string {
  const value = Math.floor(seconds)
  return `${Math.floor(value / 3600).toString().padStart(2, '0')}:${Math.floor(value / 60 % 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`
}
