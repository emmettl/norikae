# Tokyo source contract

No external transport dataset has been imported in this scaffold. The [canonical feasibility study](https://github.com/emmettl/motionstudies/blob/main/docs/TOKYO.md) contains the research and source links; its findings are dated 6 September 2026 and must be checked again when acquiring data.

## First input

The planned first source is the [Toei static timetable catalogue](https://ckan.odpt.org/dataset/train-toei). Acquire through authorized ODPT access, inspect the downloaded archive and retain its actual terms before compiling. Never put an ODPT key in a `VITE_*` variable: Vite variables are public client configuration.

Keep raw downloads in ignored `sources/` or outside the checkout. Do not commit credentials, raw archives, challenge data or token-bearing URLs. A future offline downloader should accept a host-side `ODPT_CONSUMER_KEY`; no downloader or secret is required to build the current shell.

## Provenance required for a compiled artifact

- Publisher, source dataset URL with credentials removed, release/version and SHA-256.
- Retrieval timestamp and the licence/conditions effective on that date.
- Feed validity and selected service date in `Asia/Tokyo`.
- Window start/end and evidence model: scheduled interpolation, live observation or recorded observation.
- Geometry provenance, matching coverage, missing segments and fallback policy.
- Provider attribution, licence link and a notice identifying modifications.

Use the published `@motionstudies/core/domain/network` contract for the eventual network snapshot. Do not manufacture an empty "valid" snapshot to satisfy the shell: it currently has no data catalog or fetch operation.

## Semantic checks

Inspect agency, feed_info, routes, trips, stops, stop_times, calendar/calendar_dates and any shapes, translations, transfers, pathways, levels, attributions or GTFS-JP extensions actually present. Optional tables must not be presumed to exist.

Namespace IDs by publisher and release. Preserve canonical Japanese names. A shared name or nearby coordinate can suggest a station complex but cannot establish a timed transfer. A visual line crossing cannot establish a physical level. Join through-running services only with stable source identity. Do not synthesize Yamanote frequency from infrastructure geometry.

The public shell uses authored colors and text only. It includes no official operator logo, map, route badge or source data.
