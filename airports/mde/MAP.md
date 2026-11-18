# Medellín airport map

MDE’s registered map is a fixed overhead illustration of José María Córdova in Rionegro: runway 01/19, its parallel taxiway, the curved terminal, aprons, cargo areas and surrounding green plateau. Open `/?mode=tv&view=map`, or enter TV mode and click **Show airport map**. Fresh positions and loaded artwork are required; flight scenes remain available when a map cannot be shown.

## Source and registration

- Geographic scaffold: [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), retrieved November 18, 2026 from the [OSM map API](https://api.openstreetmap.org/api/0.6/map?bbox=-75.445,6.141,-75.404,6.188). The selected editable ways and source metadata are bundled as `public/data/mde-map.json`, under ODbL-1.0. This is a selected-way extract, not a complete map of the region; background vegetation and buildings in the illustration are partly imagined.
- Runway identity and orientation were cross-checked against [Aerocivil Colombia eAIP A 73-26, SKRG AD 2.12](https://eaip-colombia.atnaerocivil.gov.co/eaip/A%2073-26_2026_10_01/eAIP/AD%202%20SKRG%20-%20RIONEGRO%20-%20JOS%C3%89%20MAR%C3%8DA%20C%C3%93RDOVA-en-US.html), effective October 1, 2026: one 01/19 runway, listed 3440×45 m, roughly north/south. This dated reference is not operational guidance. Registration uses the OSM physical pavement ends, not declared landing thresholds or usable distances.
- Runway source way **35826614** has endpoints `[-75.4230383, 6.1492252]` and `[-75.4232384, 6.1803717]` (longitude, latitude). They map to `[368.583, 765.400]` and `[1417.571, 247.180]` in the 1672×941 image. The curved terminal source way is **35836493**.
- `map.ts` contains this runway and **101** source polylines: 67 taxiways and 34 taxilanes. They register the ground paths to the same painting. The geographic origin is `[-75.425, 6.1645]`; the rotated ground plane points north toward the upper-right and compresses screen-vertical distances by 0.65. The projection and scale are recorded in the pack.
- Ground matching makes only bounded display corrections near reported pavement. It does not predict clearances, move off-map aircraft into view or treat a satellite view as surveillance. The elevation logic uses MDE’s configured 7,024 ft field elevation. Nearby EOH traffic is normally outside this map and is counted separately.

## Reproduce the scaffold

From the repository root:

```sh
node airports/mde/generate-map.mjs
npm run format -- airports/mde/map.ts
```

This regenerates `public/airports/mde/map/guide.svg` and `airports/mde/map.ts` from the bundled source without network access or image generation. After formatting, both outputs were checked for byte-for-byte reproducibility. To create a raster guide for an image tool, use an SVG renderer, for example `rsvg-convert public/airports/mde/map/guide.svg -o guide.png`. The script is an authoring tool inside this pack; it is not a shared application runtime dependency.

## Artwork and full prompts

`public/airports/mde/map/day.webp` and `night.webp` are original 1672×941 illustrations made with the **built-in image-generation tool**. The day image uses the source scaffold as its edit target and AEP’s map only as a style reference. The night image edits that day image, preserving geometry. Delivery uses `cwebp -q 90 -resize 1672 941` to normalize the generated PNG dimensions. The generic aircraft sprite remains `public/art/harbor/aircraft.webp`; no aircraft are deliberately painted into the background.

Original illustration work is offered under MIT to the extent rights are held; the OpenStreetMap geographic data retain their separate ODbL terms and attribution. The app’s About panel displays the source credit. There is no image model running for visitors.

### Day prompt

Use case: sketch-to-render.
Asset: José María Córdova MDE/SKRG registered illustrated airport map, exactly 1672x941 landscape.
Image 1 is the AUTHORITATIVE GEOMETRY SCAFFOLD and EDIT TARGET. Image 2 (Aeroparque map) is ONLY a visual rendering style reference. Do not copy its water, coast, city blocks or airport layout.
Turn image 1 into a richly detailed miniature pixel-art/isometric map of MDE on the lush Rionegro plateau outside Medellín, Colombia. High overhead oblique view with NO horizon. Match image 2's crisp tiny buildings, fine pavement, gently shaded trees and charming detailed diorama treatment.
CRITICAL: preserve the EXACT image-1 ground-plane projection, crop and all airport geometry. The single runway runs diagonally from pixel (368.583,765.400) at bottom-left to (1417.571,247.180) at upper-right; preserve its centerline and both ends precisely. Preserve all taxiway centerlines, the parallel taxiway, connecting exits, the wide aprons, distinctive curved horseshoe-shaped terminal with its radial jet bridges in the upper-middle, access loop, cargo/hangar bases, mapped roads and small ponds. Do not shift, straighten or widen the apron or terminal footprint. Buildings may gain small vertical height ABOVE their exact footprints, but no displaced bases. The runway and taxiways must stay fully visible and unobstructed.
Landscape: inland green Andean plateau, rolling farmland and forest patches, small scattered low red-tile-roof houses and rural access roads; tasteful gentle relief and tree shading only outside the airport. The airport ground plane stays level. Fill unrecorded grass areas with plausible fields and trees while preserving the mapped roads. Do NOT add Medellín's dense valley skyline, coastal water, sea, a large river, islands, extra runways or a second airport.
DAYLIGHT, dry pavement, clear weather. Rich green grass, blue-green forest shadows, warm pale terminal concrete, muted blue-gray roofs, dark runway and clean white pavement markings. No aircraft of any kind baked into the map, no vehicles, people, boats, text, logos, UI, compass, labels, stars, sun, moon, clouds, rain or fog. Live planes are overlaid by the application later. ONE edge-to-edge DAY image.

### Night prompt

Use case: lighting-weather. Edit target: supplied MDE / José María Córdova registered DAY airport map. Create its matching NIGHT companion, exactly 1672x941. Change ONLY lighting and color grading to deep blue/indigo night, warm terminal windows and apron lamps, tiny blue taxiway edge lights and restrained white runway edge lights. Preserve the EXACT crop, camera, ground projection, runway centerline and both endpoints, every taxiway and taxilane, curved horseshoe terminal and jet bridge geometry, every apron, road, building footprint, field, pond and tree position. No objects should move when day and night are crossfaded. Maintain crisp miniature pixel-art detail and enough dark-green landscape detail to read the inland Rionegro plateau. No coastal water. Keep pavement visible for live aircraft sprites. Do not add or remove geometry, no extra runways, no aircraft, vehicles, people, stars, moon, clouds, rain, fog, words, labels, UI, compass or logos. One edge-to-edge NIGHT map.

## Verify and reuse

The source runway and taxi paths were overlaid on the finished day painting for visual alignment review. Review day/night registration separately from the mathematical round-trip tests. Run `npm test -- tests/registered-airport-maps.test.ts` for AEP and MDE runway alignment, source taxiway agreement, non-folding registration, geographic round trips, low flights relative to field elevation, and stale/outside traffic handling.

With MDE selected and its production container running, run the browser suite against that container’s URL. It covers maps at 320px, 390px and 1440px in day/night, rain, fog and snow, plus direct-map navigation and missing-artwork fallback. Fixtures are synthetic; inspect the real feed separately. Ground coverage depends on receivers and can be sparse. A quiet map is not evidence of an empty airport.

This addition changes no shared application runtime. Another airport needs its own source geometry, matching artwork and registration values in its pack. The same map interface and renderer can use them. All drawings and movements are approximate and for enjoyment, not navigation.
