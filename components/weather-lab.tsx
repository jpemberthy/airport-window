'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FlightScene } from './flight-scene';
import { WeatherAmbience } from '@/lib/ambience';
import { atmosphereProfile } from '@/lib/atmosphere';
import type { FlightMoment } from '@/lib/flight-story';
import { WEATHER_STALE_MS } from '@/lib/normalize';
import type { WeatherSnapshot } from '@/lib/types';
import {
  calibrationScenario,
  weatherCalibrationScenarios,
  type WeatherCalibrationScenarioId,
} from '@/lib/weather-calibration';

type Tunable = Pick<
  WeatherSnapshot,
  | 'cloudCover'
  | 'ceilingFt'
  | 'visibilityMiles'
  | 'temperatureC'
  | 'dewPointC'
  | 'windSpeedKt'
  | 'windGustKt'
  | 'windDirection'
  | 'precipitation'
  | 'precipitationIntensity'
  | 'fog'
  | 'mist'
  | 'thunder'
>;
type NumericTunable = Exclude<
  keyof Tunable,
  'precipitation' | 'precipitationIntensity' | 'fog' | 'mist' | 'thunder'
>;

const moments: FlightMoment[] = [
  'approach',
  'landing',
  'taxi',
  'takeoff',
  'climb',
];

const defaultScenarioId: WeatherCalibrationScenarioId = 'heavy-rain';

function sourceTime(value: number | null) {
  return value === null
    ? 'No source observation'
    : new Date(value).toISOString().replace('.000Z', ' UTC');
}

export function WeatherLab() {
  const [scenarioId, setScenarioId] =
    useState<WeatherCalibrationScenarioId>(defaultScenarioId);
  const [moment, setMoment] = useState<FlightMoment>('landing');
  const initialScenario = calibrationScenario(defaultScenarioId);
  const [daylight, setDaylight] = useState(initialScenario.daylight);
  const [stale, setStale] = useState(
    initialScenario.weather.freshness === 'stale',
  );
  const [tuning, setTuning] = useState<Partial<Tunable>>({});
  const [playing, setPlaying] = useState(false);
  const audio = useRef<WeatherAmbience | null>(null);

  const scenario = calibrationScenario(scenarioId);
  const isUnavailable = scenario.weather.freshness === 'unavailable';
  const isCustom =
    Object.keys(tuning).length > 0 ||
    daylight !== scenario.daylight ||
    (!isUnavailable && stale !== (scenario.weather.freshness === 'stale'));

  const weather = useMemo<WeatherSnapshot>(() => {
    if (scenario.weather.freshness === 'unavailable') {
      return {
        ...scenario.weather,
        ...tuning,
        description:
          Object.keys(tuning).length > 0
            ? 'Custom unavailable observation'
            : scenario.weather.description,
      };
    }

    const freshObservedAt =
      scenario.weather.freshness === 'stale'
        ? scenario.referenceTime - 5 * 60_000
        : scenario.weather.observedAt;
    return {
      ...scenario.weather,
      observedAt: stale
        ? Math.min(
            scenario.sourceObservedAt ?? scenario.referenceTime,
            scenario.referenceTime - WEATHER_STALE_MS - 60_000,
          )
        : freshObservedAt,
      receivedAt: scenario.referenceTime,
      freshness: stale ? 'stale' : 'fresh',
      ...tuning,
      description:
        Object.keys(tuning).length > 0
          ? `Custom · ${scenario.weather.description}`
          : scenario.weather.description,
    };
  }, [scenario, stale, tuning]);
  const profile = useMemo(
    () => atmosphereProfile(weather, daylight, scenario.referenceTime),
    [weather, daylight, scenario.referenceTime],
  );

  useEffect(() => {
    audio.current?.setWeather(profile);
  }, [profile]);
  useEffect(() => {
    const onVisibility = () => {
      void audio.current?.setPageVisible(!document.hidden);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      audio.current?.close();
      audio.current = null;
    };
  }, []);

  function loadScenario(id: WeatherCalibrationScenarioId) {
    const next = calibrationScenario(id);
    setScenarioId(id);
    setDaylight(next.daylight);
    setStale(next.weather.freshness === 'stale');
    setTuning({});
  }

  function resetScenario() {
    loadScenario(scenarioId);
  }

  async function toggleSound() {
    if (playing) {
      await audio.current?.stop();
      setPlaying(false);
    } else {
      audio.current ??= new WeatherAmbience();
      await audio.current.play(profile, 0.65, {
        nearbyAircraft: 0,
        fresh: false,
      });
      setPlaying(true);
    }
  }

  function tune<K extends keyof Tunable>(key: K, value: Tunable[K]) {
    setTuning((current) => ({ ...current, [key]: value }));
  }

  return (
    <main className="weather-lab">
      <header>
        <span>DEVELOPMENT PREVIEW · KBOS</span>
        <h1>Atmosphere calibration</h1>
        <p>
          Compare every flight scene against a durable weather case, its source,
          and the visual and audio behavior it should communicate.
        </p>
      </header>
      <div className="lab-controls">
        <label>
          Calibration scenario
          <select
            value={scenarioId}
            onChange={(event) =>
              loadScenario(event.target.value as WeatherCalibrationScenarioId)
            }
          >
            {weatherCalibrationScenarios.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Flight pose
          <select
            value={moment}
            onChange={(event) => setMoment(event.target.value as FlightMoment)}
          >
            {moments.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          Boston light ·{' '}
          {daylight <= 0.05 ? 'Night' : daylight >= 0.9 ? 'Day' : 'Dusk'}
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={daylight}
            aria-label="Boston light"
            onChange={(event) => setDaylight(Number(event.target.value))}
          />
        </label>
        <label className="lab-checkbox">
          <input
            type="checkbox"
            checked={stale}
            disabled={isUnavailable}
            onChange={(event) => setStale(event.target.checked)}
          />{' '}
          Observation older than 90 minutes
        </label>
        <button type="button" onClick={() => void toggleSound()}>
          {playing ? 'Pause' : 'Play'} ambience
        </button>
        <button type="button" disabled={!isCustom} onClick={resetScenario}>
          Reset scenario
        </button>
      </div>
      <div className="lab-scenario-list" aria-label="Calibration scenarios">
        {weatherCalibrationScenarios.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            aria-pressed={candidate.id === scenarioId}
            onClick={() => loadScenario(candidate.id)}
          >
            {candidate.label}
          </button>
        ))}
      </div>
      <section
        className="lab-calibration-context"
        aria-label="Scenario context"
      >
        <div className="lab-context-heading">
          <div>
            <span>{scenario.provenance.label}</span>
            <h2>{scenario.label}</h2>
          </div>
          <strong>{isCustom ? 'Custom tuning' : 'Catalog baseline'}</strong>
        </div>
        <dl>
          <div>
            <dt>Source observation</dt>
            <dd>{sourceTime(scenario.sourceObservedAt)}</dd>
          </div>
          <div>
            <dt>Freshness case</dt>
            <dd>{weather.freshness}</dd>
          </div>
          <div>
            <dt>Provenance</dt>
            <dd>{scenario.provenance.detail}</dd>
          </div>
          <div>
            <dt>Source report</dt>
            <dd>
              {scenario.weather.raw ? (
                <code>{scenario.weather.raw}</code>
              ) : (
                'No raw METAR — representative or derived scenario'
              )}
            </dd>
          </div>
          <div>
            <dt>Expected visual character</dt>
            <dd>{scenario.expected.visual}</dd>
          </div>
          <div>
            <dt>Expected audio character</dt>
            <dd>{scenario.expected.audio}</dd>
          </div>
        </dl>
      </section>
      <details className="lab-tuning">
        <summary>Fine-tune this observation</summary>
        <div className="lab-tuning-types">
          <label>
            Precipitation
            <select
              value={weather.precipitation ?? 'none'}
              onChange={(event) =>
                tune(
                  'precipitation',
                  event.target.value === 'none'
                    ? null
                    : (event.target.value as Exclude<
                        WeatherSnapshot['precipitation'],
                        null
                      >),
                )
              }
            >
              <option value="none">None</option>
              <option value="drizzle">Drizzle</option>
              <option value="rain">Rain</option>
              <option value="snow">Snow</option>
              <option value="mixed">Rain and snow</option>
            </select>
          </label>
          <label>
            Intensity
            <select
              value={weather.precipitationIntensity ?? 'none'}
              onChange={(event) =>
                tune(
                  'precipitationIntensity',
                  event.target.value === 'none'
                    ? null
                    : (event.target.value as Exclude<
                        WeatherSnapshot['precipitationIntensity'],
                        null
                      >),
                )
              }
            >
              <option value="none">None</option>
              <option value="light">Light</option>
              <option value="moderate">Moderate</option>
              <option value="heavy">Heavy</option>
            </select>
          </label>
          <label className="lab-tuning-toggle">
            <input
              type="checkbox"
              checked={weather.fog}
              onChange={(event) => tune('fog', event.target.checked)}
            />
            Fog
          </label>
          <label className="lab-tuning-toggle">
            <input
              type="checkbox"
              checked={weather.mist}
              onChange={(event) => tune('mist', event.target.checked)}
            />
            Mist
          </label>
          <label className="lab-tuning-toggle">
            <input
              type="checkbox"
              checked={weather.thunder}
              onChange={(event) => tune('thunder', event.target.checked)}
            />
            Thunder
          </label>
        </div>
        <div className="lab-tuning-grid">
          {(
            [
              ['cloudCover', 'Cloud cover', 0, 1, 0.05, '%', 100],
              ['ceilingFt', 'Ceiling', 0, 6000, 100, ' ft', 1],
              ['visibilityMiles', 'Visibility', 0, 10, 0.25, ' mi', 1],
              ['windSpeedKt', 'Wind', 0, 45, 1, ' kt', 1],
              ['windGustKt', 'Gust', 0, 60, 1, ' kt', 1],
              ['windDirection', 'Wind direction', 0, 360, 10, '°', 1],
              ['temperatureC', 'Temperature', -20, 40, 0.1, '°C', 1],
              ['dewPointC', 'Dew point', -20, 40, 0.1, '°C', 1],
            ] as const satisfies readonly (readonly [
              NumericTunable,
              string,
              number,
              number,
              number,
              string,
              number,
            ])[]
          ).map(([key, label, min, max, step, unit, multiplier]) => {
            const value = weather[key] ?? 0;
            return (
              <label key={key}>
                <span>
                  {label}{' '}
                  <strong>
                    {Math.round(value * multiplier * 100) / 100}
                    {unit}
                  </strong>
                </span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={value}
                  aria-label={label}
                  onChange={(event) => tune(key, Number(event.target.value))}
                />
              </label>
            );
          })}
        </div>
      </details>
      <div className="lab-scene-comparison">
        <div>
          <span className="lab-scene-label">Current</span>
          <div className="lab-scene">
            <FlightScene
              moment={moment}
              weather={weather}
              atmosphere={profile}
              variant="classic"
            />
          </div>
        </div>
        <div>
          <span className="lab-scene-label">Weather-responsive</span>
          <div className="lab-scene">
            <FlightScene
              moment={moment}
              weather={weather}
              atmosphere={profile}
            />
          </div>
        </div>
      </div>
      <dl className="lab-readout">
        <div>
          <dt>Setting</dt>
          <dd>{moment === 'taxi' ? 'Apron / terminal' : 'Runway / harbor'}</dd>
        </div>
        <div>
          <dt>Weather</dt>
          <dd>
            {profile.known
              ? weather.description
              : weather.freshness === 'stale'
                ? 'Neutral · report stale'
                : 'Neutral · report unavailable'}
          </dd>
        </div>
        <div>
          <dt>Particles</dt>
          <dd>{Math.round(profile.particleDensity)}</dd>
        </div>
        <div>
          <dt>Wind sound</dt>
          <dd>{profile.sound.windLevel.toFixed(3)}</dd>
        </div>
        <div>
          <dt>Airport bed</dt>
          <dd>
            {profile.sound.airportBedLevel.toFixed(3)} ·{' '}
            {Math.round(profile.sound.airportBedLowpassHz)} Hz
          </dd>
        </div>
        <div>
          <dt>Aircraft pass</dt>
          <dd>
            {profile.sound.aircraftPassLevel.toFixed(3)} · interval ×
            {profile.sound.aircraftPassIntervalScale.toFixed(2)}
          </dd>
        </div>
        <div>
          <dt>Sky shade / haze</dt>
          <dd>
            {profile.skyShade.toFixed(2)} / {profile.haze.toFixed(2)}
          </dd>
        </div>
        <div>
          <dt>Distance veil</dt>
          <dd>{profile.distanceVeil.toFixed(2)}</dd>
        </div>
        <div>
          <dt>Wetness / rain sound</dt>
          <dd>
            {profile.wetness.toFixed(2)} / {profile.sound.rainLevel.toFixed(2)}
          </dd>
        </div>
      </dl>
    </main>
  );
}
