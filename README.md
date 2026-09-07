# NORIKAE

**A Tokyo motion study** · Part of [Motion Studies](https://github.com/emmettl/motionstudies).

[![Validate](https://github.com/emmettl/norikae/actions/workflows/ci.yml/badge.svg)](https://github.com/emmettl/norikae/actions/workflows/ci.yml)
[![Pages](https://github.com/emmettl/norikae/actions/workflows/pages.yml/badge.svg)](https://github.com/emmettl/norikae/actions/workflows/pages.yml)

**Site:** https://emmettl.github.io/norikae/

Tokyo read through changes of line, level, service pattern and operator. NORIKAE begins with **TOK 0A**, a bounded Toei proof around the Oedo loop and the Asakusa, Mita and Shinjuku crossings, on a weekday 07:00–09:00 JST service window.

## Current state

This repository contains the edition shell, authored theme, shared-package integration, validation and GitHub Pages deployment. The published page explicitly reports that source data have not been acquired. It contains no timetable, map geometry, simulated train positions or live feed. The edition remains unnumbered.

The [Tokyo feasibility study](https://github.com/emmettl/motionstudies/blob/main/docs/TOKYO.md) remains the canonical research record. Local implementation work is tracked in [docs/ROADMAP.md](docs/ROADMAP.md), with the source contract in [docs/DATA.md](docs/DATA.md).

## Development

Node 22.12 or newer, npm:

```sh
npm ci
npm run dev
npm run check
```

Vite prints the local URL, including the `/norikae/` base path. `npm run check` runs lint, the shared-package boundary check, TypeScript and the production build. `npm run preview` serves `dist` for a production smoke check.

## Ownership

- This repository owns the Tokyo identity, composition, source adapters, fixtures and publication decisions.
- `@motionstudies/core` and `@motionstudies/web` are consumed as exact npm releases with a committed lockfile. The shell uses the public identity/theme contracts and theme application helper.
- Add `@motionstudies/data` and `@motionstudies/three` when the compiler and renderer actually need them; extend the boundary check at the same time.
- Shared engines, reusable browser controls and generic data machinery belong in [motionstudies](https://github.com/emmettl/motionstudies). Do not vendor that source or import sibling checkouts.

The boundary check verifies exact registry versions, package integrity, public exports and repository-local imports. There are no application tests yet because the initial page is static; add meaningful tests with the first source adapter and playback behavior.

## Publishing

GitHub Actions validates pull requests. A push to `main` validates, builds and deploys the static `dist` artifact to GitHub Pages. Pages uses GitHub Actions as its build source and the `github-pages` environment. No deployment secret or external hosting account is required.

The public build currently contains application code only. Source acquisition is an offline step: credentials, raw archives and recorded feeds do not belong in the web bundle or repository. No refresh schedule is enabled before an approved source pipeline exists.
