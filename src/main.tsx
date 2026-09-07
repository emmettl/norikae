import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { applyVisualTheme } from '@motionstudies/web/visual-theme'
import { identity, study, theme } from './edition'
import './style.css'

applyVisualTheme(theme)
document.documentElement.dataset.edition = study.id
const root = document.getElementById('root')
if (!root) throw new Error('NORIKAE requires #root')

function App() {
  return (
    <div className="page">
      <header>
        <a className="series" href="https://emmettl.github.io/motionstudies/">Motion Studies <span aria-hidden="true">↗</span></a>
        <span className="phase">In development</span>
      </header>
      <main>
        <section className="introduction" aria-labelledby="title">
          <p className="place"><span lang="ja">東京</span> / TOKYO</p>
          <h1 id="title">{identity.title}</h1>
          <div className="subtitle"><p>{identity.descriptor}</p><span lang="ja">乗り換え</span></div>
          <p className="thesis">A city read through its railways.<br />Changes of line, level and operator.</p>
        </section>
        <section className="proof" aria-labelledby="proof-title">
          <div className="proof-heading">
            <div><p className="eyebrow">FIRST PLANNED STUDY · {study.proof}</p><h2 id="proof-title">The loop &amp; the crossings</h2></div>
            <p className="window">07:00–09:00 <span>JST</span></p>
          </div>
          <div className="proof-body">
            <ul className="lines" aria-label="Planned Toei subway lines">
              {study.lines.map((line) => (
                <li key={line.name} style={{ borderLeftColor: line.color }}>
                  <div><strong>{line.name}</strong><span lang="ja">{line.japanese}</span></div>
                  <span className="role">{line.role}</span>
                </li>
              ))}
            </ul>
            <div className="status">
              <span className="status-label">Awaiting source data</span>
              <p>The first proof will follow a weekday morning on the Toei subway network, built from a dated timetable.</p>
              <p>No train movements are displayed yet. Source acquisition, geometry checks and the first compiled study come next.</p>
              <a href="https://github.com/emmettl/norikae/blob/main/docs/ROADMAP.md">Follow the study <span aria-hidden="true">↗</span></a>
            </div>
          </div>
        </section>
      </main>
      <footer><span>Tokyo · {study.timezone} · Unnumbered study</span><a href="https://github.com/emmettl/norikae">Source on GitHub <span aria-hidden="true">↗</span></a></footer>
    </div>
  )
}

createRoot(root).render(<StrictMode><App /></StrictMode>)
