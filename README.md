# NORIKAE

**A Tokyo motion study** · Part of [Motion Studies](https://github.com/emmettl/motionstudies).

[![Validate](https://github.com/emmettl/norikae/actions/workflows/ci.yml/badge.svg)](https://github.com/emmettl/norikae/actions/workflows/ci.yml)
[![Pages](https://github.com/emmettl/norikae/actions/workflows/pages.yml/badge.svg)](https://github.com/emmettl/norikae/actions/workflows/pages.yml)

**Site:** https://emmettl.github.io/norikae/

Tokyo read through changes of line, level, service pattern and operator. NORIKAE begins with **TOK 0A**, a bounded Toei proof around the Oedo loop and the Asakusa, Mita and Shinjuku crossings, on a weekday 07:00–09:00 JST service window.

## Current state

This repository contains the edition shell, authored theme, shared-package integration, offline GTFS audit/compiler, fixture tests and GitHub Pages deployment. The published page explicitly reports that operator data have not been acquired. It contains no timetable, map geometry, simulated train positions or live feed. The edition remains unnumbered.

The [Tokyo feasibility study](https://github.com/emmettl/motionstudies/blob/main/docs/TOKYO.md) remains the canonical research record. Local implementation work is tracked in [docs/ROADMAP.md](docs/ROADMAP.md), with the source contract in [docs/DATA.md](docs/DATA.md).

## Development

Node 22.12 or newer, npm:

```sh
npm ci
npm run dev
npm run check
```

Vite prints the local URL, including the `/norikae/` base path. `npm run check` runs the importer tests, lint, shared-package boundary check, app TypeScript and production build. `npm run preview` serves `dist` for a production smoke check. Importer commands need `unzip` on PATH; the tests also use `zip` to create temporary archives (available on macOS and the Ubuntu CI runner).

## Offline importer

```sh
npm run data:toei:audit -- --archive sources/toei.zip
npm run data:toei:compile -- --help
```

Start with the audit to discover the actual route IDs and feed coverage. Compilation requires an explicit service date, route IDs and a provenance JSON file. It writes a shared network snapshot, source-label records and audit report under ignored `sources/`; it does not publish them. [The full workflow and supported scope](docs/DATA.md#offline-workflow) include a runnable synthetic example.

## Ownership

- This repository owns the Tokyo identity, composition, source adapters, fixtures and publication decisions.
- `@motionstudies/core`, `@motionstudies/web` and the offline `@motionstudies/data` dependency are consumed as exact npm releases with a committed lockfile. The shell uses public identity/theme contracts; the importer reuses the shared GTFS readers and time primitives.
- Add `@motionstudies/three` when the renderer needs it; extend the boundary check at the same time.
- Shared engines, reusable browser controls and generic data machinery belong in [motionstudies](https://github.com/emmettl/motionstudies). Do not vendor that source or import sibling checkouts.

The boundary check covers source, scripts and tests, verifying exact registry versions, package integrity, public exports and repository-local imports. Importer tests use authored fixtures, including a shared-core playback compatibility check. Real Toei feed compatibility remains to be confirmed after authorized acquisition.

## Publishing

GitHub Actions validates pull requests. A push to `main` validates, builds and deploys the static `dist` artifact to GitHub Pages. Pages uses GitHub Actions as its build source and the `github-pages` environment. No deployment secret or external hosting account is required.

The public build currently contains application code only. Source acquisition is an offline step: credentials, raw archives and recorded feeds do not belong in the web bundle or repository. No refresh schedule is enabled before an approved source pipeline exists.
