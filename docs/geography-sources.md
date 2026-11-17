# Bundled geography

These assets are approximate educational geography, not navigation data. They are
shipped locally; rendering a globe does not contact a map or geocoding service.
They do not contain a visitor's viewing point or any personal address.

## Land

`lib/globe-land.json` is a GeoJSON `MultiPolygon`, suitable for `d3-geo`, derived
from [Natural Earth's 1:110m land](https://www.naturalearthdata.com/downloads/110m-physical-vectors/110m-land/).
The pinned source is
[`ne_110m_land.geojson` at ca96624a56bd078437bca8184e78163e5039ad19](https://github.com/nvkelso/natural-earth-vector/blob/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_110m_land.geojson).
The already generalized polygon coordinates are rounded to 0.01 degrees and
non-geometric properties are removed. Source ring winding and antimeridian
connections are preserved. The geometry has no administrative boundaries.

Natural Earth places its maps in the
[public domain](https://www.naturalearthdata.com/about/terms-of-use/).
Made with Natural Earth.

## Airports

`lib/airport-metadata.json` is keyed by uppercase, four-letter ICAO identifier.
Each value has `{ code, city, country, lat, lon }`: an IATA code, municipality
(falling back to the airport name), full country name, latitude and longitude.
Coordinates are rounded to four decimal places. These are airport positions,
not city centers. Route identity must still come from the flight data provider;
this static lookup does not establish which route an aircraft is flying.

The source is [OurAirports open data](https://ourairports.com/data/), specifically
[`airports.csv`](https://github.com/davidmegginson/ourairports-data/blob/ecead39624006017b34acf27a4b098c9cc8a4635/airports.csv)
and [`countries.csv`](https://github.com/davidmegginson/ourairports-data/blob/ecead39624006017b34acf27a4b098c9cc8a4635/countries.csv)
at commit `ecead39624006017b34acf27a4b098c9cc8a4635`. OurAirports publishes these
under the [Unlicense / public-domain dedication](https://github.com/davidmegginson/ourairports-data/blob/ecead39624006017b34acf27a4b098c9cc8a4635/LICENSE).

The bundle includes medium and large airports with IATA codes and valid
coordinates/countries, including Boston Logan (`KBOS`). The identifier uses
`icao_code`, falling back to a valid four-letter `gps_code` or `ident`. Airports
outside that subset deliberately have no bundled coordinates; verified route
text can still be displayed while the globe remains focused on the selected airport.

## Rebuilding and checking

Run `node scripts/generate-geography.mjs` in a shell with standard Node.js.
The dependency-free Node script downloads pinned inputs, validates records,
and applies the generated JSON changes. Run
`node scripts/generate-geography.mjs --check` to verify byte-for-byte
reproducibility without writing files. Internet access is needed only to
regenerate/check the source assets, not for normal builds or rendering.

To update data, change the pinned commits in the script and the links above,
regenerate both files, and review the diff. The script enforces a 100 KB land
budget and a 600 KB airport budget. The consumer should load land geometry only
when a globe is displayed and should keep airport metadata on the server when
enriching route responses.
