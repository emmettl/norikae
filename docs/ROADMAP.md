# NORIKAE implementation roadmap

Research baseline: [Tokyo feasibility study, 6 September 2026](https://github.com/emmettl/motionstudies/blob/main/docs/TOKYO.md). This roadmap implements that study; it does not change its evidence or catalogue gates.

## Foundation

- [x] Independent edition repository and npm lockfile.
- [x] React/TypeScript/Vite shell with a Tokyo identity and authored theme.
- [x] Published shared-package consumption and import boundary validation.
- [x] Pull-request validation and automatic Pages deployment configuration.
- [x] Explicit public state while no source-backed motion exists.

## Offline tooling

- [x] ZIP table inventory, route discovery, source fingerprint and service coverage report.
- [x] Explicit route/service-day compiler using published shared data primitives.
- [x] Namespace identifiers; preserve Japanese names and standard source translations.
- [x] Segment source shapes with forward loop progression and explicit diagnostic fallbacks.
- [x] Write a deterministic network snapshot, source records and payload/geometry audit.
- [x] Test calendar variants, exceptions, overnight calls, loop closure, invalid inputs and the CLI in CI.

These are tested importer capabilities, not evidence that the real Toei feed has passed inspection. It has not yet been obtained.

## TOK 0A — Toei morning proof

- [ ] Obtain authorized ODPT access and the current Toei static GTFS/GTFS-JP archive.
- [ ] Record source provenance, SHA-256, retrieval time, licence and feed validity.
- [ ] Inventory optional tables before choosing transfer, translation and geometry behavior.
- [ ] Choose a normal weekday inside the feed's validity and compile 07:00–09:00 Asia/Tokyo.
- [ ] Use publisher/release-namespaced source IDs; preserve Japanese labels and source translations.
- [ ] Validate Oedo loop closure, direction, dwell times and service times beyond 24:00.
- [ ] Audit feed shapes; record every fallback and match coverage if external geometry is necessary.
- [ ] Add the shared 3D renderer, deterministic scheduled playback and route isolation.
- [ ] Add Japanese/English station search without deriving identity from transliteration.
- [ ] Publish provenance and modification notices with the compiled artifact.
- [ ] Check mobile density, keyboard access, reduced motion and compressed opening payload.

Opening target: no more than 100 KiB gzip for timetable/geography, excluding JavaScript and CSS. Full-day playback, live positions and detailed station geometry are later, separately loaded layers.

## Later proofs

TOK 0B adds a bounded central multi-operator composition after the Tokyo Metro publication and historical-retention questions are answered. Keep operator change, transfer evidence and through-running separate.

TOK 0C explores the Yamanote rhythm only when a durable data path exists. Challenge-only JR/private-operator data are not part of the permanent site. No catalogue number is assigned until the canonical study's admission criteria pass.
