import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { applyVisualTheme } from '@motionstudies/web/visual-theme'
import { theme, study } from './edition'
import { Player } from './Player'
import './style.css'

applyVisualTheme(theme)
document.documentElement.dataset.edition = study.id
const root = document.getElementById('root')
if (!root) throw new Error('NORIKAE requires #root')
createRoot(root).render(<StrictMode><Player /></StrictMode>)
