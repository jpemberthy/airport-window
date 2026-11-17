'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { MomentCard } from './moment-card';
import { HarborShortcut } from './harbor-shortcut';
import ArcadeGlobe from './arcade-globe';
import LivingAirspace, { type AirspaceStatus } from './living-airspace';
import { atmosphereProfile } from '@/lib/atmosphere';
import { WeatherAmbience } from '@/lib/ambience';
import {
  calibrationScenario,
  weatherCalibrationScenarios,
} from '@/lib/weather-calibration';
import {
  harborFixtureTracks,
  HARBOR_FIXTURE_EPOCH,
  type HarborTrafficFixture,
  type HarborMotionFixture,
} from '@/lib/harbor-fixtures';
import {
  harborUnavailableReason,
  usePresentationController,
} from '@/lib/presentation-cycle';
import {
  advanceRotation,
  browseRotation,
  featuredMoment,
  initialRotation,
  PRESENTATION_CADENCE_MS,
} from '@/lib/flight-rotation';
import { liveMoments } from '@/lib/flight-story';
import { TOWER_STREAM_URL } from '@/lib/radio';
import type { FlightRoute } from '@/lib/flight-routes';

/** Development-only review of production components; fixtures make no provider requests. */
export function WindowLab() {
  const [view, setView] = useState<'story' | 'harbor' | 'cycle'>('harbor');
  const [traffic, setTraffic] = useState<HarborTrafficFixture>('normal');
  const [motion, setMotion] = useState<HarborMotionFixture>('steady');
  const [scenarioId, setScenario] = useState('clear-day');
  const [light, setLight] = useState('night');
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [details, setDetails] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [reset, setReset] = useState(0);
  const [status, setStatus] = useState<AirspaceStatus>('loading');
  const [playing, setPlaying] = useState(false);
  const [perspective, setPerspective] = useState(true);
  const [volume, setVolume] = useState(0.45);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [towerOn, setTowerOn] = useState(false);
  const [controls, setControls] = useState(true);
  const audio = useRef<WeatherAmbience | null>(null);
  const tower = useRef<HTMLAudioElement>(null);
  const now = HARBOR_FIXTURE_EPOCH + elapsed;
  const stopped = paused || !visible || details;
  useEffect(() => {
    const change = () => {
      setVisible(!document.hidden);
      void audio.current?.setPageVisible(!document.hidden);
    };
    change();
    document.addEventListener('visibilitychange', change);
    return () => {
      document.removeEventListener('visibilitychange', change);
      audio.current?.close();
    };
  }, []);
  useEffect(() => {
    if (stopped) return;
    const timer = window.setInterval(() => setElapsed((v) => v + 1000), 1000);
    return () => window.clearInterval(timer);
  }, [stopped]);
  const unavailable = harborUnavailableReason(
    traffic === 'stale' ? 'stale' : 'fresh',
    status,
  );
  const cycle = usePresentationController(
    view === 'cycle',
    stopped,
    reset,
    unavailable === null,
  );
  const phase = cycle.phase;
  const harbor =
    (view === 'harbor' && traffic !== 'stale' && status === 'ready') ||
    (view === 'cycle' && phase === 'activity');
  const scenario = calibrationScenario(
    scenarioId === 'fog' ? 'mist' : scenarioId,
  );
  const daylight = light === 'day' ? 1 : light === 'dusk' ? 0.38 : 0.04;
  const weather = useMemo(
    () => ({
      ...scenario.weather,
      ...(scenarioId === 'fog'
        ? { fog: true, visibilityMiles: 0.5, description: 'Dense harbor fog' }
        : {}),
      observedAt:
        scenario.weather.observedAt === null
          ? null
          : scenarioId === 'stale-report'
            ? now - 3 * 60 * 60_000
            : now,
      receivedAt: now,
    }),
    [scenario, scenarioId, now],
  );
  const atmosphere = useMemo(
    () => atmosphereProfile(weather, daylight, now),
    [weather, daylight, now],
  );
  const tracks = useMemo(
    () => harborFixtureTracks(traffic, now, motion),
    [traffic, now, motion],
  );
  const moments = useMemo(() => liveMoments(tracks, now), [tracks, now]);
  const [spotlight, setSpotlight] = useState({
    now: -1,
    traffic,
    rotation: initialRotation,
  });
  if (spotlight.now !== now || spotlight.traffic !== traffic) {
    setSpotlight({
      now,
      traffic,
      rotation: advanceRotation(
        spotlight.rotation,
        moments,
        tracks,
        now,
        PRESENTATION_CADENCE_MS,
      ),
    });
  }
  const featured = featuredMoment(spotlight.rotation, tracks, now);
  const newYork = {
    icao: 'KJFK',
    code: 'JFK',
    city: 'New York',
    country: 'United States',
    lat: 40.64,
    lon: -73.779,
  };
  const boston = {
    icao: 'KBOS',
    code: 'BOS',
    city: 'Boston',
    country: 'United States',
    lat: 42.364,
    lon: -71.009,
  };
  const outbound =
    featured?.moment === 'takeoff' || featured?.moment === 'climb';
  const route: FlightRoute = {
    verification: 'exact',
    callsign: featured?.flight.callsign ?? 'JBU1267',
    aircraftId: featured?.flight.id ?? 'harbor-0',
    origin: outbound ? boston : newYork,
    destination: outbound ? newYork : boston,
  };
  useEffect(() => {
    audio.current?.setWeather(atmosphere);
    audio.current?.setActivity({
      nearbyAircraft: tracks.size,
      fresh: traffic !== 'stale',
    });
    audio.current?.setPerspective(harbor && perspective ? 'harbor' : 'story');
    audio.current?.setVolume(volume);
  }, [atmosphere, tracks.size, traffic, harbor, perspective, volume]);
  const play = async () => {
    setAudioError(null);
    try {
      if (playing) {
        await audio.current?.stop();
        setPlaying(false);
        return;
      }
      audio.current ??= new WeatherAmbience();
      audio.current.setPerspective(harbor && perspective ? 'harbor' : 'story');
      await audio.current.play(atmosphere, volume, {
        nearbyAircraft: tracks.size,
        fresh: traffic !== 'stale',
      });
      setPlaying(true);
    } catch {
      setAudioError('Audio could not start. Press Play to retry.');
    }
  };
  const browse = (step: number) => {
    setSpotlight({
      now,
      traffic,
      rotation: browseRotation(spotlight.rotation, moments, now, step),
    });
    if (view === 'harbor') setView('story');
    setReset((v) => v + 1);
  };
  return (
    <main
      className={`observatory presentation-mode tv-controls-visible window-lab harbor-review ${harbor ? 'airspace-active' : ''} ${reduced ? 'reduced-motion-preview' : ''}`}
    >
      <header className="site-header">
        <span className="site-brand">AIRPORT.</span>
        <span className="header-center">LOCAL REVIEW · FICTIONAL FLIGHTS</span>
        {view === 'cycle' && (
          <HarborShortcut
            showing={harbor}
            unavailableReason={unavailable}
            onToggle={harbor ? cycle.showStories : cycle.showHarbor}
          />
        )}
        <button
          className="harbor-review-toggle"
          onClick={() => setControls(!controls)}
        >
          {controls ? 'Hide review controls' : 'Review controls'}
        </button>
      </header>
      <LivingAirspace
        key={motion}
        visible={harbor}
        active={harbor && !stopped}
        tracks={tracks}
        weather={weather}
        daylight={daylight}
        atmosphere={atmosphere}
        now={now}
        focusedId={featured?.flight.id ?? null}
        route={featured ? route : null}
        reducedMotionOverride={reduced}
        onStatusChange={setStatus}
        synthetic
      />
      <div className="page-body" inert={harbor} aria-hidden={harbor}>
        <div className="intro">
          <div className="conditions-card">
            <div className="conditions-top">WEATHER / FIXTURE</div>
            <div className="conditions-main">
              <strong>
                {weather.temperatureC === null
                  ? '—'
                  : Math.round((weather.temperatureC * 9) / 5 + 32)}
                °
              </strong>
              <span>{weather.description}</span>
            </div>
          </div>
        </div>
        <section className="flight-grid" aria-label="Synthetic flight preview">
          <MomentCard
            featured={featured}
            moments={moments}
            onCycle={browse}
            onSelect={() => setDetails(true)}
            weather={weather}
            atmosphere={atmosphere}
            status="Synthetic preview"
            now={now}
            route={featured ? route : null}
            nearLabel={null}
            active={!harbor && !stopped}
            reducedMotionOverride={reduced}
          />
        </section>
        <div className="tv-globe">
          <ArcadeGlobe
            route={featured ? route : null}
            active={!harbor && !stopped}
          />
        </div>
      </div>
      {controls && (
        <aside
          className="harbor-review-controls"
          aria-label="Local review controls"
        >
          <label>
            View
            <select
              aria-label="Preview view"
              value={view}
              onChange={(e) => {
                setView(e.target.value as typeof view);
                setReset((v) => v + 1);
              }}
            >
              <option value="harbor">Harbor</option>
              <option value="story">Story</option>
              <option value="cycle">Full 60/20 cycle</option>
            </select>
          </label>
          <label>
            Light
            <select
              aria-label="Daylight"
              value={light}
              onChange={(e) => setLight(e.target.value)}
            >
              <option value="day">Day</option>
              <option value="dusk">Dusk</option>
              <option value="night">Night</option>
            </select>
          </label>
          <label>
            Weather
            <select
              aria-label="Weather scenario"
              value={scenarioId}
              onChange={(e) => setScenario(e.target.value)}
            >
              {weatherCalibrationScenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
              <option value="fog">Dense harbor fog</option>
            </select>
          </label>
          <label>
            Traffic
            <select
              aria-label="Traffic scenario"
              value={traffic}
              onChange={(e) =>
                setTraffic(e.target.value as HarborTrafficFixture)
              }
            >
              {['normal', 'quiet', 'busy', 'outside', 'stale'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Motion
            <select
              aria-label="Motion scenario"
              value={motion}
              onChange={(e) => {
                setMotion(e.target.value as HarborMotionFixture);
                setElapsed(0);
                setSpotlight({ now: -1, traffic, rotation: initialRotation });
              }}
            >
              <option value="steady">Steady reports</option>
              <option value="delayed">Uneven delivery</option>
              <option value="correction">Backward correction</option>
              <option value="turns">Continuous turns</option>
              <option value="runways">Runway bearings</option>
              <option value="surface">Taxi / takeoff alignment</option>
              <option value="dropout">Report dropout / recovery</option>
            </select>
          </label>
          <button aria-pressed={paused} onClick={() => setPaused(!paused)}>
            {paused ? 'Resume visuals' : 'Pause visuals'}
          </button>
          <button aria-pressed={reduced} onClick={() => setReduced(!reduced)}>
            Reduced motion
          </button>
          <button onClick={() => browse(1)}>Next flight</button>
          <button onClick={() => setDetails(true)}>Open dialog</button>
          <output>
            {view === 'cycle' ? phase : view} · {Math.floor(elapsed / 1000)}s ·{' '}
            {status}
            {traffic === 'stale' ? ' · stale feed, harbor skipped' : ''}
          </output>
        </aside>
      )}
      <footer className="soundbar harbor-review-sound">
        <button onClick={() => void play()}>
          {playing ? 'Pause ambience' : 'Play ambience'}
        </button>
        <label>
          Volume
          <input
            aria-label="Ambience volume"
            type="range"
            min="0"
            max="100"
            value={volume * 100}
            onChange={(e) => setVolume(Number(e.target.value) / 100)}
          />
        </label>
        <button
          aria-pressed={perspective}
          onClick={() => setPerspective(!perspective)}
        >
          {perspective ? 'Harbor perspective on' : 'Unchanged sound'}
        </button>
        {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- Opt-in live tower stream. */}
        <audio
          ref={tower}
          src={TOWER_STREAM_URL}
          preload="none"
          onPlay={() => setTowerOn(true)}
          onPause={() => setTowerOn(false)}
          onError={() => {
            setTowerOn(false);
            setAudioError('Tower stream unavailable; ambience is independent.');
          }}
        />
        <button
          onClick={() => {
            if (towerOn) tower.current?.pause();
            else
              void tower.current
                ?.play()
                .catch(() => setAudioError('Tower could not start.'));
          }}
        >
          {towerOn ? 'Pause tower' : 'Play tower (live)'}
        </button>
        <Link href="/?mode=tv">Live TV</Link>
        {audioError && <output>{audioError}</output>}
      </footer>
      {details && (
        <div className="modal-scrim">
          <dialog
            open
            className="flight-modal"
            aria-label="Synthetic flight details"
          >
            <button
              className="modal-close"
              onClick={() => setDetails(false)}
              aria-label="Close flight details"
            >
              ×
            </button>
            <p className="modal-kicker">SYNTHETIC PREVIEW · SCHEDULE PAUSED</p>
            <h2>Boston & the world</h2>
            <p>One continuous weather and audio experience.</p>
            <ArcadeGlobe route={route} />
            <p>Close this dialog to resume from the same point.</p>
          </dialog>
        </div>
      )}
    </main>
  );
}
