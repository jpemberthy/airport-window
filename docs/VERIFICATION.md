# Release verification

The initial v1.0 handoff was checked on November 17, 2026; the AEP map and MDE revisions were checked on November 18. These checks describe the snapshots, not a commitment to maintain them or a guarantee of future feed coverage.

## v1.3 MDE map — November 18, 2026

- MDE now includes a registered day/night airport map, with runway 01/19, the curved terminal, aprons and 101 taxiway/taxilane polylines. The [map walkthrough](../airports/mde/MAP.md) records sources, exact image prompts, licensing and reproduction steps. The editable OSM source, SVG scaffold and authoring script are included.
- **No shared runtime changes** from v1.2.0: `app/`, `components/`, `lib/`, `db/` and `scripts/` remain identical. MDE's `map` configuration enables the existing renderer and controls. AEP remains the committed default; the running MDE container is built separately.
- **333 unit/integration tests across 40 files** passed, plus lint, typecheck and asset validation. AEP and MDE share the registered-map test suite, covering non-folding meshes, runway alignment, geographic round trips, source taxiway agreement within 0.01 image pixels, high-elevation surface matching and outside/stale traffic. These numerical checks are distinct from visual artwork alignment.
- The geographic runway and taxiway paths were overlaid on the day painting for visual review. Both delivered WebPs are 1672×941. Day/night, phone/desktop and adverse-weather screenshots were reviewed. The pack's map/scaffold generator reproduces its outputs byte-for-byte after formatting.
- **13 MDE Playwright scenarios passed**, with the mapless-only scenario skipped. Map cases cover 320px, 390px and 1440px in day/night, rain, fog and snow, along with direct-map links and missing-map-art fallback. The flight scenes, clock, globe, ambience, unavailable feeds and production endpoint checks still pass.
- MDE's Docker production build starts healthy on its existing volume; no database reset or paid requests were needed. AEP's native standalone production build and selected-pack asset check passed after restoring the default selector.
- A live browser check opened map mode with fresh traffic and SKRG weather and no browser errors. That snapshot had five aircraft outside the visible airport area and none in view; synthetic browser fixtures separately verify drawing an aircraft on the map. Sparse ground reception is a coverage limitation, not evidence that the airport is empty.
- AEP's separate local container remains healthy. The original LoganWatch HEAD, branch, Git status and all 266 tracked-file hashes remain unchanged. Dependency versions are unchanged; the audit limitation below records the earlier check.

## v1.2 MDE portability check — November 18, 2026

- Added **MDE / SKRG**, José María Córdova in Rionegro serving Medellín, with a 7,024 ft airport elevation, `America/Bogota` time zone, verified airport metadata and ten original day/night illustrations. [Pack, sources and run instructions](../airports/mde/README.md); [full artwork prompts](../airports/mde/ARTWORK.md).
- **No shared runtime-core files changed from v1.1.0:** `app/`, `components/`, `lib/`, `db/` and `scripts/` remain identical. Selecting the new pack in `airport.config.ts` was sufficient to build and run MDE. The committed selector remains AEP; MDE has its own built image, port and SQLite volume.
- **328 unit/integration tests across 40 files** passed. Pack checks now exercise Boston, AEP, MDE and the synthetic highland airport. They verify provider coordinates, weather filtering, height-relative flight phases, local daylight/time, route matching, globe identity and optional capabilities. MDE additionally checks Colombia's UTC−5 clock in January and July and rejects EOH/SKMD routes as MDE routes.
- Lint, TypeScript and selected-pack asset validation passed. MDE's Docker production build and AEP's native standalone production build passed. All ten MDE WebPs are 1672×941; their day/night pairs and phone/desktop screenshots were visually reviewed.
- MDE: **9 Playwright scenarios passed**, with the five map-only scenarios deliberately skipped. All five phases were checked by day, dusk and night at 390px and 1440px, plus rain/fog/snow, nearby controls, ambience, unavailable feeds, labels, clock, globe and production-only boundaries. An explicit map URL falls back to flight scenes when the pack has no map. Image checks wait for the selected lighting and image decoding before capture.
- AEP: **13 Playwright scenarios passed**, with the mapless-only scenario skipped. Its scenes, registered map, optional controls and direct-map links still work. Both AEP and MDE containers run independently and report their own airport from `/api/health`.
- A fresh MDE installation started without `.env` or provider credentials. Its database retained a verification row across restart; expired-payload cleanup passed and test rows were removed. No paid route credits were used. The MDE and AEP volume names differ.
- Live checks returned nearby aircraft from both free position providers and an SKRG METAR. The MDE production container returned fresh traffic and weather, and the live browser rendered three inferred flight moments without browser errors at the review snapshot. Live screenshots were checked at 1440px, 390px and 320px. Counts change with traffic and reception.
- MDE intentionally has **no registered map or tower feed**; paid routes remain off. The 20 NM geographic feed includes EOH and passing traffic. Height above airport elevation is not terrain clearance. Synthetic browser fixtures do not establish live coverage, and snow is a renderer stress test.
- The original LoganWatch workspace's HEAD, branch, status and all 266 tracked-file hashes remain unchanged. This revision changes release-version metadata only in the lockfile; dependency versions and the earlier audit limitation below are unchanged.

## v1.1 AEP map revision — November 18, 2026

- 323 unit/integration tests across 40 files, including physical runway registration, non-folding mesh, geographic round trips, taxiway agreement with the bundled OSM source, outside/stale traffic, and surface alignment at 18 ft and 8,500 ft airport elevation. Boston regressions and the mapless synthetic third airport still pass.
- Lint, TypeScript, asset validation and standalone production build passed; the Docker image was rebuilt and started healthy on the existing AEP database volume.
- 12 Playwright scenarios passed. Map views were checked at 320px, 390px and 1440px in day/night, rain, fog and snow. Tests include navigation-control bounds, direct map-link behavior, unavailable-artwork fallback, and the existing flight-scene/optional-audio/feed checks.
- Source runway and taxiway lines were overlaid on the day painting for visual alignment review. Day/night map screenshots were reviewed alongside the phone crops. Both map assets are 1672×941.
- The map source, image-generation prompts, assets and reproduction instructions are in [the AEP map walkthrough](../airports/aep/MAP.md). The original LoganWatch workspace remains unchanged.

The dependency-audit statement below records the November 17 check; this map revision changes no dependency versions.

## Initial v1.0 automated checks

- 318 unit/integration tests across 39 files: Boston regression behavior, AEP configuration, and a fictional high-altitude airport in Asia/Tokyo.
- TypeScript typecheck and lint.
- Selected-pack asset validation and standalone production builds for AEP, Boston and the fictional third pack, changing only `airport.config.ts` between builds. AEP is the shipped default.
- Docker image built from the lockfile and a new Compose volume with no `.env`, account configuration or paid credentials.
- Container database health, migration initialization, persisted data across restart, and scheduled expired-payload cleanup.
- Seven Playwright browser scenarios against the production container: all five phases by day/night at 390px and 1440px; rain/fog/snow at both sizes; optional map/radio omission; user-started ambience; nearby controls; unavailable feeds; and development/operations endpoint boundaries. Images were checked after settling animation, with no horizontal overflow or browser exceptions in the phase runs.

Automated checks use local fixtures, including synthetic flights and representative archived public METAR observations. The source release contains no captured production database or personal viewing coordinates. Tests make no paid provider requests.

## Repeat the browser check

```sh
AIRPORT_PORT=4317 docker compose -p airport-window-check up --build -d --wait
npx playwright install chromium
npm run test:browser
```

Alternatively set `AIRPORT_BROWSER_PATH` to a local Chromium/Chrome executable. `AIRPORT_TEST_URL` overrides the default `http://127.0.0.1:4317`. Screenshots and failure traces go in ignored `.context/`. The browser suite reads `airport.config.ts`; the running server must have been built with the same selected pack. It uses synthetic responses and does not establish real provider coverage. The day/night fixture times work for AEP and MDE; dusk is calculated from the selected airport's sunset. Adapt day/night times for other time zones.

For MDE, select it and follow its [run instructions](../airports/mde/README.md), then run `AIRPORT_TEST_URL=http://127.0.0.1:4318 npm run test:browser`. Keep the selector on MDE until the test completes; afterward it can be returned to AEP without changing the already-built MDE container.

## Live spot check

Both ADSB.lol and adsb.fi returned aircraft around AEP, and NOAA returned a SABE report. Providers were checked from the development host; container endpoints were also inspected. Recheck from the eventual deployment network and over time. Low-level coverage, tower availability and exact route coverage are not guaranteed.

## Dependency audit limitation

Dependencies were upgraded in this release, including React, Vinext, Vite and the test tooling. The inherited critical advisories were removed. At release, `npm audit` still reports **11 high-severity dependency entries arising from one underlying advisory**, [GHSA-fc5q-39xc-vjpf / CVE-2026-112366](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), in `picomatch` and its dependent packages. The advisory lists no patched version as of this check.

The issue involves malicious glob patterns causing excessive regular-expression work. Airport Window has no user-facing glob-pattern input; this is not a full security audit or proof that every framework path is unaffected. Keep development tools private, do not build untrusted airport-pack code, and revisit the dependency when a fix is available. A compatible `fflate` patch is pinned through the package override. No audit results are suppressed, and this snapshot is not represented as vulnerability-free.

## Separation from LoganWatch

Release work occurred in an independent repository. The original workspace's HEAD, branch, Git status and SHA-256 hashes of all 266 tracked files were compared with the initial baseline and remained unchanged. Production hosting, DNS, databases and credentials were not used or modified.
