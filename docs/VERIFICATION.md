# Release verification

The initial v1.0 handoff was checked on November 17, 2026; the AEP map revision was checked on November 18. These checks describe the snapshots, not a commitment to maintain them or a guarantee of future feed coverage.

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

Alternatively set `AIRPORT_BROWSER_PATH` to a local Chromium/Chrome executable. `AIRPORT_TEST_URL` overrides the default `http://127.0.0.1:4317`. Screenshots and failure traces go in ignored `.context/`. The browser suite exercises the shipped AEP pack with synthetic responses; it does not establish real provider coverage. The default fixture times target AEP day/night.

## Live spot check

Both ADSB.lol and adsb.fi returned aircraft around AEP, and NOAA returned a SABE report. Providers were checked from the development host; container endpoints were also inspected. Recheck from the eventual deployment network and over time. Low-level coverage, tower availability and exact route coverage are not guaranteed.

## Dependency audit limitation

Dependencies were upgraded in this release, including React, Vinext, Vite and the test tooling. The inherited critical advisories were removed. At release, `npm audit` still reports **11 high-severity dependency entries arising from one underlying advisory**, [GHSA-fc5q-39xc-vjpf / CVE-2026-112366](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), in `picomatch` and its dependent packages. The advisory lists no patched version as of this check.

The issue involves malicious glob patterns causing excessive regular-expression work. Airport Window has no user-facing glob-pattern input; this is not a full security audit or proof that every framework path is unaffected. Keep development tools private, do not build untrusted airport-pack code, and revisit the dependency when a fix is available. A compatible `fflate` patch is pinned through the package override. No audit results are suppressed, and this snapshot is not represented as vulnerability-free.

## Separation from LoganWatch

Release work occurred in an independent repository. The original workspace's HEAD, branch, Git status and SHA-256 hashes of all 266 tracked files were compared with the initial baseline and remained unchanged. Production hosting, DNS, databases and credentials were not used or modified.
