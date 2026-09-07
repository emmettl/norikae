# Tokyo source contract

No external transport dataset has been imported. The offline importer is tested with authored fixtures. The [canonical feasibility study](https://github.com/emmettl/motionstudies/blob/main/docs/TOKYO.md) contains the research and source links; its findings are dated 6 September 2026 and must be checked again when acquiring data.

## First input

The planned first source is the [Toei static timetable catalogue](https://ckan.odpt.org/dataset/train-toei). Acquire through authorized ODPT access, inspect the downloaded archive and retain its actual terms before compiling. Never put an ODPT key in a `VITE_*` variable: Vite variables are public client configuration.

Keep raw downloads in ignored `sources/` or outside the checkout. Do not commit credentials, raw archives, challenge data or token-bearing URLs. The current importer reads an existing local ZIP and never makes network requests. It does not consume an API key. Authorized downloading remains a separate step until the real endpoint and feed have been inspected.

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

The public preview uses authored colors, text, synthetic geometry and invented departures. It includes no official operator logo, map, route badge or operator source data. Its separate [preview builder](PLAYER.md) accepts only authored fixture inputs; the importer commands below still do not publish their output.

## Offline workflow

Prerequisites: Node 22.12+, `npm ci`, and `unzip` on PATH. macOS supplies `unzip`; Ubuntu CI also includes it. Tests and the synthetic example additionally need `zip`.

1. Place the authorized static GTFS archive at `sources/toei.zip`.
2. Inventory the actual archive and inspect its routes, feed validity, calendars, table counts, columns and optional-table omissions:

   ```sh
   npm run data:toei:audit -- --archive sources/toei.zip --output sources/toei-audit.json
   ```

3. Create `sources/toei-source.json` from the acquisition record. These are the required fields; replace the retrieval-time marker with the actual UTC time and confirm the dataset-specific credit and licence:

   ```json
   {
     "kind": "operator-feed",
     "publisher": "Bureau of Transportation, Tokyo Metropolitan Government",
     "sourceUrl": "https://ckan.odpt.org/dataset/train-toei",
     "retrievedAt": "REPLACE_WITH_ACTUAL_UTC_ISO_TIMESTAMP",
     "license": "CC-BY-4.0",
     "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
     "attribution": "Bureau of Transportation, Tokyo Metropolitan Government / Association for Open Data of Public Transportation"
   }
   ```

   Use a credential-free dataset URL. Query strings, fragments and URL credentials are rejected. The input archive's SHA-256 is computed directly; no timestamp or source claim is guessed by the importer.

4. Select the actual Oedo/crossing-line IDs from the audit. Pass each as a repeated `--route-id`; no operator ID or line-name matching heuristic is built in. For example, after replacing the date and ID markers:

   ```sh
   npm run data:toei:compile -- \
     --archive sources/toei.zip \
     --provenance sources/toei-source.json \
     --service-date YYYY-MM-DD \
     --route-id ACTUAL_OEDO_ROUTE_ID \
     --window-start 07:00:00 --window-end 09:00:00 \
     --output sources/compiled/toei-morning
   ```

All selected routes must be subway routes with a resolved `Asia/Tokyo` agency and at least one trip in the window. Start with a single route during feed inspection, then add the verified crossing routes.

The output directory contains:

| File | Purpose |
| --- | --- |
| `snapshot.json` | Compact shared `NetworkSnapshot` for a future renderer, with provenance and source geometry. |
| `source-records.json` | Namespaced route/trip/stop identities, source IDs, canonical labels, parent-station references, direction and supported translations. |
| `audit.json` | Archive inventory, service selection, loop/geometry counts, diagnostic flags and snapshot gzip size against the 100 KiB target. |

The `train.route` field is a namespaced identity; use `source-records.json` to resolve the display name when integrating route controls. Original Japanese names stay in snapshot stops. Namespaces contain the full archive hash, so reusing a raw ID in a new release cannot collide. A byte-identical input archive with identical options produces deterministic output. The gzip metric covers the compact snapshot without its trailing file newline, not sidecars or JavaScript/CSS.

Compilation does not copy anything into `public/` and does not trigger deployment. The audit is a source-inspection aid, not a complete GTFS conformance validator or a publication approval.

## Supported scope and deliberate stops

- Both calendar-only and calendar_dates-only feeds work; exceptions override regular service. A provided feed_info validity range is enforced. The selected date remains the civil date that starts the **service day**. `24:10:00` stays 87,000 seconds into that day; to study it, request a window such as `24:00:00`–`25:00:00`.
- Trips are selected by intersection with `[window-start, window-end)` and retain their full stop sequence, including portions outside the opening window. Calls are ordered by `stop_sequence`; times, references, coordinates and duplicate identities are checked.
- Blank or estimated (`timepoint=0`) times and active frequency-template trips stop compilation. Expanding frequency service or interpolating missing times requires a separate evidence decision; these trips are never silently dropped or treated as exact departures.
- Complete source distances locate calls along the shape. Otherwise, monotonic forward projection is allowed within 200 metres and reported separately. This is a geometric approximation, not a measured track/elevation claim. Repeated stations retain sequence identity so a loop cannot jump back to its origin prematurely. Non-advancing or ambiguous degenerate segments stop compilation for inspection.
- Missing or unmatched shapes stop compilation by default. `--allow-straight-lines` permits a **diagnostic** stop-to-stop chord artifact and records every fallback trip. Those segments never count as matched source geometry. Malformed shape coordinates/sequences still fail. No external geometry source is fetched or inferred.
- Standard `translations.txt` stop/route name entries are preserved by `record_id` or `field_value`. Other translations and GTFS-JP extension tables are inventoried for later adapter work. Parent station IDs are retained as references; station complexes, transfer durations, through-running and vertical levels are not inferred.
- Input tables must be root-level `.txt` ZIP members, as in standard GTFS. Optional missing tables are recorded. The shared CSV reader handles BOM, quoted commas and escaped quotes; this adapter does not extend it to multiline CSV fields. Header-only tables report zero rows and an empty column list.

## Try it before operator access

From the repository root:

```sh
mkdir -p sources
(cd tests/fixtures/toei && zip -q ../../../sources/synthetic-toei.zip ./*.txt)
npm run data:toei:audit -- --archive sources/synthetic-toei.zip
npm run data:toei:compile -- \
  --archive sources/synthetic-toei.zip \
  --provenance tests/fixtures/toei/provenance.json \
  --service-date 2026-09-07 --route-id DEMO-LOOP \
  --output sources/compiled/synthetic-toei
```

This produces two invented morning trips around a test square and labels the snapshot `SYNTHETIC FIXTURE`. It does not reproduce any Toei timetable or railway geometry. Run `npm test` for the full regression suite, including the shared core's playback interpretation of the output.

GTFS field semantics follow the [official Schedule Reference](https://gtfs.org/documentation/schedule/reference/). Real-feed conformance, exact Toei route IDs and any GTFS-JP extensions remain to be inspected when the authorized archive is available.
