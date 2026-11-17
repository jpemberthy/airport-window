# Weather calibration

The development-only `/weather-lab` route is the repeatable review surface for Logan Arcade's visual and browser-generated audio atmosphere. Its catalog lives in `lib/weather-calibration.ts`; production still uses only the current KBOS METAR feed.

## Review procedure

1. Run the development server and open `/weather-lab` in Chrome.
2. Select each catalog scenario and read its provenance plus expected visual and audio character before judging the render.
3. Review approach, landing, taxi, takeoff, and climb in both the classic and weather-responsive columns.
4. Repeat the catalog at the desktop and mobile viewports below. At minimum, recheck clear daylight, low ceiling, mist, heavy rain, snow, stale, and unavailable at both sizes.
5. Enable reduced motion and confirm precipitation receives a still frame, clouds stop drifting, and the comparison remains legible.
6. Start ambience explicitly. Compare clear, strong-wind, heavy-rain, snow, and stale cases; confirm that scenario changes update the sound without starting playback by themselves.
7. Regression-check the live page in normal and presentation modes. Ambience and tower playback must remain independent.
8. Record a mismatch only when the rendered behavior conflicts with the catalog expectation. Do not tune to a single screenshot or exact color value.

### Viewport matrix

| Surface             | Size        | Purpose                                                  |
| ------------------- | ----------- | -------------------------------------------------------- |
| Weather lab desktop | 1440 × 900  | Full provenance, comparison, fine tuning, and readout    |
| Weather lab mobile  | 390 × 844   | Stacked controls, context, scenes, and horizontal safety |
| Live desktop        | 1440 × 900  | Normal mode regression                                   |
| Live mobile         | 390 × 844   | Normal mode controls and scene regression                |
| Presentation        | 1920 × 1080 | Presentation composition and independent audio controls  |

## Catalog provenance

Archived entries retain the raw report returned by the NOAA Aviation Weather Center. Derived entries change one dimension of an archived or representative case to isolate a behavior. Synthetic entries are plainly labeled and do not claim to represent conditions observed at Logan.

| Scenario              | Provenance                      | Source time                      | Calibration intent                                                      |
| --------------------- | ------------------------------- | -------------------------------- | ----------------------------------------------------------------------- |
| Clear daylight        | Synthetic                       | No source observation            | Calm, unobscured daytime baseline                                       |
| Clear dusk            | Derived from clear daylight     | No source observation            | Lighting-only comparison                                                |
| Low overcast ceiling  | Archived KBOS METAR             | 2026-09-30 12:54 UTC             | Low dense cloud without precipitation                                   |
| Harbor mist · 2 mi    | Archived KBOS SPECI             | 2026-09-30 11:47 UTC             | Distance veil and foreground separation                                 |
| Light drizzle         | Archived KBOS SPECI             | 2026-09-30 01:16 UTC             | Sparse precipitation and modest wetness                                 |
| Heavy rain · mist     | Archived KBOS METAR             | 2026-09-28 12:54 UTC             | Upper rain density and wet reflection bounds                            |
| Moderate snow         | Synthetic                       | No source observation            | Snow particles and cold sound character                                 |
| Strong wind and gusts | Derived from archived KBOS wind | 2026-09-27 16:54 UTC             | Wind direction, drift, brightness, and gust response isolated from rain |
| Stale weather report  | Derived from heavy rain         | 2026-09-28 14:34 UTC review time | Weather-specific neutralization after 90 minutes                        |
| Weather unavailable   | Synthetic failure               | No observation                   | Neutral fallback with no inferred conditions                            |

The archived reports were retrieved from the public NOAA Aviation Weather Center METAR API on September 30, 2026. No runtime archive request or additional provider was added.

## Expected versus observed

Behavioral checks should compare relative cloud height, haze, skyline visibility, wetness, precipitation density, wind direction and strength, weather ambience, airport-bed restraint, and stale/unavailable neutralization. Exact pixels and color strings are intentionally out of scope.

| Review date | Scenario set                                            | Moments / viewport                                                         | Observed result                                                                                                                                   | Follow-up                                                                                                                                                                          |
| ----------- | ------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-30  | Full catalog                                            | All five moments · Chrome 1440 × 900 and 390 × 844                         | All 100 combinations rendered two loaded 16:9 scenes, correct scenario/pose labels, finite readouts, and no horizontal overflow                   | None                                                                                                                                                                               |
| 2026-09-30  | Mist, snow, heavy rain, clear, wind, stale, unavailable | Representative visual checks · Chrome desktop and mobile                   | Cloud height, skyline veil, precipitation, wetness, daylight, and neutral fallback matched the catalog descriptions                               | None                                                                                                                                                                               |
| 2026-09-30  | Current live weather                                    | Chrome normal desktop/mobile and presentation at 390 × 844 and 1920 × 1080 | Live art and controls remained intact with no overflow; ambience could start and stop while the tower control and its volume remained independent | None                                                                                                                                                                               |
| 2026-09-30  | Rain · reduced motion                                   | Automated browser-lifecycle test                                           | One still precipitation frame rendered and no animation frame was scheduled                                                                       | Chrome's active system preference was not reduced, and its control surface did not expose media emulation; repeat visually on a reduced-motion Mac before changing motion behavior |

No observation from a person near Logan was available for this calibration pass. The catalog therefore records “no local observer” rather than inventing confirmation.

## Recurring mismatches

Use this table for patterns, not one-off aesthetic preferences.

| Date       | Scenario     | Flight moment | Viewport           | Recurring mismatch             | Disposition                        |
| ---------- | ------------ | ------------- | ------------------ | ------------------------------ | ---------------------------------- |
| 2026-09-30 | Full catalog | All           | Desktop and mobile | None across the initial matrix | No data-source follow-up justified |

Chrome reported no console errors during the review. A several-minute by-ear comparison could not be completed because the automation environment has no system-audio capture or microphone access. Playback, scenario updates, pause, and control independence were verified functionally; comfort and timbre still require a human listening pass.

## When to investigate another data source

Do not add nearby-station observations or radar because a single scene feels imperfect. Open a separate evidence-based follow-up only when all of these are true:

- The same mismatch recurs across at least two source observations or review sessions.
- The mismatch is caused by information the KBOS METAR does not contain, rather than atmosphere mapping or artwork.
- A candidate source is measurably fresher or more local and has documented availability, licensing, and failure behavior.
- The operational review includes request rate, cache strategy, monthly cost, stale-data handling, and the neutral fallback when sources disagree.

Radar would be considered only for precipitation location or approach timing that repeated METAR cases cannot express. Nearby stations would be considered only for a demonstrated local visibility or wind gap. Either addition belongs in its own scoped issue and must preserve the current no-paid-provider baseline unless cost is explicitly approved.
