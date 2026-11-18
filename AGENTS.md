# Instructions for coding agents

Airport Window is an unmaintained, self-hosted source release. Your job is to help the person operating this copy run AEP or build their own airport pack. Finish with a working local URL and clear instructions, not just a plan. The operator owns hosting, costs, updates and troubleshooting; don't direct them to the original author for setup or promise upstream support.

## Work in the right copy

- Confirm your working directory and Git remote before changing files. Reuse the operator's intended Airport Window copy if one exists; otherwise clone it into a new folder. Never overwrite an existing folder to get started.
- Leave LoganWatch and unrelated projects, branches, deployments, domains, databases and credentials untouched. No synchronization or shared runtime dependency is needed.
- The upstream repository is archived. Local clones and independent forks still work. Running or adapting it does not require unarchiving upstream or sending a pull request. Push changes only to the operator's own repository unless the maintainer explicitly requests an upstream change.
- Start locally. A request to try the app is not a request to publish a website, provision hosting or enable paid data.

## First read

Read `README.md` and `airport.config.ts`. For another airport, also read `PORTING.md`, `airports/types.ts`, `airports/template/index.ts` and `docs/ARTWORK.md`. Read `docs/OPERATIONS.md` before deployment or paid features, and `docs/VERIFICATION.md` for existing checks and known limitations.

## If the person just wants AEP

The default is Aeroparque Jorge Newbery in Buenos Aires: **AEP / SABE**, not Ezeiza (EZE / SAEZ). Its flight-scene and registered-map artwork is complete. TV mode offers **Show airport map**; `/?mode=tv&view=map` opens it when fresh data and assets are ready. Don't refactor the app or regenerate its images to launch it.

1. Check for a running copy, available ports, Docker and Compose. Use the existing healthy AEP instance when appropriate. If a prerequisite is missing, explain the specific step the person needs; don't silently install privileged system software. Node 22 LTS (22.13+) or Node 24 LTS is an alternative if already available.
2. From the project directory, run `docker compose up --build -d --wait`. Port 3000 is the default. If it is occupied, choose a free port with `AIRPORT_PORT` instead of stopping another app. Choose a distinct Compose project name with `-p` when another installation exists, and use that name for all later commands. Keep the loopback-only binding for a local preview.
3. Fetch `/api/health`; expect `status: "ok"` and `airport: "SABE"`. Open the homepage and check that it renders without errors. Inspect `/api/traffic` and `/api/weather` for live, stale or unavailable data; a healthy database alone does not prove live feeds work.
4. Open the local URL for the person if your tools allow it. Give the exact URL and stop/restart commands, including any custom port or Compose project name. Explain that sound starts with **Play ambience** and Docker/the host must stay running.

No API keys or `.env` are required for the base app. Don't turn on paid routes to fill empty route labels. Preserve an existing operator's settings and data; don't copy secrets from other projects or print them.

## If the person wants another airport

First check the included packs. **MDE / SKRG** is José María Córdova in Rionegro serving Medellín, not EOH / SKMD. Its scenes and registered map are complete: follow `airports/mde/README.md`, select the pack and run it with its own volume. Do not regenerate its artwork or add radio just to launch it. Boston is also included as a reference. The steps below apply to a new pack.

1. Resolve the airport name/code unambiguously. Look up authoritative identifiers, coordinates, elevation, METAR station and IANA time zone. Record sources; don't guess or treat the template's placeholders as real data.
2. Copy `airports/template` into a new pack. Configure identifiers, branding, coordinates, elevation in feet, radius in nautical miles, weather station, time zone and scene bearing. Select it in `airport.config.ts`. One installation serves one airport. Keep ordinary airport-specific changes in its pack and artwork, not in application components or provider code.
3. Check provider coverage before spending time on artwork: `npm ci`, then `npm run check:pack -- --live`. Temporary AEP image references are allowed for this check only. Check responses, locations and report age, not just HTTP success. An empty airport or a failed request is not evidence that a provider works. Don't run live checks against the fictional test airport. If the included providers cannot cover the real airport, explain that limitation; a new adapter is separate work.
4. Create ten original images: approach, landing, taxi, takeoff and climb, each in matching day/night pairs. Follow `docs/ARTWORK.md` for prompts, 1672×941 dimensions and WebP delivery. Put them in `public/airports/<id>/`, update the pack, and record provenance and applicable notices. If image tools are unavailable, prepare the prompts and asset list and explain what the operator must supply. Never call an airport finished while it still displays AEP's scenery as its own.
5. Omit `tower` and `map` unless the operator has usable, permitted assets. No map is needed for a complete airport. If a map is requested, follow `airports/aep/MAP.md` for the source-geometry, artwork and registration workflow; verify geographic alignment before enabling it. Basic scenery is illustrative, not geographic registration. Keep paid enrichment off unless explicitly requested and configured with the operator's own permissions, token and budget.
6. Use a separate database/volume for the new airport. For Docker, choose a distinct Compose project name; for native Node, set a distinct `AIRPORT_DATABASE_PATH`. Never erase a database or paid-data ledger to get past an airport-mismatch error. Never run `docker compose down --volumes` as a routine troubleshooting step.

## Optional flight details and tower radio

LoganWatch's Boston setup uses Flightradar24 route enrichment and a LiveATC Boston tower stream. The free position feeds and local callsign-to-airline mapping work independently of FR24. Generated ambience is also independent of radio. Explain those differences; do not imply that paying guarantees a match for every aircraft or that every airport has a tower feed.

If the operator requests these extras, follow the airport-specific checklists in `docs/OPERATIONS.md`:

- **FR24:** confirm the selected airport and the operator's API access, display/cache permission, billing period and credit limits. API access is separate from a consumer Flightradar24 subscription. Keep credentials server-only in the operator's ignored `.env`. Do not enable paid requests or spend credits until the operator authorizes the budget. Use the existing adapter: airport matching and local-time pacing already follow the pack. Run only a bounded live check on a freshly observed flight; report missing matches honestly. Do not bypass matching, permission flags or budget limits to make a card look complete.
- **Tower:** find and verify a permitted browser-playable HTTPS stream for this specific airport, plus its provider's player page. Listen to establish the actual channel (tower, ground, approach or combined), and label it accurately. Never construct a feed by replacing `kbos` in Boston's URL. Put the public URLs and label in this airport's `tower` configuration, never credentials. Test user-started playback, stopping, mobile behavior, failure fallback and ambience alongside it. If no suitable feed is available, omit `tower` and say so; don't substitute another airport or invent controller audio.

Record the provider/source, airport or channel, date checked, what was verified, and any ongoing operator costs or manual steps. A working local stream does not establish permission to embed it. Preserve the README's link and credit to LoganWatch and the relevant provider notices when adapting a pack.

## Verify changes honestly

For an airport pack or application change, run:

```sh
npm test
npm run lint
npm run typecheck
npm run check:pack
npm run build
```

Use `npm run dev` and `/airport-lab` to inspect every phase on phone and desktop, by day, dusk and night, with rain/fog/snow and unavailable weather. Inspect the actual homepage too: airport labels, local time, nearby controls, globe, optional controls and user-started audio. Verify live feed coverage separately. Do not report synthetic fixtures as live flights.

The existing unit suite includes Boston, AEP, MDE and a fictional airport at a different elevation/time zone. Extend the pack tests for a new airport. The Playwright browser suite reads the selected pack and uses synthetic data; AEP and MDE have been verified. Its day/night times must be adapted for airports in other time zones. Build the target with the same selector and use `AIRPORT_TEST_URL` for its port. `docs/VERIFICATION.md` explains how to run it.

For deployment changes, also check startup without the author's accounts, database persistence across restart, and cleanup. Respect existing data. For documentation-only edits, check paths, links and commands; a full application rebuild isn't necessary.

Never claim a check passed if it wasn't run. List blocked or incomplete checks, feed failures, missing images and known dependency issues plainly. Keep license and data notices intact.

## Leave the person with something usable

Report the selected airport, local URL, what works, anything unfinished, and exact stop/restart commands for their installation. For a new pack, identify its configuration and artwork paths. If deployment was requested, include the actual hosting/storage details and costs the operator has agreed to. Leave the app running for a requested preview. Don't promise future maintenance from the original author.
