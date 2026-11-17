import { airport } from './airport';
import { ageMs, WEATHER_STALE_MS } from './normalize';
import type { Precipitation, WeatherSnapshot } from './types';

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function mix(a: string, b: string, fraction: number) {
  const t = clamp(fraction, 0, 1);
  const channels = (color: string) =>
    color.startsWith('#')
      ? [1, 3, 5].map((offset) =>
          Number.parseInt(color.slice(offset, offset + 2), 16),
        )
      : [...color.matchAll(/\d+/g)].map(([value]) => Number(value));
  const from = channels(a);
  const to = channels(b);
  return `rgb(${[0, 1, 2]
    .map((index) => Math.round(from[index] * (1 - t) + to[index] * t))
    .join(', ')})`;
}

export interface AtmosphereProfile {
  known: boolean;
  daylight: number;
  skyTop: string;
  skyHorizon: string;
  cloudColor: string;
  cloudCover: number;
  cloudHeight: number;
  skyShade: number;
  haze: number;
  distanceVeil: number;
  wetness: number;
  precipitation: Precipitation;
  particleDensity: number;
  fallSpeed: number;
  windX: number;
  gust: number;
  thunder: boolean;
  sound: {
    windLevel: number;
    windLowpassHz: number;
    windHighpassHz: number;
    gustDepth: number;
    gustRateHz: number;
    rainLevel: number;
    rainLowpassHz: number;
    snowLevel: number;
    stormLevel: number;
    airportBedLevel: number;
    airportBedLowpassHz: number;
    aircraftPassLevel: number;
    aircraftPassIntervalScale: number;
  };
}

/** A single bounded interpretation of an airport observation for art and sound. */
export function atmosphereProfile(
  weather: WeatherSnapshot,
  solarDaylight: number,
  now = Date.now(),
): AtmosphereProfile {
  const known =
    weather.observedAt !== null &&
    ageMs(weather.observedAt, now) <= WEATHER_STALE_MS;
  const daylight = Math.round(clamp(solarDaylight, 0, 1) * 100) / 100;
  const twilight = clamp(1 - Math.abs(daylight - 0.34) / 0.34, 0, 1);
  const cloudCover = known ? clamp(weather.cloudCover ?? 0, 0, 1) : 0;
  const visibility = known ? weather.visibilityMiles : null;
  const visibilityHaze =
    visibility === null ? 0 : clamp((8 - visibility) / 7.5, 0, 0.82);
  const dewPointSpread =
    known && weather.temperatureC !== null && weather.dewPointC !== null
      ? Math.max(0, weather.temperatureC - weather.dewPointC)
      : null;
  const moistureBoost =
    known && (weather.fog || weather.mist) && dewPointSpread !== null
      ? clamp((3 - dewPointSpread) / 3, 0, 1) * 0.1
      : 0;
  const haze = known
    ? clamp(
        Math.max(weather.fog ? 0.62 : weather.mist ? 0.38 : 0, visibilityHaze) +
          moistureBoost,
        0,
        0.88,
      )
    : 0;
  const distanceVeil =
    haze * (0.62 + clamp((2 - (visibility ?? 10)) / 2, 0, 1) * 0.3);
  const precipitation = known ? weather.precipitation : null;
  const intensity = known ? weather.precipitationIntensity : null;
  const intensityScale =
    intensity === 'light' ? 0.66 : intensity === 'heavy' ? 1.35 : 1;
  const particleDensity =
    precipitation === 'drizzle'
      ? 105 * intensityScale
      : precipitation === 'rain'
        ? 220 * (intensity === 'heavy' ? 1.65 : intensityScale)
        : precipitation === 'mixed'
          ? 160 * intensityScale
          : precipitation === 'snow'
            ? 120 * intensityScale
            : 0;
  const wind = known ? clamp(weather.windSpeedKt ?? 0, 0, 45) : 0;
  const gust = known ? clamp((weather.windGustKt ?? wind) - wind, 0, 30) : 0;
  const windBearing = weather.windDirection;
  // Wind moves relative to the viewing direction declared by the artwork pack.
  const windX =
    known && windBearing !== null
      ? Math.sin(
          (((windBearing + 180 - airport.sceneBearing) % 360) * Math.PI) / 180,
        ) *
        (0.12 + wind * 0.013)
      : 0;
  const wetness =
    precipitation === 'rain' || precipitation === 'mixed'
      ? clamp(0.54 * intensityScale, 0, 0.85)
      : precipitation === 'drizzle'
        ? clamp(0.32 * intensityScale, 0, 0.5)
        : 0;
  const cold =
    1 - clamp(((known ? weather.temperatureC : null) ?? 15) / 40 + 0.375, 0, 1);
  const storm = known && weather.thunder;
  const cloudDarkening = cloudCover * 0.19 + haze * 0.13;
  const precipitationDarkening =
    precipitation === 'rain' || precipitation === 'mixed'
      ? 0.14 * intensityScale
      : precipitation === 'snow'
        ? 0.08 * intensityScale
        : precipitation === 'drizzle'
          ? 0.07 * intensityScale
          : 0;
  const nightTop = '#07142f';
  const dayTop = '#50a5ce';
  const nightHorizon = '#51307d';
  const dayHorizon = '#b6dded';
  const calmClear =
    known &&
    precipitation === null &&
    cloudCover <= 0.25 &&
    haze < 0.18 &&
    wind <= 10 &&
    gust <= 5;
  const precipitationMask = precipitation === null ? 0 : 1;

  return {
    known,
    daylight,
    skyTop: mix(mix(nightTop, dayTop, daylight), '#101d39', cloudDarkening),
    skyHorizon: mix(
      mix(mix(nightHorizon, dayHorizon, daylight), '#f28bbd', twilight * 0.4),
      '#5c7292',
      cloudDarkening + haze * 0.22,
    ),
    cloudColor: mix('#7e78a8', '#e8f2f3', daylight),
    cloudCover,
    skyShade: clamp(
      cloudCover * 0.32 + precipitationDarkening + haze * 0.25,
      0,
      0.72,
    ),
    cloudHeight: clamp(
      0.34 - ((known ? weather.ceilingFt : null) ?? 4500) / 35_000,
      0.12,
      0.32,
    ),
    haze,
    distanceVeil,
    wetness,
    precipitation,
    particleDensity,
    fallSpeed: precipitation === 'snow' ? 0.27 : 1 + wind * 0.009,
    windX,
    gust: gust / 30,
    thunder: storm,
    sound: {
      windLevel: known ? 0.1 + Math.sqrt(wind / 45) * 0.3 : 0.055,
      windLowpassHz:
        (390 + Math.sqrt(wind / 45) * 630 + cold * 150) *
        (haze > 0.4 ? 0.78 : 1),
      windHighpassHz: 35 + cold * 45,
      gustDepth: known ? 0.012 + (gust / 30) * 0.065 : 0.006,
      gustRateHz: 0.06 + wind * 0.001 + gust * 0.0017,
      rainLevel:
        precipitation === 'rain' || precipitation === 'mixed'
          ? 0.32 * intensityScale
          : precipitation === 'drizzle'
            ? 0.15 * intensityScale
            : 0,
      rainLowpassHz: precipitation === 'drizzle' ? 3900 : 6200,
      snowLevel:
        precipitation === 'snow' || precipitation === 'mixed'
          ? 0.13 * intensityScale
          : 0,
      stormLevel: storm ? 0.055 : 0,
      airportBedLevel: known
        ? clamp(
            0.014 +
              cloudCover * 0.005 +
              Math.sqrt(wind / 45) * 0.006 +
              precipitationMask * 0.005,
            0.012,
            0.032,
          )
        : 0.012,
      airportBedLowpassHz: clamp(
        480 + wind * 7 + precipitationMask * 80 - haze * 110,
        380,
        900,
      ),
      aircraftPassLevel: clamp(
        0.052 +
          Math.sqrt(wind / 45) * 0.01 +
          precipitationMask * 0.012 +
          cloudCover * 0.004,
        0.048,
        0.085,
      ),
      aircraftPassIntervalScale: calmClear ? 1.2 : 1,
    },
  };
}
