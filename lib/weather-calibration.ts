import { WEATHER_STALE_MS } from './normalize';
import type { WeatherSnapshot } from './types';

export const WEATHER_CALIBRATION_CATEGORIES = [
  'clear-day',
  'dusk',
  'low-ceiling',
  'mist-fog',
  'drizzle',
  'heavy-rain',
  'snow',
  'strong-wind',
  'stale',
  'unavailable',
] as const;

export type WeatherCalibrationCategory =
  (typeof WEATHER_CALIBRATION_CATEGORIES)[number];
export type WeatherCalibrationProvenance =
  | 'archived-kbos'
  | 'derived'
  | 'synthetic';

export interface WeatherCalibrationScenario {
  id: string;
  label: string;
  category: WeatherCalibrationCategory;
  daylight: number;
  /** Time at which this scenario should be evaluated for freshness. */
  referenceTime: number;
  /** Original observation time, or null when no source observation exists. */
  sourceObservedAt: number | null;
  provenance: {
    kind: WeatherCalibrationProvenance;
    label: string;
    detail: string;
  };
  expected: {
    visual: string;
    audio: string;
  };
  weather: WeatherSnapshot;
}

const minute = 60_000;
const observedAt = (iso: string) => Date.parse(iso);

type WeatherMeasurements = Pick<
  WeatherSnapshot,
  | 'temperatureC'
  | 'dewPointC'
  | 'windDirection'
  | 'windSpeedKt'
  | 'windGustKt'
  | 'visibilityMiles'
  | 'cloudCover'
  | 'ceilingFt'
  | 'condition'
  | 'precipitation'
  | 'precipitationIntensity'
  | 'fog'
  | 'mist'
  | 'thunder'
  | 'description'
  | 'raw'
>;

const defaultMeasurements: WeatherMeasurements = {
  temperatureC: 17,
  dewPointC: 10,
  windDirection: 270,
  windSpeedKt: 8,
  windGustKt: null,
  visibilityMiles: 10,
  cloudCover: 0,
  ceilingFt: null,
  condition: 'clear',
  precipitation: null,
  precipitationIntensity: null,
  fog: false,
  mist: false,
  thunder: false,
  description: 'Clear skies',
  raw: null,
};

function weather(
  time: number,
  measurements: Partial<WeatherMeasurements> = {},
  source = 'Representative synthetic KBOS case',
): WeatherSnapshot {
  return {
    station: 'KBOS',
    source,
    observedAt: time,
    receivedAt: time + 5 * minute,
    freshness: 'fresh',
    error: null,
    retryAfterSeconds: null,
    ...defaultMeasurements,
    ...measurements,
  };
}

const syntheticReference = observedAt('2026-09-29T16:00:00Z');
const clearWeather = weather(syntheticReference, {
  temperatureC: 20,
  dewPointC: 12,
  windDirection: 240,
  windSpeedKt: 5,
  description: 'Clear skies',
});

const lowCeilingObservedAt = observedAt('2026-09-30T12:54:00Z');
const lowCeilingWeather = weather(
  lowCeilingObservedAt,
  {
    temperatureC: 16.1,
    dewPointC: 15,
    windDirection: 190,
    windSpeedKt: 4,
    cloudCover: 1,
    ceilingFt: 1300,
    condition: 'cloudy',
    description: 'Overcast',
    raw: 'METAR KBOS 301254Z 19004KT 10SM FEW005 OVC013 16/15 A3010 RMK AO2 SLP193 T01610150',
  },
  'NOAA Aviation Weather Center archived METAR',
);

const mistObservedAt = observedAt('2026-09-30T11:47:00Z');
const mistWeather = weather(
  mistObservedAt,
  {
    temperatureC: 15.6,
    dewPointC: 15,
    windDirection: 160,
    windSpeedKt: 4,
    visibilityMiles: 2,
    cloudCover: 1,
    ceilingFt: 1400,
    condition: 'fog',
    mist: true,
    description: 'Mist',
    raw: 'SPECI KBOS 301147Z 16004KT 2SM BR FEW006 OVC014 16/15 A3009 RMK AO2 SFC VIS 5 RAB06E42 P0001 T01560150',
  },
  'NOAA Aviation Weather Center archived METAR',
);

const drizzleObservedAt = observedAt('2026-09-30T01:16:00Z');
const drizzleWeather = weather(
  drizzleObservedAt,
  {
    temperatureC: 16.7,
    dewPointC: 15.6,
    windDirection: 40,
    windSpeedKt: 4,
    visibilityMiles: 6,
    cloudCover: 1,
    ceilingFt: 700,
    condition: 'rain',
    precipitation: 'drizzle',
    precipitationIntensity: 'light',
    mist: true,
    description: 'Drizzle · mist',
    raw: 'SPECI KBOS 300116Z 04004KT 6SM -DZ BR BKN007 OVC011 17/16 A3000 RMK AO2 DZB06 P0000 T01670156',
  },
  'NOAA Aviation Weather Center archived METAR',
);

const heavyRainObservedAt = observedAt('2026-09-28T12:54:00Z');
const heavyRainWeather = weather(
  heavyRainObservedAt,
  {
    temperatureC: 13.9,
    dewPointC: 13.3,
    windDirection: 20,
    windSpeedKt: 16,
    visibilityMiles: 2.5,
    cloudCover: 1,
    ceilingFt: 600,
    condition: 'rain',
    precipitation: 'rain',
    precipitationIntensity: 'heavy',
    mist: true,
    description: 'Heavy rain · mist',
    raw: 'METAR KBOS 281254Z 02016KT 2 1/2SM +RA BR BKN006 OVC012 14/13 A2987 RMK AO2 SLP114 P0034 T01390133',
  },
  'NOAA Aviation Weather Center archived METAR',
);

const windSourceObservedAt = observedAt('2026-09-27T16:54:00Z');
const windyWeather = weather(windSourceObservedAt, {
  temperatureC: 15.6,
  dewPointC: 15,
  windDirection: 40,
  windSpeedKt: 24,
  windGustKt: 35,
  visibilityMiles: 10,
  cloudCover: 0.38,
  ceilingFt: null,
  condition: 'cloudy',
  description: 'Windy · derived dry variant',
  raw: 'METAR KBOS 271654Z 04024G35KT 2 1/2SM -RA BR BKN006 OVC010 16/15 A2981 RMK AO2 PK WND 03037/1638 SLP095 P0014 T01560150',
});

const staleReference = heavyRainObservedAt + WEATHER_STALE_MS + 10 * minute;
const staleWeather: WeatherSnapshot = {
  ...heavyRainWeather,
  receivedAt: staleReference,
  freshness: 'stale',
};

const unavailableReference = observedAt('2026-09-30T13:00:00Z');
const unavailableWeather: WeatherSnapshot = {
  station: 'KBOS',
  source: 'NOAA Aviation Weather Center',
  observedAt: null,
  receivedAt: unavailableReference,
  freshness: 'unavailable',
  error: 'Representative feed outage',
  retryAfterSeconds: 300,
  temperatureC: null,
  dewPointC: null,
  windDirection: null,
  windSpeedKt: null,
  windGustKt: null,
  visibilityMiles: null,
  cloudCover: null,
  ceilingFt: null,
  condition: 'unknown',
  precipitation: null,
  precipitationIntensity: null,
  fog: false,
  mist: false,
  thunder: false,
  description: 'Weather unavailable',
  raw: null,
};

export const weatherCalibrationScenarios = [
  {
    id: 'clear-day',
    label: 'Clear daylight',
    category: 'clear-day',
    daylight: 1,
    referenceTime: clearWeather.receivedAt!,
    sourceObservedAt: null,
    provenance: {
      kind: 'synthetic',
      label: 'Representative synthetic case',
      detail:
        'No retained clear-sky observation was available; values isolate calm, clear daylight behavior.',
    },
    expected: {
      visual:
        'Bright open sky, no cloud layer or precipitation, crisp skyline, and dry surfaces.',
      audio:
        'The quietest weather mix, with a restrained airport bed and the longest aircraft-pass interval.',
    },
    weather: clearWeather,
  },
  {
    id: 'clear-dusk',
    label: 'Clear dusk',
    category: 'dusk',
    daylight: 0.3,
    referenceTime: clearWeather.receivedAt!,
    sourceObservedAt: null,
    provenance: {
      kind: 'derived',
      label: 'Derived lighting variant',
      detail:
        'Uses the clear synthetic inputs with only Boston daylight changed, so lighting can be compared directly.',
    },
    expected: {
      visual:
        'Warm twilight horizon and a darker upper sky without added clouds, haze, or wetness.',
      audio:
        'Matches the calm clear-day mix; daylight alone must not change weather or airport sound levels.',
    },
    weather: { ...clearWeather },
  },
  {
    id: 'low-ceiling',
    label: 'Low overcast ceiling',
    category: 'low-ceiling',
    daylight: 0.82,
    referenceTime: lowCeilingWeather.receivedAt!,
    sourceObservedAt: lowCeilingWeather.observedAt,
    provenance: {
      kind: 'archived-kbos',
      label: 'Archived KBOS observation',
      detail:
        'NOAA Aviation Weather Center METAR observed September 30, 2026 at 12:54 UTC.',
    },
    expected: {
      visual:
        'A low, dense overcast layer with muted daylight but a visible skyline and no precipitation.',
      audio:
        'Soft wind and airport bed only; cloud cover must not invent rain or thunder.',
    },
    weather: lowCeilingWeather,
  },
  {
    id: 'mist',
    label: 'Harbor mist · 2 mi',
    category: 'mist-fog',
    daylight: 0.72,
    referenceTime: mistWeather.receivedAt!,
    sourceObservedAt: mistWeather.observedAt,
    provenance: {
      kind: 'archived-kbos',
      label: 'Archived KBOS observation',
      detail:
        'NOAA Aviation Weather Center SPECI observed September 30, 2026 at 11:47 UTC.',
    },
    expected: {
      visual:
        'Strong distance veil, softened skyline, and low overcast while the foreground aircraft stays legible.',
      audio:
        'Duller, quiet wind and airport tones with no active precipitation layer.',
    },
    weather: mistWeather,
  },
  {
    id: 'drizzle',
    label: 'Light drizzle',
    category: 'drizzle',
    daylight: 0.58,
    referenceTime: drizzleWeather.receivedAt!,
    sourceObservedAt: drizzleWeather.observedAt,
    provenance: {
      kind: 'archived-kbos',
      label: 'Archived KBOS observation',
      detail:
        'NOAA Aviation Weather Center SPECI observed September 30, 2026 at 01:16 UTC.',
    },
    expected: {
      visual:
        'Fine sparse precipitation, modest wetness, a low ceiling, and only moderate distance loss.',
      audio:
        'A light filtered rain texture below the wind and airport bed, without storm accents.',
    },
    weather: drizzleWeather,
  },
  {
    id: 'heavy-rain',
    label: 'Heavy rain · mist',
    category: 'heavy-rain',
    daylight: 0.64,
    referenceTime: heavyRainWeather.receivedAt!,
    sourceObservedAt: heavyRainWeather.observedAt,
    provenance: {
      kind: 'archived-kbos',
      label: 'Archived KBOS observation',
      detail:
        'NOAA Aviation Weather Center METAR observed September 28, 2026 at 12:54 UTC.',
    },
    expected: {
      visual:
        'Dense rain, pronounced wet reflections, low clouds, and a heavily softened skyline.',
      audio:
        'The strongest cataloged rain layer, still bounded below the master volume and without thunder.',
    },
    weather: heavyRainWeather,
  },
  {
    id: 'snow',
    label: 'Moderate snow',
    category: 'snow',
    daylight: 0.76,
    referenceTime: syntheticReference + 5 * minute,
    sourceObservedAt: null,
    provenance: {
      kind: 'synthetic',
      label: 'Representative synthetic case',
      detail:
        'No snow observation was retained; values exercise cold, low-visibility snowfall without rain.',
    },
    expected: {
      visual:
        'Slow bright flakes, cool overcast light, reduced distance, and no rain reflections.',
      audio:
        'Soft snow texture and subdued filtered wind with no rain or storm layer.',
    },
    weather: weather(syntheticReference, {
      temperatureC: -3,
      dewPointC: -4,
      windDirection: 30,
      windSpeedKt: 11,
      visibilityMiles: 3,
      cloudCover: 1,
      ceilingFt: 950,
      condition: 'snow',
      precipitation: 'snow',
      precipitationIntensity: 'moderate',
      description: 'Snow',
    }),
  },
  {
    id: 'strong-wind',
    label: 'Strong wind and gusts',
    category: 'strong-wind',
    daylight: 0.86,
    referenceTime: windyWeather.receivedAt!,
    sourceObservedAt: windyWeather.observedAt,
    provenance: {
      kind: 'derived',
      label: 'Derived from archived KBOS wind',
      detail:
        'Retains the September 27, 2026 16:54 UTC 24G35KT measurement, but removes the report’s rain, mist, and low ceiling to isolate wind response.',
    },
    expected: {
      visual:
        'Noticeable cloud drift with clear lateral direction, while visibility and surfaces remain neutral.',
      audio:
        'Brighter, louder wind with slow gust swells; airport and aircraft cues remain restrained.',
    },
    weather: windyWeather,
  },
  {
    id: 'stale-report',
    label: 'Stale weather report',
    category: 'stale',
    daylight: 0.64,
    referenceTime: staleReference,
    sourceObservedAt: staleWeather.observedAt,
    provenance: {
      kind: 'derived',
      label: 'Derived freshness case',
      detail:
        'Replays the archived heavy-rain report more than 90 minutes later to verify neutralization.',
    },
    expected: {
      visual:
        'Neutral sky with no report-specific cloud, haze, wetness, or precipitation effects.',
      audio:
        'Neutral fallback wind and airport bed with rain, snow, storm, and gust effects removed.',
    },
    weather: staleWeather,
  },
  {
    id: 'unavailable-report',
    label: 'Weather unavailable',
    category: 'unavailable',
    daylight: 0.64,
    referenceTime: unavailableReference,
    sourceObservedAt: null,
    provenance: {
      kind: 'synthetic',
      label: 'Synthetic failure case',
      detail:
        'Represents a failed weather request with no observation; it does not describe actual KBOS conditions.',
    },
    expected: {
      visual:
        'The same neutral weather treatment as a stale report, with daylight still applied.',
      audio:
        'The same bounded neutral fallback as stale weather and no weather-specific layers.',
    },
    weather: unavailableWeather,
  },
] as const satisfies readonly WeatherCalibrationScenario[];

export type WeatherCalibrationScenarioId =
  (typeof weatherCalibrationScenarios)[number]['id'];

export function calibrationScenario(id: string): WeatherCalibrationScenario {
  const scenario = weatherCalibrationScenarios.find(
    (candidate) => candidate.id === id,
  );
  if (!scenario) throw new Error(`Unknown weather calibration scenario: ${id}`);
  return scenario;
}
