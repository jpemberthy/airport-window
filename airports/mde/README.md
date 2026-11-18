# Medellín · MDE / SKRG

José María Córdova is in **Rionegro**, on the plateau outside Medellín. It is not Olaya Herrera (EOH / SKMD), the airport in the city. This pack uses Colombia's `America/Bogota` time zone and SKRG weather.

## Run it

Replace the import and export in the root `airport.config.ts` with:

```ts
import { mde } from './airports/mde';
export default mde;
```

Then, from the repository folder:

```sh
AIRPORT_PORT=4318 docker compose -p airport-window-mde up --build -d --wait
```

Open **http://localhost:4318**. Click **Play ambience** for sound. Keep Docker running. These commands use a separate MDE database volume and can run alongside AEP on another port.

```sh
docker compose -p airport-window-mde stop      # keep the container and saved data
docker compose -p airport-window-mde start     # start the same MDE build again
```

`start` does not rebuild from your current selector. If you rebuild later, select MDE first; never reuse this volume for another airport. AEP remains the upstream default.

## What's included

Ten original Rionegro-inspired illustrations: approach, landing, taxi, takeoff and climb, each by day and night. Free live positions, SKRG weather, local daylight, nearby mode, globe and synthesized ambience use the existing application. No runtime-core changes are required.

There is **no registered runway map or tower stream** in this pack; their controls stay hidden. The flight scenes are illustrative and do not plot aircraft over measured geography. Paid Flightradar24 enrichment remains off by default. The guide in [PORTING.md](../../PORTING.md#optional-features) describes how an operator can add those optional features later.

## Airport metadata

- **Aerocivil Colombia eAIP**, AIRAC A 73-26, effective October 1, 2026, [SKRG AD 2.1–2.2](https://eaip-colombia.atnaerocivil.gov.co/eaip/A%2073-26_2026_10_01/eAIP/AD%202%20SKRG%20-%20RIONEGRO%20-%20JOS%C3%89%20MAR%C3%8DA%20C%C3%93RDOVA-en-US.html), checked November 18, 2026: airport name/ICAO, ARP `06°09′52.06″N 075°25′22.80″W`, field elevation **7,024 ft**. Decimal coordinates are rounded to `6.164461, -75.423`. Older datasets give different elevations; the pack follows this AIP edition. The METAR station location/elevation is not substituted for the airport reference point.
- **IANA time-zone database**: Colombia's `America/Bogota` entry in the system `zone.tab`; UTC−05:00 with no current seasonal clock change. Daylight is calculated from the pack's coordinates, not a fixed sunrise/sunset.
- **NOAA Aviation Weather Center**: [SKRG METAR endpoint](https://aviationweather.gov/api/data/metar?ids=SKRG&format=json), checked November 18, 2026; returned an SKRG report from 15:00 UTC at the initial 15:32 UTC coverage check.
- **MDE IATA identity**: included OurAirports airport metadata, whose provenance and public-domain terms are recorded in [geography sources](../../docs/geography-sources.md).

These are factual configuration values, not a redistributed AIP chart or navigation database. No authority or provider endorses this pack.

## Coverage and limitations

The initial November 18 spot check returned seven aircraft from each included position provider and an SKRG weather report. Their recent positions were around the configured area; this is not a promise of continuous coverage or runway-level reception.

The **20 NM radius includes the Medellín valley and EOH**. A nearby aircraft may serve EOH or be passing through. Free positions do not identify an aircraft's itinerary. Flight phases are inferred from movement and approximate height above **MDE's** elevation; that height is not terrain clearance in the surrounding mountains. The optional route adapter matches SKRG, but remains disabled without the operator's own permissions and budget.

The scene bearing is an artistic westward viewing direction, not an approach procedure. Never use this app for navigation.

## Artwork

Original WebP assets are in `public/airports/mde/`. The full prompts and generation process are in [ARTWORK.md](ARTWORK.md). No other airport's scenery is reused as MDE's artwork.
