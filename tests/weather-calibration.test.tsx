import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FlightScene } from '../components/flight-scene';
import { atmosphereProfile } from '../lib/atmosphere';
import type { FlightMoment } from '../lib/flight-story';
import {
  calibrationScenario,
  WEATHER_CALIBRATION_CATEGORIES,
  weatherCalibrationScenarios,
} from '../lib/weather-calibration';

const moments: FlightMoment[] = [
  'approach',
  'landing',
  'taxi',
  'takeoff',
  'climb',
];
const profile = (id: string) => {
  const scenario = calibrationScenario(id);
  return atmosphereProfile(
    scenario.weather,
    scenario.daylight,
    scenario.referenceTime,
  );
};

function finiteNumbers(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).flatMap(finiteNumbers);
}

describe('weather calibration catalog', () => {
  it('has unique stable IDs and represents every required category', () => {
    const ids = weatherCalibrationScenarios.map((scenario) => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      new Set(weatherCalibrationScenarios.map((scenario) => scenario.category)),
    ).toEqual(new Set(WEATHER_CALIBRATION_CATEGORIES));
  });

  it('records complete provenance, expectations, and source times', () => {
    for (const scenario of weatherCalibrationScenarios) {
      expect(scenario.id).toMatch(/^[a-z0-9-]+$/);
      expect(scenario.label.trim()).not.toBe('');
      expect(scenario.provenance.label.trim()).not.toBe('');
      expect(scenario.provenance.detail.trim()).not.toBe('');
      expect(scenario.expected.visual.trim()).not.toBe('');
      expect(scenario.expected.audio.trim()).not.toBe('');
      expect(Number.isFinite(scenario.referenceTime)).toBe(true);
      expect(scenario.daylight).toBeGreaterThanOrEqual(0);
      expect(scenario.daylight).toBeLessThanOrEqual(1);
      expect(scenario.weather.station).toBe('KBOS');
      for (const field of [
        'source',
        'observedAt',
        'receivedAt',
        'freshness',
        'temperatureC',
        'dewPointC',
        'windDirection',
        'windSpeedKt',
        'windGustKt',
        'visibilityMiles',
        'cloudCover',
        'ceilingFt',
        'condition',
        'precipitation',
        'precipitationIntensity',
        'fog',
        'mist',
        'thunder',
        'description',
        'raw',
      ]) {
        expect(scenario.weather).toHaveProperty(field);
      }

      if (scenario.sourceObservedAt !== null) {
        expect(Number.isFinite(scenario.sourceObservedAt)).toBe(true);
      }
      if (scenario.provenance.kind === 'archived-kbos') {
        expect(Number.isFinite(scenario.sourceObservedAt)).toBe(true);
        expect(scenario.weather.raw).toMatch(/KBOS/);
      }
      if (scenario.category === 'unavailable') {
        expect(scenario.sourceObservedAt).toBeNull();
        expect(scenario.weather.freshness).toBe('unavailable');
      }
    }
  });

  it('keeps every generated atmosphere and sound value finite and bounded', () => {
    for (const scenario of weatherCalibrationScenarios) {
      const result = profile(scenario.id);
      expect(finiteNumbers(result).every(Number.isFinite)).toBe(true);
      expect(result.daylight).toBeGreaterThanOrEqual(0);
      expect(result.daylight).toBeLessThanOrEqual(1);
      expect(result.cloudCover).toBeGreaterThanOrEqual(0);
      expect(result.cloudCover).toBeLessThanOrEqual(1);
      expect(result.haze).toBeGreaterThanOrEqual(0);
      expect(result.haze).toBeLessThanOrEqual(0.88);
      expect(result.distanceVeil).toBeGreaterThanOrEqual(0);
      expect(result.wetness).toBeGreaterThanOrEqual(0);
      expect(result.wetness).toBeLessThanOrEqual(0.85);
      expect(result.gust).toBeGreaterThanOrEqual(0);
      expect(result.gust).toBeLessThanOrEqual(1);
      expect(result.sound.airportBedLevel).toBeLessThanOrEqual(0.032);
      expect(result.sound.aircraftPassLevel).toBeLessThanOrEqual(0.085);
      expect(result.sound.rainLevel).toBeGreaterThanOrEqual(0);
      expect(result.sound.snowLevel).toBeGreaterThanOrEqual(0);
    }
  });

  it('holds behavioral relationships without pixel snapshots', () => {
    const clear = profile('clear-day');
    const dusk = profile('clear-dusk');
    const low = profile('low-ceiling');
    const mist = profile('mist');
    const drizzle = profile('drizzle');
    const rain = profile('heavy-rain');
    const snow = profile('snow');
    const wind = profile('strong-wind');

    expect(clear.daylight).toBeGreaterThan(dusk.daylight);
    expect(clear.skyTop).not.toBe(dusk.skyTop);
    expect(clear.cloudCover).toBe(dusk.cloudCover);
    expect(clear.sound).toEqual(dusk.sound);
    expect(low.cloudHeight).toBeGreaterThan(clear.cloudHeight);
    expect(low.cloudCover).toBeGreaterThan(clear.cloudCover);
    expect(mist.haze).toBeGreaterThan(clear.haze);
    expect(mist.distanceVeil).toBeGreaterThan(clear.distanceVeil);
    expect(drizzle.particleDensity).toBeGreaterThan(0);
    expect(rain.particleDensity).toBeGreaterThan(drizzle.particleDensity);
    expect(rain.wetness).toBeGreaterThan(drizzle.wetness);
    expect(rain.sound.rainLevel).toBeGreaterThan(drizzle.sound.rainLevel);
    expect(snow.precipitation).toBe('snow');
    expect(snow.sound.snowLevel).toBeGreaterThan(0);
    expect(snow.sound.rainLevel).toBe(0);
    expect(snow.fallSpeed).toBeLessThan(rain.fallSpeed);
    expect(Math.abs(wind.windX)).toBeGreaterThan(Math.abs(clear.windX));
    expect(wind.gust).toBeGreaterThan(clear.gust);
    expect(wind.sound.windLevel).toBeGreaterThan(clear.sound.windLevel);
    expect(wind.sound.gustDepth).toBeGreaterThan(clear.sound.gustDepth);
  });

  it('neutralizes weather-specific effects for stale and unavailable data', () => {
    const stale = profile('stale-report');
    const unavailable = profile('unavailable-report');
    for (const result of [stale, unavailable]) {
      expect(result.known).toBe(false);
      expect(result.precipitation).toBeNull();
      expect(result.cloudCover).toBe(0);
      expect(result.haze).toBe(0);
      expect(result.distanceVeil).toBe(0);
      expect(result.wetness).toBe(0);
      expect(result.particleDensity).toBe(0);
      expect(result.gust).toBe(0);
      expect(result.sound.rainLevel).toBe(0);
      expect(result.sound.snowLevel).toBe(0);
      expect(result.sound.stormLevel).toBe(0);
    }
    expect(stale.sound).toEqual(unavailable.sound);
  });

  it('renders every flight moment for every scenario', () => {
    for (const scenario of weatherCalibrationScenarios) {
      const atmosphere = profile(scenario.id);
      for (const moment of moments) {
        const html = renderToStaticMarkup(
          <FlightScene
            moment={moment}
            weather={scenario.weather}
            atmosphere={atmosphere}
          />,
        );
        expect(html).toContain(`scene-${moment}`);
        expect(html).not.toContain('NaN');
        expect(html).not.toContain('undefined');
      }
    }
  });
});
