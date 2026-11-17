# Airport Window

A self-hosted, pixel-art window onto your local airport. Live aircraft, current weather, day/night illustrations, a small globe, and browser-generated ambience.

**Unmaintained v1 release.** Shared for independent use and adaptation. No support, issue triage, pull-request reviews, or future updates are promised. Fork it and make it your own. Operators maintain and pay for their own installations.

![Aeroparque at night](public/airports/aep/approach-night.webp)

**Aeroparque Jorge Newbery (AEP / SABE), Buenos Aires, is ready to run.** Ten original AEP illustrations cover approach, landing, taxi, takeoff and climb, by day and night. Boston Logan is included as a reference airport pack, including its optional registered harbor illustration.

This is an independent source release derived from [LoganWatch](https://loganwatch.com), by [Juan Pemberthy](https://juan.pemberthy.com). It has no connection to LoganWatch's deployment, databases, credentials or update process. LoganWatch's ongoing development does not imply updates to this snapshot.

## Run it

Install Docker with Compose v2.24 or newer. In a clone or downloaded copy:

```sh
docker compose up --build -d
```

Open **http://localhost:3000**. No account, API key, or `.env` file is needed for aircraft positions, weather and ambience. The named `airport-data` volume holds SQLite; restarting/rebuilding keeps it. Initialization and minute-by-minute cache cleanup are automatic.

```sh
docker compose logs -f airport
docker compose down              # preserves the database
```

Do not add `--volumes` if you want to retain data. For Internet access, configure your own HTTPS reverse proxy. The default port binds only to your machine. This is a Node server, not a static GitHub Pages site.

**Native development:** Node 22 LTS (22.13+) or Node 24 LTS, then `npm ci` and `npm run dev`. Open the printed localhost URL. SQLite initializes automatically in ignored `data/`. `/airport-lab` previews your selected pack with synthetic weather and no feed requests. Development labs are unavailable in production.

**Native production:** `npm ci`, `npm run build`, then `npm start`. The start script initializes SQLite and schedules cleanup. See [operations](docs/OPERATIONS.md) for storage, HTTPS, backups and optional route enrichment.

## Choose or add an airport

Edit **`airport.config.ts`**, then rebuild and restart. One installation serves one airport.

```ts
import { aep } from './airports/aep';
export default aep;
// For the Boston reference pack, import { boston } from './airports/boston'.
```

A new airport is a folder of configuration and artwork. Follow [PORTING.md](PORTING.md), starting with `airports/template`. No application-core changes are needed for an airport supported by the included data adapters. A different data provider requires its own adapter.

Run `npm run check:pack` to validate local artwork. Add `-- --live` for a small, keyless coverage check. Changing airports requires a separate database/volume, so caches and optional paid-data ledgers cannot mix.

## What is—and isn't—included

- Live positions from ADSB.lol and adsb.fi; METAR weather from NOAA Aviation Weather Center. Availability depends on receiver coverage and the host's access to providers.
- Nearby mode stores your approximate viewing point only in your browser. Position requests use the airport's configured area, not your coordinates.
- Daylight follows the airport location. Nearby and flight-phase altitude thresholds use approximate height above airport elevation; displayed flight altitude remains the reported altitude.
- Flight phases are inferences from movement, not confirmed schedules. Nearby aircraft may be serving another airport or just passing through. Missing or stale data is shown honestly.
- Optional Flightradar24 origin/destination enrichment is **off**. Without it, live flights still work and unknown routes stay absent. Your own credentials, permissions and budgets are required to enable it.
- AEP has no tower stream or registered runway map. Their controls are hidden. Its scenery is illustrative and its aircraft aren't placed on a geographic map.
- English UI, feet/knots and Fahrenheit are the v1 defaults. Audio begins only after a user gesture; radio may have quiet gaps or fail independently.

## Check your fork

```sh
npm test
npm run lint
npm run typecheck
npm run check:pack
npm run build
```

The regression suite exercises the Boston reference pack. Additional pack tests exercise AEP and a fictional high-altitude airport in another time zone, without provider calls or paid credits. Browser checks and their invocation are documented in [verification](docs/VERIFICATION.md).

The release has a documented [upstream dependency audit limitation](docs/VERIFICATION.md#dependency-audit-limitation); operators should review it before publishing an Internet-facing instance.

Original code and authored artwork are offered under [MIT](LICENSE); third-party geography and dependency terms remain separate. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [artwork instructions](docs/ARTWORK.md).

For enjoyment, not navigation.
