import type { MotionStudyIdentity } from '@motionstudies/core/edition'
import type { VisualTheme } from '@motionstudies/core/theme'

export const identity = {
  series: 'Motion Studies',
  catalogueNumber: '', // Unnumbered until the catalogue's source and edition gates pass.
  title: 'NORIKAE',
  placeName: 'Tokyo',
  descriptor: 'A Tokyo motion study',
} as const satisfies MotionStudyIdentity

export const study = {
  id: 'norikae',
  timezone: 'Asia/Tokyo',
  proof: 'TOK 0A',
  window: { start: 7 * 3600, end: 9 * 3600 },
  sourceStatus: 'not-acquired',
  lines: [
    { name: 'Oedo', japanese: '大江戸線', role: 'The loop and its approach', color: '#f064b2' },
    { name: 'Asakusa', japanese: '浅草線', role: 'Crossing line', color: '#f5a467' },
    { name: 'Mita', japanese: '三田線', role: 'Crossing line', color: '#65d9e7' },
    { name: 'Shinjuku', japanese: '新宿線', role: 'Crossing line', color: '#b1df72' },
  ],
} as const

// Authored palette, not official operator marks or route-symbol artwork.
export const theme = {
  background: '#080b12', ink: '#edf2fa', muted: '#a7b0c2', line: '#283144',
  primary: '#65d9e7', secondary: '#f064b2', panel: '#101622',
  air: '#8cbafa', roadLight: '#c8d3e7', roadHeavy: '#a7b0c2',
} as const satisfies VisualTheme
