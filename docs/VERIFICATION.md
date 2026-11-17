# Release verification

The v1 handoff was checked on November 17, 2026. These checks describe this snapshot, not a commitment to maintain it or a guarantee of future feed coverage.

## Automated checks

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
