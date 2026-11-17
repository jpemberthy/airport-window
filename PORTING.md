# Add your airport

You own the fork, deployment, ongoing fixes and provider accounts. This guide is the handoff; the original author does not operate installations for other airports.

## 1. Copy a pack

Copy `airports/template/` to `airports/your-airport/`. Edit its `index.ts`, replacing the exported name and all placeholder fields. Use authoritative airport data (the bundled OurAirports metadata is a useful starting point).

Set: a unique lowercase `id`; ICAO/IATA codes; full name, city and country; latitude/longitude in decimal degrees (negative south/west); elevation in **feet**; traffic radius in **nautical miles**; a METAR station; an IANA time zone; branding; and the viewing direction of your illustration in degrees clockwise from north.

The weather station can differ from the airport ICAO. It should represent the local conditions you intend to show. The radius defines a geographic feed, not an itinerary filter: traffic belonging to neighboring airports may appear. Reception near the ground can be incomplete.

Keep `sceneStyle: 'classic'` for the easiest artwork path. Omit `tower` and `map` when unavailable; the app hides their controls. Don't paste a credential into an airport pack: the entire configuration is public browser data.

## 2. Add your artwork

Put images in `public/airports/your-airport/`. Supply a `day` and `night` path for **approach, landing, taxi, takeoff and climb**, then replace the template's temporary AEP artwork reference with your own `scenes` object:

```ts
scenes: {
  approach: { day: '/airports/your-airport/approach-day.webp', night: '/airports/your-airport/approach-night.webp' },
  landing: { day: '/airports/your-airport/landing-day.webp', night: '/airports/your-airport/landing-night.webp' },
  taxi: { day: '/airports/your-airport/taxi-day.webp', night: '/airports/your-airport/taxi-night.webp' },
  takeoff: { day: '/airports/your-airport/takeoff-day.webp', night: '/airports/your-airport/takeoff-night.webp' },
  climb: { day: '/airports/your-airport/climb-day.webp', night: '/airports/your-airport/climb-night.webp' },
},
```

Use 1672×941 WebP images with matching geometry in each day/night pair. Keep weather out of the source art, and leave room for the foreground information. Prompts and the production workflow are in [ARTWORK.md](docs/ARTWORK.md). Don't label AEP scenery as a different airport.

## 3. Select it and check it

Change only `airport.config.ts` to import and export your new pack. Run:

```sh
npm ci
npm run check:pack
npm run check:pack -- --live
npm run dev
```

The live check makes one request to each of the two position providers and one to the selected weather station. It makes no paid requests. Repeat coverage checks at different times and from your eventual host; an empty snapshot doesn't establish whether an airport has adequate coverage.

Open `/airport-lab` and review all five phases at day, dusk and night, with rain, fog and snow, at phone and desktop widths. This page uses synthetic data. Then inspect the actual homepage: station/city labels, local time, displayed tracks near the selected airport, nearby selection, globe, weather-unavailable behavior and user-started ambience.

Run the README checks before deployment. The ordinary regression fixtures are Boston-specific; `tests/airport-packs.test.ts` also proves the pack interface with AEP and a fictional high-altitude airport. Add your pack to that test's pack list if you want the same behavior checks (provide valid local assets; never turn synthetic test coordinates into live queries).

## 4. Deploy your own copy

Follow the Docker quickstart. For a different airport, choose a different Compose project name, e.g. `docker compose -p my-airport up --build -d`, and a different host port if another instance is running (for example, `AIRPORT_PORT=3001 docker compose -p my-airport up --build -d`). Each project needs its own database volume. The application refuses to reuse a database initialized for another pack. Do not delete a paid-data ledger to bypass that guard.

Configure your own domain and HTTPS proxy if publishing. Don't point a fork at LoganWatch's services or copy its secrets. Back up your SQLite volume. You are responsible for dependency updates, external feed changes and running costs.

## Optional features

**Tower radio:** add `tower: {streamUrl, playerUrl, label}` only when you have a permitted, browser-compatible public HTTPS audio stream for the selected airport. URLs are public and must contain no credentials. Test CORS/playback from your domain. Leave it absent when unsure; ambience works independently.

**Paid routes:** follow [OPERATIONS.md](docs/OPERATIONS.md). Matching and pacing use the selected airport/time zone. Do not reuse a single paid token across independently budgeted installations without coordinating their total allowance.

**Registered map (advanced):** optional and unrelated to basic portability. The `AirportMap` interface in `airports/types.ts` accepts image dimensions, projection, geographic origin, runway endpoints and corresponding image points, stationary anchors, taxi lanes and day/night/sprite assets. `airports/boston/map.ts` is a complete reference. You must draw and calibrate your own geometry; changing only coordinates is insufficient. Check forward/inverse registration, runway bearings, taxi alignment and motion on the artwork before enabling it. Retain applicable data attribution.

**Layered scenes (advanced):** Boston demonstrates transparent day/night foregrounds, aircraft masks and shared sky assets. Classic day/night scenes are sufficient for a complete new airport. No runtime image generation is involved.
