import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { buildRouteIndex, buildStationIndex, type StationIndexEntry, type NetworkSnapshot } from '@motionstudies/core/domain/network'
import { foldSearchText } from '@motionstudies/core/search-text'
import type { MapCameraCommand } from '@motionstudies/three/NationalNetworkScene'
import { createDataUrlResolver } from '@motionstudies/web/data-url'
import { identity } from './edition'
import { formatTime, parsePreview, type PreviewData } from './preview-data'

const Scene = lazy(() => import('@motionstudies/three/NationalNetworkScene').then(({ NationalNetworkScene }) => ({ default: NationalNetworkScene })))
const dataUrl = createDataUrlResolver(`${import.meta.env.BASE_URL}data`)
const framing = { homeDistanceScale: 1.1, minimumDistanceScale: 0.08, stationLabelHeightScale: 1.1 }

function hasWebGL(): boolean {
  try {
    const context = document.createElement('canvas').getContext('webgl2')
    context?.getExtension('WEBGL_lose_context')?.loseContext()
    return Boolean(context)
  } catch { return false }
}

class SceneBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onError() }
  render() { return this.state.failed ? null : this.props.children }
}

export function Player() {
  const [data, setData] = useState<PreviewData>()
  const [loadError, setLoadError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(30)
  const [language, setLanguage] = useState<'en' | 'ja'>('en')
  const [query, setQuery] = useState('')
  const [routeId, setRouteId] = useState('')
  const [stopId, setStopId] = useState('')
  const [camera, setCamera] = useState<MapCameraCommand>({ id: 0, action: 'reset' })
  const [graphicsAvailable, setGraphicsAvailable] = useState(hasWebGL)
  const [reducedMotion, setReducedMotion] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [compact, setCompact] = useState(() => matchMedia('(max-width: 700px)').matches)

  useEffect(() => {
    const controller = new AbortController()
    setLoadError(false)
    fetch(dataUrl('synthetic-preview.json'), { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error('Preview unavailable'); return response.json() })
      .then(parsePreview)
      .then((value) => { if (!controller.signal.aborted) { setData(value); setTime(value.snapshot.metadata.focusTime) } })
      .catch(() => { if (!controller.signal.aborted) setLoadError(true) })
    return () => controller.abort()
  }, [attempt])

  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)')
    const viewport = matchMedia('(max-width: 700px)')
    const resized = () => setCompact(viewport.matches)
    const changed = () => { setReducedMotion(preference.matches); if (preference.matches) setPlaying(false) }
    const hidden = () => { if (document.hidden) setPlaying(false) }
    preference.addEventListener('change', changed)
    viewport.addEventListener('change', resized)
    document.addEventListener('visibilitychange', hidden)
    return () => { preference.removeEventListener('change', changed); viewport.removeEventListener('change', resized); document.removeEventListener('visibilitychange', hidden) }
  }, [])

  const translate = useCallback((id: string, field: string, fallback: string) => {
    if (language === 'ja') return fallback
    return data?.records.translations.find((entry) => entry.id === id && entry.field === field && entry.language === 'en')?.text ?? fallback
  }, [data, language])
  const snapshot = useMemo<NetworkSnapshot | undefined>(() => data && ({
    ...data.snapshot,
    stops: data.snapshot.stops.map((stop) => [stop[0], stop[1], translate(stop[4] ?? '', 'stop_name', stop[2]), stop[3], stop[4], stop[5]]),
  }), [data, translate])
  const routes = useMemo(() => snapshot ? buildRouteIndex(snapshot) : [], [snapshot])
  // A wider viewport envelope fits the full crossing on phones without altering
  // the compiled coordinates or moving any synthetic station.
  const reference = useMemo(() => {
    if (!snapshot || !compact) return snapshot
    const padding = (snapshot.bounds.maxLongitude - snapshot.bounds.minLongitude) * 0.35
    return { ...snapshot, bounds: { ...snapshot.bounds, minLongitude: snapshot.bounds.minLongitude - padding, maxLongitude: snapshot.bounds.maxLongitude + padding } }
  }, [snapshot, compact])
  const stations = useMemo(() => snapshot ? buildStationIndex(snapshot) : [], [snapshot])
  const selectedRoute = routes.find((route) => route.name === routeId)
  const visibleSnapshot = useMemo(() => snapshot && selectedRoute ? { ...snapshot, trains: snapshot.trains.filter((train) => train.route === selectedRoute.name) } : snapshot, [snapshot, selectedRoute])
  const visibleStations = useMemo(() => stations.filter((station) => !selectedRoute || station.routes.some((route) => route.name === routeId)), [stations, routeId, selectedRoute])
  const selectedStation = visibleStations.find((station) => station.stopIndexes.some((index) => snapshot?.stops[index][4] === stopId))
  const routeName = (id: string) => {
    const route = data?.records.routes.find((record) => record.id === id)
    return route ? translate(id, 'route_long_name', route.name) : id
  }
  const colors = useMemo(() => Object.fromEntries(data?.records.routes.map((route) => [route.id, route.sourceId === 'DEMO-LOOP' ? '#f064b2' : '#65d9e7']) ?? []), [data])
  const matches = visibleStations.filter((station) => {
    const ids = station.stopIndexes.map((index) => data?.snapshot.stops[index][4])
    const sourceNames = station.stopIndexes.map((index) => data?.snapshot.stops[index][2])
    const translated = data?.records.translations.filter((entry) => ids.includes(entry.id)).map((entry) => entry.text) ?? []
    return foldSearchText([station.name, ...sourceNames, ...translated].join(' ')).includes(foldSearchText(query.trim()))
  })
  const selectStation = (station: StationIndexEntry) => {
    setStopId(snapshot?.stops[station.stopIndexes[0]][4] ?? '')
    if (!reducedMotion) setCamera((current) => ({ id: current.id + 1, action: 'reveal-station', distanceScale: 0.38 }))
  }
  const toggle = () => {
    if (!snapshot || !graphicsAvailable) return
    if (time >= snapshot.metadata.windowEnd) setTime(snapshot.metadata.windowStart)
    setPlaying((value) => !value)
  }
  const failGraphics = useCallback(() => { setGraphicsAvailable(false); setPlaying(false) }, [])
  const countableTrains = useMemo(() => {
    const stationTrainIds = selectedStation ? new Set(selectedStation.trainIds) : undefined
    return visibleSnapshot?.trains.filter((train) => !stationTrainIds || stationTrainIds.has(train.id)) ?? []
  }, [visibleSnapshot, selectedStation])
  const active = countableTrains.filter((train) => train.realtime?.status !== 'cancelled' && time >= train.start && time <= train.end).length

  return (
    <div className="player" data-playing={playing}>
      <header className="masthead">
        <div><a className="series" href="https://emmettl.github.io/motionstudies/">MOTION STUDIES <span aria-hidden="true">↗</span></a><h1>{identity.title}<span lang="ja">乗り換え</span></h1></div>
        <div className="preview-notice"><strong>Synthetic test data</strong><p>Invented lines, stations and schedules.<br />Tokyo source data is still pending.</p></div>
      </header>
      <main className="workspace">
        <section className="viewer" aria-label="Synthetic railway preview">
          <div className="viewer-heading"><div><span className="eyebrow">DEVELOPMENT PREVIEW</span><h2>A loop and a crossing</h2></div><span className="active-count" data-testid="active-count">{active} trains active</span></div>
          <div className="map" role="region" aria-label="Railway map. Press Space to play or pause." tabIndex={0} onKeyDown={(event) => { if (event.target === event.currentTarget && event.code === 'Space') { event.preventDefault(); toggle() } }}>
            {loadError ? <div className="map-message" role="alert"><h3>Preview data could not be loaded</h3><p>Check your connection and try again.</p><button onClick={() => setAttempt((value) => value + 1)}>Retry loading</button></div>
              : !data || !snapshot || !reference || !visibleSnapshot ? <p className="map-message" role="status">Loading synthetic study…</p>
              : !graphicsAvailable ? <div className="map-message" role="status"><h3>3D view unavailable</h3><p>This browser needs WebGL 2. You can still inspect stations and scrub the timetable below.</p></div>
              : <SceneBoundary onError={failGraphics}><Suspense fallback={<p className="map-message" role="status">Loading railway view…</p>}><Scene
                  snapshot={visibleSnapshot} referenceSnapshot={reference} stations={visibleStations}
                  isPlaying={playing} time={time} onTime={setTime} playbackRate={rate}
                  cameraFraming={framing} cameraCommand={camera} trainLabelMode="off"
                  selectedRoute={selectedRoute} selectedStation={selectedStation} onSelectStation={selectStation}
                  routeColors={colors} routeColorMix={1}
                  stationLabelTierLimit={compact ? 0 : undefined}
                /></Suspense></SceneBoundary>}
            <div className="map-tools" aria-label="Map controls">
              <button aria-label="Zoom in" disabled={!data || !graphicsAvailable} onClick={() => setCamera((value) => ({ id: value.id + 1, action: 'zoom-in' }))}>+</button>
              <button aria-label="Zoom out" disabled={!data || !graphicsAvailable} onClick={() => setCamera((value) => ({ id: value.id + 1, action: 'zoom-out' }))}>−</button>
              <button disabled={!data || !graphicsAvailable} onClick={() => { setStopId(''); setCamera((value) => ({ id: value.id + 1, action: 'reset' })) }}>Reset view</button>
            </div>
            <p className="map-caption">Authored test geometry · no real railway positions</p>
          </div>
          <div className="transport" aria-label="Playback controls">
            <div className="transport-top"><button className="play" disabled={!data || !graphicsAvailable || loadError} onClick={toggle}>{playing ? 'Pause' : 'Play'}</button><output className="clock" data-testid="clock" aria-label="Service time">{data ? formatTime(time) : '—:—:—'}<span>JST</span></output><label className="speed">Speed<select aria-label="Playback speed" value={rate} onChange={(event) => setRate(Number(event.target.value))}><option value={1}>1×</option><option value={30}>30×</option><option value={120}>120×</option></select></label></div>
            <label className="timeline"><span className="sr-only">Service time</span><input aria-label="Service time" aria-valuetext={formatTime(time)} type="range" min={snapshot?.metadata.windowStart ?? 0} max={snapshot?.metadata.windowEnd ?? 1} step={1} value={time} disabled={!data || loadError} onChange={(event) => { setPlaying(false); setTime(Number(event.target.value)) }} /></label>
            <div className="timeline-labels"><span>07:00</span><span>{playing ? 'Playing · repeats at 09:00' : 'Paused · scrub to explore'}</span><span>09:00</span></div>
          </div>
        </section>
        <aside className="inspector" aria-label="Explore the fixture">
          <div className="inspector-heading"><h2>Explore</h2><label><span className="sr-only">Station language</span><select aria-label="Station language" value={language} onChange={(event) => setLanguage(event.target.value as 'en' | 'ja')}><option value="en">English</option><option value="ja">日本語</option></select></label></div>
          <fieldset className="route-list"><legend>Route focus</legend><button aria-pressed={!routeId} onClick={() => { setRouteId(''); setStopId('') }}>All lines<span>{data?.records.routes.length ?? '—'}</span></button>{data?.records.routes.map((route) => <button key={route.id} aria-pressed={routeId === route.id} onClick={() => { setRouteId(route.id); setStopId('') }}><span className="route-label"><i style={{ background: colors[route.id] }} aria-hidden="true" />{routeName(route.id)}</span><span aria-hidden="true">↗</span></button>)}</fieldset>
          <label className="search-label" htmlFor="station-search">Find a station</label><input id="station-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="English or 日本語" autoComplete="off" />
          <p className="search-count" aria-live="polite">{data ? `${matches.length} stations` : 'Loading stations…'}</p>
          <ul className="station-list">{matches.map((station) => <li key={station.stopIndexes[0]}><button aria-pressed={station === selectedStation} onClick={() => selectStation(station)}><span>{station.name}</span><span aria-hidden="true">↗</span></button></li>)}</ul>
          {query && !matches.length && data && <p className="empty-search">No matching stations. Try another name or select all lines.</p>}
          {selectedStation && <section className="station-detail" aria-label="Selected station"><div><span className="eyebrow">SELECTED STATION</span><button aria-label="Clear station selection" onClick={() => setStopId('')}>×</button></div><h3>{selectedStation.name}</h3><p>{selectedStation.routes.map((route) => routeName(route.name)).join(' · ')}</p><p>{selectedStation.trainIds.length} scheduled test trips in this study</p></section>}
          <p className="fixture-note">The loop and crossing are separate fictional lines. Their visual intersections do not establish transfers.</p>
          {reducedMotion && <p className="motion-note">Reduced motion is enabled. Playback starts paused; press Play when you want movement.</p>}
        </aside>
      </main>
      <footer><span>A Tokyo motion study · preview fixture dated 7 September 2026</span><a href="https://github.com/emmettl/norikae">Source &amp; development notes ↗</a></footer>
    </div>
  )
}
