# Airport artwork

AEP's ten WebP files live in `public/airports/aep/`, one day/night pair for each flight phase. They were made using the built-in image-generation tool, not a paid API key in the application. The original source images were 1672×941 PNGs; delivery copies use `cwebp -q 90`. No image model runs for visitors.

The scenery is a stylized Aeroparque-inspired composition beside the Río de la Plata. It is not an accurate map or a depiction of the featured real aircraft. The basic scenes need no geographic calibration.

## AEP prompt set

The approach-day generation used this specification:

> Use case: stylized-concept. Create ONE original landscape 16:9 pixel-art illustration (prefer 1672x941 or 1536x864) for an ambient flight-watching app, no text, no interface. Scene: Aeroparque Jorge Newbery in Buenos Aires beside the broad brown-blue Río de la Plata, modern low terminal and control tower, distant Buenos Aires city skyline, pampas-flat landscape, NO Boston skyline, no Boston harbor or bridges. Phase APPROACH: a single generic unbranded passenger jet with white fuselage and cyan/purple accents, landing gear down, descending toward the runway, three-quarter view, dominant aircraft in upper-right half. Refined detailed 1990s pixel-art aesthetic, cinematic depth, restrained cyan, indigo and warm apricot palette, bright clear daytime, dry pavement, no clouds baked into the sky, no rain, no fog. Keep lower-left 35 percent relatively dark and uncluttered for white flight information overlay. Clearly illustrative, not a navigational map. Consistent scene proportions will be reused for other phases. Deliver one edge-to-edge image.

Each subsequent day image used approach-day as the setting/style reference, retained the dimensions and uncluttered lower-left composition, and changed the phase:

- **Landing:** runway-level view, main wheels contacting pavement, nose slightly raised, small puff of tire smoke.
- **Taxi:** all wheels on the apron, low terminal nearby, side/three-quarter aircraft view.
- **Takeoff:** nose raised, gear extended, aircraft lifting above the coastal runway.
- **Climb:** gear retracted, aircraft climbing over the river with the airport below.

The night images were separate edits of their corresponding day images using this shared instruction (replace the phase):

> Use case: lighting-weather. Edit target: supplied Aeroparque [phase] daytime illustration. Create its NIGHT companion for a pixel-aligned day/night crossfade. Change ONLY illumination and color grading to deep indigo night, cyan and warm apron/terminal/runway lights and gentle reflected light. Preserve EXACT camera, size 1672x941, aircraft pose and silhouette, aircraft position, every building, tree, runway, water edge and all geometry. Do not move, add, crop, remove, or redraw objects. Retain crisp pixel-art texture. Keep sky clear and dark with NO added moon, stars, fog, clouds, rain, text, logos or interface. Lower-left remains dark enough for white UI text.

## Your own airport

MDE provides a second original scene set for a mountainous inland airport. Its [complete prompt set and provenance](../airports/mde/ARTWORK.md) accompany the ten files in `public/airports/mde/`.

Replace the airport, local landscape and skyline in the seed prompt. Use a recognizable but illustrative setting. Generate the day composition first, then derive night from that exact image. Do not generate unrelated day/night images: crossfading reveals geometry drift.

Keep aircraft and identifying features visible when the browser crops a wide scene on a phone. Leave dark, relatively quiet space behind the flight card. Avoid baked-in rain/fog/cloud cover; the app overlays weather and adjusts lighting. Export same-size WebP pairs and put their public paths in the pack's `scenes` object.

Run `/airport-lab` in development to inspect every phase and day/night/dusk transition, including heavy rain, fog, snow, unavailable weather, phone crops, and reduced motion. Compare the pair for unwanted movement. This preview is synthetic and makes no data-provider requests.

Classic scenes are complete opaque illustrations. Boston's advanced layered mode additionally needs transparent foregrounds, aircraft masks and shared sky assets. A live aircraft map is a separate advanced feature requiring registered runway/taxi geometry; don't enable it merely by supplying a drawing.

## AEP airport map

AEP also includes separate day/night map artwork registered to its runway and taxiways. The [map walkthrough](../airports/aep/MAP.md) contains its OpenStreetMap source, reproducible drawing guide, exact built-in image-generation prompts and registration checks. These are two additional assets; the ten flight-phase scenes remain unchanged. No aircraft are painted into the maps: the app overlays reported traffic.
