# Aeroparque map

AEP's equivalent of LoganWatch's harbor view: a fixed illustrated view of Aeroparque, its coastal runway, terminal, Palermo parks and the Río de la Plata. Open TV mode and select **Show airport map**, or use `/?mode=tv&view=map`. The link waits for fresh positions and loaded artwork. Missing artwork or stale feeds leave the flight stories available.

## Source and registration

- Geographic scaffold: [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), retrieved 2026-11-18 from the [OSM map API](https://api.openstreetmap.org/api/0.6/map?bbox=-58.434,-34.571,-58.400,-34.547). The selected editable ways and provenance are bundled in `public/data/aep-map.json`, under ODbL-1.0. Geometry beyond that source rectangle is incomplete; buildings and vegetation in the painting are illustrative.
- Runway identity/orientation was cross-checked against [Argentina ANAC AIP supplement A 119/2024](https://ais.anac.gob.ar/descarga/sup-66f6a90ea8ad1). That is a dated reference, not current operational guidance. Registration uses OSM's physical pavement ends, including extensions, rather than declaring usable landing thresholds or distances.
- Source runway ways: 155387203, 515334276 and 515334283. Combined physical endpoints are `[-58.4282863, -34.5522719]` and `[-58.4041907, -34.5656923]` (longitude, latitude). They project to approximately `[351.664, 261.162]` and `[1301.532, 678.724]` in the 1672×941 painting.
- `map.ts` contains the projection, single 13/31 runway, stationary anchors and 55 taxiway polylines derived from those source ways. The geographic origin is `[-58.416, -34.559]`; north is compressed by 0.65 in the oblique ground plane. Ground alignment is a small display correction, not taxi-route prediction. Aircraft outside the fixed painting are counted outside; they are never moved into frame.
- Run `node scripts/generate-aep-map-guide.mjs` from the repository root to reproduce `public/airports/aep/map/guide.svg` from the bundled data without network access. This produces the drawing guide, not the finished artwork. Image generation is an authoring step only.

## Artwork

`public/airports/aep/map/day.webp` and `night.webp` are original 1672×941 illustrations created with the built-in image-generation tool, then encoded using `cwebp -q 90`. The day image used the geographic guide as the edit target and Boston's map solely as a style reference. The night image is a lighting edit of the day image. No aircraft are baked into either map: the canvas draws only reported aircraft. Both maps reuse the generic local aircraft sprite sheet at `public/art/harbor/aircraft.webp`.

Day prompt:

> Use case: sketch-to-render.
> Asset: production Aeroparque Jorge Newbery AEP/SABE illustrated geographic map, exactly 1672x941 landscape.
> Image 1 is the authoritative geometry scaffold and EDIT TARGET. Image 2 is ONLY a rendering-style reference: the existing Boston harbor diorama. Do NOT import Boston geography, buildings, extra runways or islands.
> Transform image 1 into a richly detailed, charming miniature pixel-art/isometric airport map matching the quality and visual language of image 2: small crisp buildings, softly shaded trees, fine pavement markings, restrained teal water, warm sand concrete and green parks. It is a high overhead oblique view with NO horizon.
> CRITICAL: preserve image 1's camera, crop, ground-plane projection, every coastline contour, the SINGLE diagonal runway from physical endpoint pixel (352,261) to (1302,679), all taxiway centerlines, apron and terminal footprint, road alignments and park locations. Keep these geometry pixels in place. Buildings may gain subtle vertical height above their exact footprints, but do not move or enlarge their bases. AEP terminal is BETWEEN the runway and the river, on the northeast/upper-right side. The large Palermo parks and sports facilities are inland on the southwest/lower-left. The broad Río de la Plata occupies the upper-right. Render believable Buenos Aires low urban blocks and parks at the margins. Preserve park lakes and the distinctive terminal and taxiway loops.
> Daylight, dry clear weather, gentle detailed water texture. NO aircraft at all, no boats, no people, no text, no UI, no pins, no legends, no labels, no compass, no extra runways, no clouds, no fog, no baked-in weather. The application will draw live aircraft itself. Keep the whole runway unoccluded. Deliver one edge-to-edge DAY map.

Night prompt:

> Use case: lighting-weather. Edit target: supplied Aeroparque registered DAY map. Make its matching NIGHT image, exactly 1672x941. Change ONLY illumination and color grading to deep navy/indigo night, warm terminal windows and apron lamps, tiny cyan/white runway edge lights, and subtle river reflections. Preserve EXACT image crop, camera, every coastline vertex, runway centerline and endpoints, taxiway/apron geometry, every building, park, tree, road, lake and pier location. It must crossfade with the day map without any objects moving. Do not add or remove buildings, do not add extra runways, aircraft, cars, people, boats, stars, moon, fog, clouds, rain, labels, text or UI. Maintain crisp miniature pixel-art details. Water should be dark blue-teal; airport lights legible while parks and city retain dark detail. Keep runway and taxiway surfaces visible so live aircraft sprites remain readable. One edge-to-edge NIGHT companion.

## Review and reuse

The day painting was visually checked with source runway/taxiway lines overlaid. Day/night geometry and browser crops are checked separately from mathematical registration. Tests cover forward/inverse projection, unfolded registration triangles, runway alignment, taxiway source agreement, outside/stale traffic, and altitude above airport elevation. Browser checks exercise the map on phone and desktop in daylight, darkness and adverse weather, plus unavailable artwork and the direct map link.

For another airport, create its own source scaffold and artwork, record source licenses, calibrate the map pack, then repeat those checks. `label` and `shortLabel` control the map button; Boston retains its harbor wording. Don't copy AEP geometry to another airport or enable a map from an unregistered scenic illustration. Maps remain optional; a pack without one still runs flight scenes. This is an approximate illustrated display, not navigation or an airport surface surveillance system.
