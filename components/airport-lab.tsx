'use client';
import { useState } from 'react';
import { airport } from '@/lib/airport';
import { FlightScene } from './flight-scene';
import { atmosphereProfile } from '@/lib/atmosphere';
import { unavailableWeather } from '@/lib/normalize';
import type { ScenePhase } from '@/airports/types';
import type { WeatherSnapshot } from '@/lib/types';
const PREVIEW_TIME = Date.parse('2026-11-17T19:00:00Z');
export function AirportLab() {
  const [phase, setPhase] = useState<ScenePhase>('approach');
  const [light, setLight] = useState(1);
  const [condition, setCondition] = useState('clear');
  const weather: WeatherSnapshot = {
    ...unavailableWeather('', 0),
    source: 'Synthetic artwork preview',
    freshness: condition === 'unavailable' ? 'unavailable' : 'fresh',
    observedAt: PREVIEW_TIME,
    receivedAt: PREVIEW_TIME,
    error: null,
    temperatureC: condition === 'snow' ? -2 : 19,
    dewPointC: 12,
    windDirection: 180,
    windSpeedKt: 12,
    visibilityMiles: condition === 'fog' ? 0.2 : 10,
    cloudCover: condition === 'clear' ? 0 : 1,
    ceilingFt: condition === 'clear' ? null : 500,
    condition:
      condition === 'rain'
        ? 'rain'
        : condition === 'snow'
          ? 'snow'
          : condition === 'fog'
            ? 'fog'
            : 'clear',
    precipitation:
      condition === 'rain' ? 'rain' : condition === 'snow' ? 'snow' : null,
    precipitationIntensity: condition === 'rain' ? 'heavy' : 'light',
    fog: condition === 'fog',
    description: condition,
  };
  return (
    <main style={{ maxWidth: 1280, margin: 'auto', padding: 20 }}>
      <p>
        DEVELOPMENT ONLY · {airport.iata} · SYNTHETIC WEATHER · NO LIVE FEEDS
      </p>
      <h1>{airport.brand.title} artwork preview</h1>
      <div
        style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}
      >
        <label>
          Phase{' '}
          <select
            aria-label="Phase"
            value={phase}
            onChange={(e) => setPhase(e.target.value as ScenePhase)}
          >
            {Object.keys(airport.scenes).map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          Light{' '}
          <select
            aria-label="Light"
            value={light}
            onChange={(e) => setLight(Number(e.target.value))}
          >
            <option value={1}>Day</option>
            <option value={0.45}>Dusk</option>
            <option value={0}>Night</option>
          </select>
        </label>
        <label>
          Weather{' '}
          <select
            aria-label="Weather"
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
          >
            {['clear', 'rain', 'snow', 'fog', 'unavailable'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <div
        style={{
          position: 'relative',
          aspectRatio: '1672 / 941',
          overflow: 'hidden',
          borderRadius: 18,
        }}
      >
        <FlightScene
          moment={phase}
          weather={weather}
          atmosphere={atmosphereProfile(weather, light, PREVIEW_TIME)}
        />
      </div>
      <p>
        The aircraft and scenery are illustrative; this preview makes no
        provider requests.
      </p>
    </main>
  );
}
