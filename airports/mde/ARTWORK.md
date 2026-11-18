# MDE artwork

Ten original, illustrative Rionegro scenes created on November 18, 2026 with the **built-in image-generation tool**. No application API key or runtime image generation is involved. Delivered as 1672×941 opaque WebP files in `public/airports/mde/`, converted from generated PNGs with `cwebp -q 90`.

The taxi-night and climb-night PNG outputs were 1671×941; their delivery conversion adds `-resize 1672 941` to match the other assets. All final WebP dimensions were checked.

Each day image is a separate composition for its flight phase; each night image edits that exact phase’s day image. The approach image establishes the palette and generic aircraft. The terminal, hills and rural buildings are imagined airport-inspired scenery, not measured geometry or an accurate depiction of a real aircraft. No aerial photograph or map was used. Original artwork is offered under the root MIT terms to the extent rights are held.

## Files

For each of `approach`, `landing`, `taxi`, `takeoff`, `climb`: `<phase>-day.webp` and `<phase>-night.webp`. The pack references all ten directly; it inherits no AEP/Boston artwork.

## Exact generation prompts

### Approach — day

Use case: stylized-concept. Create ONE original edge-to-edge 1672×941 landscape pixel-art illustration for an ambient flight-watching app. Scene: José María Córdova airport (MDE / SKRG) on the high green Rionegro plateau outside Medellín, Colombia. Lush rolling Andean hills and distant layered mountain ridges, patchwork green fields, low red-tile rural buildings, a broad runway, a low modern terminal with a gently curved roof and slim control tower. This is an imagined airport-inspired scene, not a map. No coastal water, no river beside the runway, no dense Medellín downtown skyline: the airport is on the plateau outside the city. Phase APPROACH: one generic unbranded white twin-engine passenger jet with cyan/purple accents, gear down, descending toward the runway, three-quarter view, aircraft in the upper-middle/right half fully inside the frame. Refined detailed 1990s pixel-art aesthetic with crisp pixel clusters and cinematic depth, lush greens, restrained cyan, indigo and warm apricot palette. Bright clear daytime, dry pavement, no weather baked into the image, clear empty sky. Lower-left third dark shaded grass and uncluttered for white flight information. Aircraft and important airport features should remain recognizable when cropped on a phone. No letters, words, logos, watermark, interface, border, stars, sun, moon, rain, fog or clouds. Deliver one image, not a grid.

### landing-day

Use case: stylized-concept. Input image is the MDE APPROACH image, used ONLY as a style, aircraft identity and setting reference. Create ONE new original 1672×941 landscape pixel-art flight-phase illustration in the same series. Scene is José María Córdova airport on the high green Rionegro plateau outside Medellín, Colombia, an imagined composition rather than a map. LANDING: runway-level three-quarter view of the same generic passenger jet with its main wheels just contacting the runway, nose slightly raised, a tiny puff of tire smoke. The airplane is centered in the upper-middle/right part, fully visible, with the terminal and mountain hills behind. Match the reference’s crisp refined 1990s pixel-art treatment, white/cyan/purple unbranded twin-engine jet, lush green fields, cyan/indigo accents and warm highlights. Bright clear daytime. Leave the lower-left third dark and quiet for white flight details; keep the aircraft recognizable under phone cropping. NO sea, coastal river, dense downtown skyline, baked-in clouds, sun, moon, rain, fog, stars, words, letters, airline logos, watermark, interface or border. ONE edge-to-edge image, no grid.

### taxi-day

Use case: stylized-concept. Input image is the MDE APPROACH image, used ONLY as a style, aircraft identity and setting reference. Create ONE new original 1672×941 landscape pixel-art flight-phase illustration in the same series. Scene is José María Córdova airport on the high green Rionegro plateau outside Medellín, Colombia, an imagined composition rather than a map. TAXI: the same generic passenger jet slowly taxiing, all wheels on the apron and fuselage level, seen in side/three-quarter view. The airplane is centered in the upper-middle/right half, fully visible; the low curved-roof terminal and slim tower are behind it, with lush plateau hills beyond. Match the reference’s crisp refined 1990s pixel-art treatment, white/cyan/purple unbranded twin-engine jet, lush green fields, cyan/indigo accents and warm highlights. Bright clear daytime. Leave the lower-left third dark and quiet for white flight details; keep the aircraft recognizable under phone cropping. NO sea, coastal river, dense downtown skyline, baked-in clouds, sun, moon, rain, fog, stars, words, letters, airline logos, watermark, interface or border. ONE edge-to-edge image, no grid.

### takeoff-day

Use case: stylized-concept. Input image is the MDE APPROACH image, used ONLY as a style, aircraft identity and setting reference. Create ONE new original 1672×941 landscape pixel-art flight-phase illustration in the same series. Scene is José María Córdova airport on the high green Rionegro plateau outside Medellín, Colombia, an imagined composition rather than a map. TAKEOFF: the same generic passenger jet lifting just above the runway, nose raised around 12 degrees, main gear still extended, all wheels clear of the pavement. The airplane is centered in the upper-middle/right part, fully visible. Low airport terminal, slim tower and green mountain hills in the background. Match the reference’s crisp refined 1990s pixel-art treatment, white/cyan/purple unbranded twin-engine jet, lush green fields, cyan/indigo accents and warm highlights. Bright clear daytime. Leave the lower-left third dark and quiet for white flight details; keep the aircraft recognizable under phone cropping. NO sea, coastal river, dense downtown skyline, baked-in clouds, sun, moon, rain, fog, stars, words, letters, airline logos, watermark, interface or border. ONE edge-to-edge image, no grid.

### climb-day

Use case: stylized-concept. Input image is the MDE APPROACH image, used ONLY as a style, aircraft identity and setting reference. Create ONE new original 1672×941 landscape pixel-art flight-phase illustration in the same series. Scene is José María Córdova airport on the high green Rionegro plateau outside Medellín, Colombia, an imagined composition rather than a map. CLIMB: elevated three-quarter view of the same generic passenger jet climbing over the green Rionegro plateau, nose gently raised and landing gear fully retracted. The airplane is prominent in the upper-middle/right half, fully visible. Below, the airport runway, low curved-roof terminal and slim tower are seen among lush patchwork fields, red-tile rural buildings and layered Andean hills. Match the reference’s crisp refined 1990s pixel-art treatment, white/cyan/purple unbranded twin-engine jet, lush green fields, cyan/indigo accents and warm highlights. Bright clear daytime. Leave the lower-left third dark and quiet for white flight details; keep the aircraft recognizable under phone cropping. NO sea, coastal river, dense downtown skyline, baked-in clouds, sun, moon, rain, fog, stars, words, letters, airline logos, watermark, interface or border. ONE edge-to-edge image, no grid.

### Each phase — night

Use its corresponding generated day image as the edit target. For landing, taxi, takeoff and climb, replace `approach-day` below with that phase’s `-day` name; all other wording is unchanged.

Use case: lighting-weather. Edit target: the supplied MDE approach-day illustration. Create its NIGHT companion for a pixel-aligned day/night crossfade. Change ONLY illumination and color grading to deep indigo night, warm terminal windows, amber runway lamps and restrained cyan reflected light on the aircraft. Preserve EXACT 1672×941 frame, camera, aircraft pose and silhouette, aircraft position, every building, tree, mountain, field, runway and all geometry. Do not move, add, crop, remove or redraw objects. Retain crisp pixel-art texture; lower-left stays dark for white UI. Clear dark empty sky with NO added moon, stars, clouds, fog, rain, text, logos or interface.

## Reproduce and review

1. Generate approach-day from its text prompt, then use that image as the setting/style reference for the four other day prompts. Request one asset per call.
2. Edit each day image into its night companion. Preserve the camera, aircraft pose, mountain silhouettes, terminal and runway positions; change illumination only.
3. Keep the original PNG outputs. Copy the selected results into the project as WebPs: `cwebp -q 90 input.png -o public/airports/mde/<phase>-<light>.webp`. Verify every output is 1672×941.
4. Select MDE in `airport.config.ts`. Use `/airport-lab` in development to review day, dusk and night with clear, rain, fog, snow and unavailable weather. The browser suite also covers MDE at phone and desktop sizes against its production build; fixtures are synthetic.
5. Check lower-left text contrast, phone cropping, aircraft visibility and day/night geometry. Source art contains no rain/cloud/fog layers; the app provides them. Snow is a renderer stress test, not a claim about Rionegro weather.

MDE also includes a separate [registered airport map](MAP.md), with its own source geometry, calibration and two map illustrations. These ten flight scenes deliberately make no geographic-registration claim.
