# Licenses and attribution

The root MIT license covers the original application code and authored illustrations to the extent rights are held by their author. It does not replace the following third-party terms or grant rights to external feeds, recordings, trademarks or services.

## Original illustrations

`public/airports/aep/` contains ten original flight-scene illustrations generated for this release with OpenAI's built-in image-generation tool. The approach-day image was created from a written prompt; the other phases use it as a style/setting reference, and each night image is a lighting edit of its day image. They depict an imagined Aeroparque-inspired setting, not measured geography. Prompts and process are in `docs/ARTWORK.md`.

The additional day/night maps in `public/airports/aep/map/` were generated for this release from an OpenStreetMap-based geographic scaffold. Original illustration work is offered under MIT; preserve the OpenStreetMap attribution and the separate geographic-data terms below. Exact prompts and registration sources are in `airports/aep/MAP.md`.

The Boston illustrations, scene masks and sprites in `public/art/` and `public/sprites/` were authored for LoganWatch and retained for the reference pack. They are illustrative. No airline, airport authority or data provider endorses this project. Aircraft colors are decorative, not reliable aircraft identification.

`public/airports/mde/` contains ten original Rionegro-inspired flight-scene illustrations created with the built-in image-generation tool, offered under the root MIT terms to the extent rights are held. They are imagined scenes, not copies of aerial photographs or measured maps. Prompts and process: `airports/mde/ARTWORK.md`. Factual MDE configuration sources, including the Aerocivil AIP edition and IANA time-zone entry, are recorded in `airports/mde/README.md`; no AIP chart is redistributed.

## Geographic data

- **OpenStreetMap contributors:** `public/data/logan-map.json` and `public/data/aep-map.json` are derived geographic databases incorporating OpenStreetMap coastline, roads, buildings and airport geometry. AEP's `airports/aep/map.ts` coordinate arrays and `public/airports/aep/map/guide.svg` derive from that same AEP source. It remains under [Open Data Commons Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/), independently of the code license. The databases are distributed in editable JSON form. Original sources and transformations are recorded in their metadata and the pack documentation. Preserve [OpenStreetMap attribution](https://www.openstreetmap.org/copyright) and comply with the database's redistribution requirements. Both registered scenes include attribution in About.
- **OurAirports:** `public/data/runways-source.json`, airport/runway positions in the Boston pack, `lib/airport-metadata.json` and `lib/airport-cities.json` use [OurAirports open data](https://ourairports.com/data/), distributed under its public-domain dedication / [Unlicense](https://github.com/davidmegginson/ourairports-data/blob/main/LICENSE). Pinned sources for the metadata bundle are in `docs/geography-sources.md`.
- **Natural Earth:** `lib/globe-land.json` derives from Natural Earth land polygons, in the [public domain](https://www.naturalearthdata.com/about/terms-of-use/). Made with Natural Earth. Pinned input and transformations are in `docs/geography-sources.md`.

The root MIT license does not relicense those datasets. A new airport pack must record the provenance and terms of its own geographic data and artwork.

## Dependencies and fonts

Installed npm dependencies retain their respective licenses and copyright notices; versions and integrity hashes are recorded in `package-lock.json`. Third-party dependency license texts are also collected into `public/licenses/dependencies.txt` for redistribution with the built server. This includes React, Vinext, Vite, D3, SunCalc, Drizzle, Lucide and supporting libraries.

Geist and Geist Mono are from [Vercel's Geist font project](https://github.com/vercel/geist-font), under SIL Open Font License 1.1. See `public/licenses/Geist-OFL.txt`. The build bundles font files; users do not need a font-provider account.

## Live services

Aircraft positions are requested from ADSB.lol or adsb.fi, weather from NOAA Aviation Weather Center, and optional route enrichment from Flightradar24. Optional tower audio is fetched directly by the browser from the configured stream. Provider attribution is shown in the UI. The software license does not license those services or promise their availability; operators must establish their own applicable permissions and credentials.
