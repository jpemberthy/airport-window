import { describe, expect, it } from 'vitest';
import { atmosphereProfile } from '../lib/atmosphere';
import { unavailableWeather, WEATHER_STALE_MS } from '../lib/normalize';
import type { WeatherSnapshot } from '../lib/types';

const now = Date.parse('2026-09-27T18:00:00Z');
const base: WeatherSnapshot = {
  ...unavailableWeather('', 0),
  observedAt: now,
  receivedAt: now,
  freshness: 'fresh',
  precipitation: 'rain',
  precipitationIntensity: 'heavy',
  cloudCover: 1,
  ceilingFt: 600,
  visibilityMiles: 2,
  windDirection: 270,
  windSpeedKt: 20,
  windGustKt: 32,
  thunder: true,
};

describe('shared atmosphere', () => {
  it('changes the sky with Boston daylight while retaining the observation', () => {
    const day = atmosphereProfile(base, 1, now);
    const night = atmosphereProfile(base, 0, now);
    expect(day.skyTop).not.toBe(night.skyTop);
    expect(day.skyTop).not.toContain('NaN');
    expect(day.skyHorizon).not.toContain('NaN');
    expect(day.particleDensity).toBe(night.particleDensity);
    expect(day.daylight).toBeGreaterThan(night.daylight);
  });

  it('uses cloud ceiling, visibility, wind, gusts, and intensity independently', () => {
    const storm = atmosphereProfile(base, 0.5, now);
    const clear = atmosphereProfile(
      {
        ...base,
        precipitation: null,
        precipitationIntensity: null,
        cloudCover: 0,
        ceilingFt: null,
        visibilityMiles: 10,
        windSpeedKt: 0,
        windGustKt: null,
        thunder: false,
      },
      0.5,
      now,
    );
    expect(storm.cloudHeight).toBeGreaterThan(clear.cloudHeight);
    expect(storm.haze).toBeGreaterThan(clear.haze);
    expect(storm.distanceVeil).toBeGreaterThan(clear.distanceVeil);
    expect(storm.particleDensity).toBeGreaterThan(clear.particleDensity);
    expect(storm.particleDensity).toBeGreaterThan(
      atmosphereProfile({ ...base, precipitationIntensity: 'light' }, 0.5, now)
        .particleDensity,
    );
    expect(storm.wetness).toBeGreaterThan(clear.wetness);
    expect(storm.skyShade).toBeGreaterThan(clear.skyShade);
    expect(storm.gust).toBeGreaterThan(clear.gust);
  });

  it('fades weather-specific effects to neutral after ninety minutes', () => {
    const fresh = atmosphereProfile(base, 0.4, now + WEATHER_STALE_MS);
    const stale = atmosphereProfile(base, 0.4, now + WEATHER_STALE_MS + 1);
    expect(fresh.known).toBe(true);
    expect(stale.known).toBe(false);
    expect(stale.precipitation).toBeNull();
    expect(stale.particleDensity).toBe(0);
    expect(stale.cloudCover).toBe(0);
    expect(stale.haze).toBe(0);
    expect(stale.distanceVeil).toBe(0);
    expect(stale.wetness).toBe(0);
    expect(stale.skyShade).toBe(0);
    expect(stale.sound.rainLevel).toBe(0);
    expect(stale.sound.stormLevel).toBe(0);
  });

  it('fades a four-mile misty horizon without inventing fog from humidity alone', () => {
    const mist = atmosphereProfile(
      {
        ...base,
        precipitationIntensity: 'light',
        visibilityMiles: 4,
        ceilingFt: 800,
        fog: false,
        mist: true,
        temperatureC: 13.9,
        dewPointC: 13.3,
      },
      1,
      now,
    );
    const clear = atmosphereProfile(
      {
        ...base,
        precipitation: null,
        precipitationIntensity: null,
        visibilityMiles: 10,
        cloudCover: 0,
        fog: false,
        mist: false,
        temperatureC: 13.9,
        dewPointC: 13.3,
      },
      1,
      now,
    );
    expect(mist.haze).toBeGreaterThan(0.6);
    expect(mist.distanceVeil).toBeGreaterThan(0.35);
    expect(clear.haze).toBe(0);
    expect(clear.distanceVeil).toBe(0);
    const denseFog = atmosphereProfile(
      { ...base, visibilityMiles: 0.5, fog: true, mist: false },
      1,
      now,
    );
    expect(denseFog.distanceVeil).toBeGreaterThan(mist.distanceVeil);
  });
});
