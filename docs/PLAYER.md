# Synthetic development player

The opening page is a development preview, clearly labelled **Synthetic test data**. Its loop, crossing, station names, geometry and 65 departures are invented. The fixture exercises a two-hour service-day window, 07:00–09:00 JST, starting paused at 07:05. It is not a Toei proof or observed Tokyo movement.

## Controls

- Play/pause and literal playback rates of 1×, 30× and 120×. The shared scene owns the animation clock and repeats at the end of the window. Scrubbing pauses playback; playing from 09:00 restarts at 07:00.
- Route focus limits the moving trains and searchable station list to one fictional line. Other line geometry can remain as subdued context.
- Search accepts canonical Japanese names and source English translations in either label language. A selected station keeps its source identity when the language changes.
- Station selection, map dragging, zoom buttons and reset use the shared camera API. On phones, the opening viewport includes extra geographic padding and idle station labels are suppressed; the searchable list remains available.
- Native keyboard controls work for buttons, the time slider, selects and search. Space toggles playback when the map region itself has keyboard focus.
- Playback starts paused for everyone and pauses when the page becomes hidden or reduced-motion preference is enabled. Reduced motion also suppresses automatic station camera reveals and CSS transitions. Pressing Play explicitly opts into train motion. The shared scene's selection/lighting effects remain renderer-owned.
- A failed data request offers Retry. If WebGL 2 is unavailable or the scene fails to render, station inspection and manual timetable scrubbing remain usable.

## Data and package boundary

`npm run data:preview` builds `public/data/synthetic-preview.json` from the authored importer fixture plus a generated fictional crossing and departure pattern. It calls the existing offline compiler, preserves the synthetic provenance marker and uses fixed ZIP timestamps. It runs automatically before `dev` and `build`. The output is ignored by Git; raw ZIPs exist only in a temporary directory and are removed after compilation.

The generator has no operator-archive input. The normal importer continues to write under ignored `sources/`; an operator artifact cannot silently replace this preview. The browser also requires the synthetic marker when loading the file.

The browser resolves the asset under Vite's `/norikae/` base path. `@motionstudies/three/NationalNetworkScene` is lazy loaded. NORIKAE owns the fixture adapter, identity, layout, language choice and control state; interpolation, rendering, camera behavior and scene selection remain in published shared packages. No renderer source is copied into this repository.

Source records retain route IDs and display names separately. Namespaced IDs remain stable through route filtering and station-language changes. Phone framing adjusts only the reference viewport envelope, not compiled coordinates.

## Validation

```sh
npm ci
npm run check
npx playwright install chromium webkit
npm run test:e2e
```

The browser suite serves the existing production `dist` directory on port 4184. Run the build/check first after source changes. Development preview uses its own Vite server and does not interfere with those tests.

Unit tests cover deterministic fixture output across host time zones, provenance markers, translated names, size and importer behavior. Browser tests cover playback, pause/scrub/restart, route focus, bilingual search, selection identity, reduced motion, retry and invalid-data handling, WebGL fallback and doubled text size on desktop Chromium and iPhone WebKit. CI installs the needed browser dependencies and gates validation and Pages publication on these checks.

The next data milestone remains an authorized Toei archive and an inspection of its real shapes, calendars, translations and route IDs. This preview makes those future integration points concrete without claiming real-feed compatibility.
