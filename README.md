# Airport Window

A pixel-art window onto your local airport. Live aircraft, weather, day/night illustrations, a small globe, and ambience. You run it on your own computer or server.

Born at **[LoganWatch](https://loganwatch.com)**, my little window onto Boston Logan. I live next to the airport and hear planes every day, so I figured I might as well know who's making the noise. [Here's the original post](https://x.com/jpemberthy/status/2115145924880068690). This kit grew out of that project so anyone can try the same idea at their own airport. Same curiosity, different runway.

I plan to keep tinkering with [loganwatch.com](https://loganwatch.com) as time allows—no roadmap or promises. Keep an eye there for the latest version of my Boston project. **This repository is an independent snapshot:** LoganWatch and your copy evolve separately, with no automatic updates between them.

**Unmaintained v1 release.** Shared for independent use and adaptation. No support, issue triage, pull-request reviews, or future updates are promised. Fork it and make it your own. Operators maintain and pay for their own installations.

**Aeroparque Jorge Newbery (AEP / SABE), Buenos Aires, is ready to run.** Ten original AEP illustrations cover approach, landing, taxi, takeoff and climb, by day and night. Boston Logan is included as a reference airport pack, including its optional registered harbor illustration.

## Easiest: hand it to your coding agent

Use a coding agent that can work with files and run commands on your computer. Give it this repository link and paste one of these prompts. You don't need to understand the code.

**To run AEP as it is:**

```text
Set up https://github.com/jpemberthy/airport-window on my computer.
Read its README.md and AGENTS.md, then run the included AEP airport.
Keep the free defaults. Don't change my other projects or deploy it online.
Verify that it works, open it in my browser, and give me the local URL
and the commands to stop and restart it.
If something is missing on my computer, help me through that step.
```

**To make it for another airport:** replace the brackets, then paste:

```text
Use https://github.com/jpemberthy/airport-window to make a version for
[AIRPORT NAME, CITY, COUNTRY — or airport code].
Read AGENTS.md and PORTING.md. Work in my own copy, verify the airport
details and data coverage, and create its airport pack and day/night artwork.
Keep the free defaults. Don't change my other projects or deploy it online.
Run and test it locally, open it in my browser, and explain anything unfinished.
```

The agent's instructions are in [AGENTS.md](AGENTS.md). AEP already includes the artwork; another airport needs its own images. If the agent can't generate images, it should help you prepare them and say what's missing. An agent doesn't replace a server: your computer or host must stay running for the app to stay available.

## Or run AEP yourself

1. Install **Git** and **Docker with Compose v2.24 or newer**, and start Docker.
2. Open a terminal and paste:

   ```sh
   git clone https://github.com/jpemberthy/airport-window.git
   cd airport-window
   docker compose up --build -d --wait
   ```

3. When the command finishes, open **http://localhost:3000**. The first build can take a few minutes. Click **Play ambience** to hear sound.

No API key, paid flight-data account, or configuration file setup is needed. Leave Docker running while you use it. If a step fails, give your coding agent the error and the prompt above.

Run these from the same `airport-window` folder:

```sh
docker compose down       # stop; keep your saved data
docker compose up -d       # start again
docker compose logs -f    # see what is happening; Ctrl+C exits the logs
```

The database lives in a persistent Docker volume. Setup and cleanup are automatic. Do not add `--volumes` to the stop command: that deletes your saved data. This quickstart runs on your own computer; it does not publish a website. For your own domain/server, see [operations](docs/OPERATIONS.md).

![Aeroparque at night](public/airports/aep/approach-night.webp)

## Want LoganWatch's extra flight details and tower radio?

The Boston project includes two optional extras:

- **Flight details from [Flightradar24](https://fr24api.flightradar24.com/docs/getting-started).** The free feeds supply positions and callsigns; the paid API adds matched flight numbers and origin/destination details when available. You need your own API account, permissions and budget. A regular Flightradar24 app subscription is separate from API access.
- **Boston Logan tower radio via [LiveATC](https://www.liveatc.net/hlisten.php?mount=kbos1_twr&icao=kbos).** This is a real radio stream, separate from the app's generated ambience. Another airport needs its own available, permitted stream; don't reuse Boston's audio for it.

**AEP starts with both extras off.** Live flights, weather and ambience work without them. The Boston reference pack retains its tower configuration. Agents can follow the [optional-feature instructions](docs/OPERATIONS.md#optional-paid-route-enrichment) to investigate and configure these for your airport.

If you want those extras, give your agent this follow-up:

```text
Check whether Flightradar24 flight details and tower radio are available
for my selected airport. Read AGENTS.md and docs/OPERATIONS.md.
Explain what accounts, permissions, costs and radio source I would need.
Don't enable paid requests until we've agreed on my budget.
Use my airport's own radio feed, or leave tower audio off if none is suitable.
Once configured, test it and tell me what works and what is unavailable.
```

## For developers

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

Created by [Juan Pemberthy](https://juan.pemberthy.com), from [LoganWatch](https://loganwatch.com). This kit uses none of LoganWatch's deployment, databases or credentials.

For enjoyment, not navigation.
