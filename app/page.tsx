'use client';

import { airport, hasAirportMap } from '@/lib/airport';

import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Cloud,
  CloudFog,
  CloudRain,
  CloudSnow,
  ChevronDown,
  Headphones,
  History,
  Info,
  Minimize2,
  Moon,
  Pause,
  Radio,
  Sun,
  Tv,
  Volume2,
  VolumeX,
  Wind,
  X,
} from 'lucide-react';
import { MomentCard } from '@/components/moment-card';
import { HarborShortcut } from '@/components/harbor-shortcut';
import { MobileControls, type PhonePanel } from '@/components/mobile-controls';
import { ResponsiveDialog } from '@/components/responsive-dialog';
import { usePhoneLayout } from '@/hooks/use-phone-layout';
import { WeatherAmbience } from '@/lib/ambience';
import { atmosphereProfile } from '@/lib/atmosphere';
import { airportTime, airportZone, daylight } from '@/lib/daylight';
import { flightName, liveMoments, type FlightMoment } from '@/lib/flight-story';
import {
  harborUnavailableReason,
  usePresentationController,
} from '@/lib/presentation-cycle';
import {
  advanceRotation,
  browseRotation,
  featuredMoment,
  initialRotation,
  PAGE_CADENCE_MS,
  PRESENTATION_CADENCE_MS,
  rotatingMoments,
  type RotationState,
} from '@/lib/flight-rotation';
import { routeForMoment } from '@/lib/flight-routes';
import {
  ageMs,
  unavailableTraffic,
  unavailableWeather,
  WEATHER_STALE_MS,
} from '@/lib/normalize';
import { RADIO_URL, TOWER_STREAM_URL, HAS_TOWER } from '@/lib/radio';
import { mergeTracks, phase } from '@/lib/tracks';
import { trafficSource } from '@/lib/traffic-sources';
import type {
  AircraftTrack,
  TrackHistory,
  TrafficSnapshot,
  WeatherSnapshot,
} from '@/lib/types';
import { useLiveFeed } from '@/lib/use-live-feed';
import { routeLookupKey, useFlightRoutes } from '@/lib/use-flight-routes';
import { airportTools, registerAirportTools } from '@/lib/webmcp';
import { ViewpointPicker } from '@/components/viewpoint-picker';
import {
  DEFAULT_OBSERVER,
  OBSERVER_KEY,
  nearbyMoments,
  proximity,
  readObserver,
  rememberNearby,
  type ObserverPreferences,
  type RecentNearby,
} from '@/lib/observer';

const ArcadeGlobe = lazy(() => import('@/components/arcade-globe'));
const LivingAirspace = lazy(() => import('@/components/living-airspace'));

const initialTraffic = { ...unavailableTraffic('', 0), error: null };
const initialWeather = { ...unavailableWeather('', 0), error: null };
const formatNumber = (n: number | null, unit: string) =>
  n === null ? '—' : `${Math.round(n).toLocaleString()} ${unit}`;
const formatAge = (timestamp: number | null, now: number) =>
  timestamp === null
    ? 'No report yet'
    : ageMs(timestamp, now) < 60_000
      ? `${Math.floor(ageMs(timestamp, now) / 1000)}s ago`
      : `${Math.floor(ageMs(timestamp, now) / 60_000)}m ago`;

const momentCopy: Record<FlightMoment, { title: string; tag: string }> = {
  approach: {
    title: 'Approach',
    tag: 'INBOUND',
  },
  landing: {
    title: 'Landing',
    tag: 'FINAL / TOUCHDOWN',
  },
  taxi: {
    title: 'Taxi',
    tag: 'ON THE GROUND',
  },
  takeoff: {
    title: 'Takeoff',
    tag: 'LIFTOFF',
  },
  climb: {
    title: 'Climb',
    tag: 'OUTBOUND',
  },
};

interface FlightViewState {
  now: number;
  tracks: Map<string, TrackHistory>;
  rotation: RotationState;
  observer: ObserverPreferences;
  recent: RecentNearby[];
}

type FlightViewAction =
  | { type: 'observer'; observer: ObserverPreferences; now: number }
  | { type: 'tick'; now: number; presentation: boolean }
  | {
      type: 'traffic';
      aircraft: AircraftTrack[];
      now: number;
      presentation: boolean;
    }
  | { type: 'browse'; now: number; step: number }
  | { type: 'resetCadence'; now: number };

function flightViewReducer(
  state: FlightViewState,
  action: FlightViewAction,
): FlightViewState {
  const local = state.observer.mode === 'nearby' && state.observer.viewpoint;
  const options = (tracks: Map<string, TrackHistory>) => {
    const nearby = local ? nearbyMoments(tracks, local, action.now) : [];
    return nearby.length ? nearby : liveMoments(tracks, action.now);
  };
  if (action.type === 'observer') {
    const candidates =
      action.observer.mode === 'nearby' && action.observer.viewpoint
        ? nearbyMoments(state.tracks, action.observer.viewpoint, action.now)
        : [];
    return {
      ...state,
      observer: action.observer,
      recent: rememberNearby([], candidates, action.now),
      rotation: advanceRotation(
        initialRotation,
        candidates.length ? candidates : liveMoments(state.tracks, action.now),
        state.tracks,
        action.now,
        PAGE_CADENCE_MS,
      ),
    };
  }
  if (action.type === 'browse')
    return {
      ...state,
      rotation: browseRotation(
        state.rotation,
        options(state.tracks),
        action.now,
        action.step,
      ),
    };
  if (action.type === 'resetCadence')
    return {
      ...state,
      rotation: {
        ...state.rotation,
        featured: state.rotation.featured && {
          ...state.rotation.featured,
          since: action.now,
        },
      },
    };
  const tracks =
    action.type === 'traffic'
      ? mergeTracks(state.tracks, action.aircraft, action.now)
      : state.tracks;
  return {
    ...state,
    now: action.now,
    tracks,
    recent: local
      ? rememberNearby(
          state.recent,
          nearbyMoments(tracks, local, action.now),
          action.now,
        )
      : [],
    rotation: advanceRotation(
      state.rotation,
      options(tracks),
      tracks,
      action.now,
      action.presentation ? PRESENTATION_CADENCE_MS : PAGE_CADENCE_MS,
    ),
  };
}

export default function Home() {
  const isPhone = usePhoneLayout();
  const [phonePanel, setPhonePanel] = useState<PhonePanel>(null);
  const [presentation, setPresentation] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [presentationReset, setPresentationReset] = useState(0);
  const [airspaceStatus, setAirspaceStatus] = useState<
    'loading' | 'ready' | 'error'
  >('loading');
  const [{ now, tracks, rotation, observer, recent }, dispatchFlight] =
    useReducer(flightViewReducer, {
      now: 0,
      tracks: new Map<string, TrackHistory>(),
      rotation: initialRotation,
      observer: DEFAULT_OBSERVER,
      recent: [],
    });
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [viewpointOpen, setViewpointOpen] = useState(false);
  const [selectedRecent, setSelectedRecent] = useState<RecentNearby | null>(
    null,
  );
  const [preferenceError, setPreferenceError] = useState('');
  const modalOpen =
    !!phonePanel ||
    viewpointOpen ||
    !!selectedId ||
    !!selectedRecent ||
    infoOpen ||
    (isPhone && recentOpen);
  useEffect(() => {
    if (!modalOpen || isPhone) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLDialogElement>('dialog[open]');
    const focusables = () => [
      ...(dialog?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input, select, a[href], [tabindex="0"]',
      ) ?? []),
    ];
    focusables()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const elements = focusables();
      const first = elements[0],
        last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => {
      document.removeEventListener('keydown', trap);
      previous?.focus();
    };
  }, [modalOpen, isPhone]);
  const changeObserver = (value: ObserverPreferences) => {
    dispatchFlight({ type: 'observer', observer: value, now: Date.now() });
    try {
      localStorage.setItem(OBSERVER_KEY, JSON.stringify(value));
      setPreferenceError('');
    } catch {
      setPreferenceError(
        'Your viewing point works for this session, but this browser could not save it.',
      );
    }
  };
  const [ambientOn, setAmbientOn] = useState(false);
  const [volume, setVolume] = useState(0.42);
  const [towerOn, setTowerOn] = useState(false);
  const [towerConnecting, setTowerConnecting] = useState(false);
  const [towerVolume, setTowerVolume] = useState(0.7);
  const [radioStatus, setRadioStatus] = useState<'failed' | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const audio = useRef<WeatherAmbience | null>(null);
  const towerAudio = useRef<HTMLAudioElement | null>(null);
  const observatory = useRef<HTMLElement | null>(null);
  const presentationRef = useRef(false);
  const controlsTimer = useRef<number | null>(null);
  const wasFullscreen = useRef(false);
  const onTraffic = useCallback(
    (data: TrafficSnapshot) =>
      dispatchFlight({
        type: 'traffic',
        aircraft: data.aircraft,
        now: Date.now(),
        presentation: presentationRef.current,
      }),
    [],
  );
  const traffic = useLiveFeed('/api/traffic', 5000, initialTraffic, onTraffic);
  const weather = useLiveFeed('/api/weather', 300_000, initialWeather);

  useEffect(() => {
    // oxlint-disable-next-line react/react-compiler -- Set the client clock after server hydration.
    setReady(true);
    setPageVisible(!document.hidden);
    try {
      dispatchFlight({
        type: 'observer',
        observer: readObserver(localStorage.getItem(OBSERVER_KEY)),
        now: Date.now(),
      });
    } catch {
      /* Storage may be disabled. */
    }
    dispatchFlight({
      type: 'tick',
      now: Date.now(),
      presentation: presentationRef.current,
    });
    const tick = () => {
      if (document.hidden) return;
      const tickNow = Date.now();
      dispatchFlight({
        type: 'tick',
        now: tickNow,
        presentation: presentationRef.current,
      });
    };
    const timer = window.setInterval(tick, 1000);
    const onVisibility = () => {
      setPageVisible(!document.hidden);
      tick();
      void audio.current?.setPageVisible(!document.hidden);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      audio.current?.close();
      audio.current = null;
    };
  }, []);
  useEffect(() => {
    const syncLocation = () => {
      const enabled =
        new URL(window.location.href).searchParams.get('mode') === 'tv';
      if (!enabled && document.fullscreenElement === observatory.current) {
        void document.exitFullscreen().catch(() => {});
        wasFullscreen.current = false;
      }
      presentationRef.current = enabled;
      setPresentation(enabled);
      setPresentationReset((value) => value + 1);
      if (enabled) setAirspaceStatus('loading');
    };
    const frame = window.requestAnimationFrame(syncLocation);
    window.addEventListener('popstate', syncLocation);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('popstate', syncLocation);
    };
  }, []);
  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimer.current !== null)
      window.clearTimeout(controlsTimer.current);
    controlsTimer.current = window.setTimeout(
      () => setControlsVisible(false),
      5500,
    );
  }, []);
  useEffect(() => {
    if (controlsTimer.current !== null)
      window.clearTimeout(controlsTimer.current);
    controlsTimer.current = presentation
      ? window.setTimeout(() => setControlsVisible(false), 5500)
      : null;
    return () => {
      if (controlsTimer.current !== null)
        window.clearTimeout(controlsTimer.current);
      controlsTimer.current = null;
    };
  }, [presentation]);
  const setPresentationUrl = useCallback((enabled: boolean) => {
    const url = new URL(window.location.href);
    if (enabled) url.searchParams.set('mode', 'tv');
    else url.searchParams.delete('mode');
    window.history.pushState(null, '', url);
    presentationRef.current = enabled;
    setPresentation(enabled);
    setPresentationReset((value) => value + 1);
    setAirspaceStatus('loading');
    dispatchFlight({ type: 'resetCadence', now: Date.now() });
  }, []);
  const exitPresentation = useCallback(() => {
    if (document.fullscreenElement === observatory.current) {
      void document.exitFullscreen().catch(() => {});
    }
    wasFullscreen.current = false;
    if (presentationRef.current) setPresentationUrl(false);
  }, [setPresentationUrl]);
  const enterPresentation = async () => {
    setPresentationUrl(true);
    showControls();
    // Phones keep browser navigation and a visible return action.
    if (isPhone) return;
    try {
      await observatory.current?.requestFullscreen();
      wasFullscreen.current =
        document.fullscreenElement === observatory.current;
    } catch {
      // The bookmarkable TV layout still works when fullscreen is unavailable.
    }
  };
  useEffect(() => {
    const onFullscreenChange = () => {
      if (document.fullscreenElement === observatory.current)
        wasFullscreen.current = true;
      else if (wasFullscreen.current) exitPresentation();
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () =>
      document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, [exitPresentation]);
  const sun = useMemo(
    () =>
      now
        ? daylight(now)
        : {
            daylight: 0,
            phase: `${airport.city} local time`,
            altitude: 0,
            sunrise: null,
            sunset: null,
          },
    [now],
  );
  const night = sun.daylight < 0.35;
  const moments = useMemo(() => liveMoments(tracks, now), [tracks, now]);
  const nearby = useMemo(
    () =>
      observer.mode === 'nearby' && observer.viewpoint
        ? nearbyMoments(tracks, observer.viewpoint, now)
        : [],
    [tracks, observer, now],
  );
  const rotationMoments = useMemo(
    () => rotatingMoments(nearby.length ? nearby : moments, now),
    [moments, nearby, now],
  );
  const featured = featuredMoment(rotation, tracks, now);
  const cycleMoment = (step: number) => {
    setPresentationReset((value) => value + 1);
    dispatchFlight({ type: 'browse', now: Date.now(), step });
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Native phone sheets own Escape and arrow keys, not the TV beneath them.
      if (isPhone && (modalOpen || phonePanel)) return;
      if (event.key === 'Escape') {
        if (viewpointOpen) {
          setViewpointOpen(false);
          return;
        }
        if (selectedId || infoOpen || selectedRecent) {
          setSelectedId(null);
          setSelectedRecent(null);
          setInfoOpen(false);
        } else if (presentation) {
          exitPresentation();
        }
        return;
      }
      if (presentation) showControls();
      if (
        !presentation ||
        selectedId ||
        infoOpen ||
        viewpointOpen ||
        selectedRecent
      )
        return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      )
        return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        cycleMoment(event.key === 'ArrowLeft' ? -1 : 1);
        showControls();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });
  const active = useMemo(
    () =>
      [...tracks.values()]
        .map((t) => t.current)
        .filter((t) => ageMs(t.observedAt, now) < 60_000),
    [tracks, now],
  );
  const currentWeather: WeatherSnapshot = {
    ...weather,
    freshness:
      weather.observedAt === null
        ? 'unavailable'
        : weather.error || ageMs(weather.observedAt, now) > WEATHER_STALE_MS
          ? 'stale'
          : 'fresh',
  };
  const sunStep = Math.round(sun.daylight * 100) / 100;
  const weatherMinute = Math.floor(now / 60_000);
  const atmosphere = useMemo(
    () => atmosphereProfile(weather, sunStep, weatherMinute * 60_000),
    [weather, sunStep, weatherMinute],
  );
  const currentTraffic: TrafficSnapshot = {
    ...traffic,
    aircraft: active,
    freshness:
      traffic.observedAt === null
        ? 'unavailable'
        : traffic.error || ageMs(traffic.observedAt, now) > 30_000
          ? 'stale'
          : 'fresh',
  };
  const harborUnavailable = harborUnavailableReason(
    currentTraffic.freshness,
    airspaceStatus,
  );
  const presentationCycle = usePresentationController(
    presentation,
    !pageVisible || modalOpen,
    presentationReset,
    hasAirportMap && harborUnavailable === null,
  );
  const airspaceVisible =
    hasAirportMap && presentation && presentationCycle.phase === 'activity';
  const toggleHarbor = () => {
    if (airspaceVisible) presentationCycle.showStories();
    else presentationCycle.showHarbor();
    showControls();
  };
  const ambientTrafficFresh = currentTraffic.freshness === 'fresh';
  const ambientAircraftCount = ambientTrafficFresh
    ? currentTraffic.aircraft.length
    : 0;
  const status =
    currentTraffic.freshness === 'fresh'
      ? 'Live positions'
      : currentTraffic.freshness === 'stale'
        ? 'Reconnecting'
        : ready
          ? 'Feed unavailable'
          : 'Connecting';
  const selected =
    selectedRecent?.flight ?? active.find((t) => t.id === selectedId) ?? null;
  const selectedPositionSource = trafficSource(selected?.positionSource);
  const routes = useFlightRoutes([featured?.flight, selected], now);
  const featuredRoute = routeForMoment(
    routes[routeLookupKey(featured?.flight) ?? ''] ?? null,
    featured?.moment ?? 'approach',
  );
  const selectedMoment =
    selectedRecent ??
    rotationMoments.find(({ flight }) => flight.id === selectedId);
  const selectedRoute = routeForMoment(
    routes[routeLookupKey(selected) ?? ''] ?? null,
    selectedMoment?.moment ?? 'taxi',
  );
  const closeDetails = () => {
    setSelectedId(null);
    setSelectedRecent(null);
  };
  const featuredNearby = nearby.find(
    (item) => item.flight.id === featured?.flight.id,
  );
  const recentThree = recent
    .filter((item) => now - item.lastSeen < 300_000)
    .slice(0, 3);
  const selectRecent = (item: RecentNearby) => {
    setRecentOpen(false);
    setSelectedId(null);
    setSelectedRecent(item);
  };
  const WeatherIcon =
    currentWeather.condition === 'rain'
      ? CloudRain
      : currentWeather.condition === 'snow'
        ? CloudSnow
        : currentWeather.condition === 'fog'
          ? CloudFog
          : currentWeather.condition === 'cloudy'
            ? Cloud
            : night
              ? Moon
              : Sun;
  const temp =
    currentWeather.temperatureC === null
      ? '—'
      : `${Math.round((currentWeather.temperatureC * 9) / 5 + 32)}°`;
  const choose = (id: string) => {
    const found = active.find((t) => t.id === id);
    if (!found) throw new Error('This aircraft is no longer available');
    setSelectedRecent(null);
    setSelectedId(id);
    return found;
  };
  const live = useRef({ currentTraffic, currentWeather, selectedId, choose });
  useLayoutEffect(() => {
    live.current = { currentTraffic, currentWeather, selectedId, choose };
  });
  useEffect(
    () =>
      registerAirportTools(
        airportTools({
          snapshot: () => ({
            traffic: live.current.currentTraffic,
            weather: live.current.currentWeather,
            selectedAircraftId: live.current.selectedId,
          }),
          select: (id) => {
            let result: AircraftTrack;
            flushSync(() => {
              result = live.current.choose(id);
            });
            return result!;
          },
        }),
      ),
    [],
  );
  useEffect(() => {
    audio.current?.setWeather(atmosphere);
  }, [atmosphere]);
  useEffect(() => {
    audio.current?.setPerspective(airspaceVisible ? 'harbor' : 'story');
  }, [airspaceVisible]);
  useEffect(() => {
    audio.current?.setActivity({
      nearbyAircraft: ambientAircraftCount,
      fresh: ambientTrafficFresh,
    });
  }, [ambientAircraftCount, ambientTrafficFresh]);
  useEffect(() => {
    if (ambientOn) audio.current?.setVolume(volume);
  }, [ambientOn, volume]);
  useEffect(() => {
    if (towerAudio.current) towerAudio.current.volume = towerVolume;
  }, [towerVolume]);
  async function toggleAmbience() {
    setAudioError(null);
    if (ambientOn) {
      await audio.current?.stop();
      setAmbientOn(false);
      return;
    }
    try {
      audio.current ??= new WeatherAmbience();
      audio.current.setPerspective(airspaceVisible ? 'harbor' : 'story');
      await audio.current.play(atmosphere, volume, {
        nearbyAircraft: ambientAircraftCount,
        fresh: ambientTrafficFresh,
      });
      setAmbientOn(true);
    } catch {
      setAudioError('Audio could not start. Try again.');
      setAmbientOn(false);
    }
  }
  async function toggleTower() {
    if (!HAS_TOWER) return;
    const player = towerAudio.current;
    if (!player) return;
    setRadioStatus(null);
    if (!player.paused || towerConnecting) {
      player.pause();
      setTowerConnecting(false);
      return;
    }
    setTowerConnecting(true);
    try {
      await player.play();
    } catch (error) {
      setTowerConnecting(false);
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setRadioStatus('failed');
      }
    }
  }
  const localDate = now
    ? new Intl.DateTimeFormat('en-US', {
        timeZone: airport.timeZone,
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      }).format(now)
    : `${airport.city}, ${airport.country}`;
  const canBrowse =
    rotationMoments.length > 1 ||
    (rotationMoments.length === 1 &&
      !!featured &&
      !rotationMoments.some(({ flight }) => flight.id === featured.flight.id));
  const positionSource = trafficSource(featured?.flight.positionSource);
  return (
    <main
      ref={observatory}
      className={`observatory ${presentation ? 'presentation-mode' : ''} ${airspaceVisible ? 'airspace-active' : ''} ${controlsVisible ? 'tv-controls-visible' : ''}`}
      onPointerMove={presentation ? showControls : undefined}
      onPointerDown={presentation ? showControls : undefined}
      onFocusCapture={presentation ? showControls : undefined}
    >
      <MobileControls
        mobile={isPhone}
        panel={phonePanel}
        setPanel={setPhonePanel}
        presentation={presentation}
        onTV={() => void enterPresentation()}
        onReturn={exitPresentation}
        harborVisible={airspaceVisible}
        harborUnavailable={harborUnavailable}
        onHarbor={toggleHarbor}
        onAbout={() => setInfoOpen(true)}
        weather={currentWeather}
        weatherAge={formatAge(currentWeather.observedAt, now)}
        temp={temp}
        WeatherIcon={WeatherIcon}
        observer={observer}
        onAirport={() => changeObserver({ ...observer, mode: 'airport' })}
        onNearby={() =>
          observer.viewpoint
            ? changeObserver({ ...observer, mode: 'nearby' })
            : setViewpointOpen(true)
        }
        onViewpoint={() => setViewpointOpen(true)}
        ambientOn={ambientOn}
        towerOn={towerOn}
        towerConnecting={towerConnecting}
        volume={volume}
        setVolume={setVolume}
        toggleAmbience={() => void toggleAmbience()}
        toggleTower={() => void toggleTower()}
        audioError={audioError}
        radioFailed={!!radioStatus}
        dismissError={() => {
          setRadioStatus(null);
          setAudioError(null);
        }}
      >
        <header className="site-header">
          <Link
            href="/"
            className="site-brand"
            aria-label={`${airport.brand.title}, home`}
          >
            <span className="brand-symbol">✳</span>
            <span>
              {airport.brand.wordmark}
              <span className="brand-period">.</span>
              <small>THE SKY, IN REAL TIME</small>
            </span>
          </Link>
          <div className="header-center">
            <span className={`live-pulse ${currentTraffic.freshness}`} />
            {status}
            <span className="header-divider" />
            {airport.city.toUpperCase()} · {airport.icao}
          </div>
          <div className="header-actions">
            <div className="header-time">
              <time suppressHydrationWarning>
                {now ? airportTime(now, true) : '--:--:--'}
              </time>
              <span>
                {now ? airportZone(now) : `${airport.city.toUpperCase()} TIME`}
              </span>
            </div>
            {hasAirportMap && presentation && !isPhone && (
              <HarborShortcut
                showing={airspaceVisible}
                unavailableReason={harborUnavailable}
                onToggle={toggleHarbor}
              />
            )}
            <button
              className="present-button"
              onClick={() =>
                void (presentation ? exitPresentation() : enterPresentation())
              }
              aria-label={presentation ? 'Exit TV Mode' : 'Enter TV Mode'}
            >
              {presentation ? <Minimize2 size={17} /> : <Tv size={17} />}
              <span>{presentation ? 'Exit TV' : 'TV Mode'}</span>
            </button>
          </div>
        </header>

        {hasAirportMap && presentation && (
          <Suspense fallback={null}>
            <LivingAirspace
              visible={airspaceVisible}
              active={airspaceVisible && pageVisible && !modalOpen}
              tracks={tracks}
              weather={currentWeather}
              daylight={sun.daylight}
              atmosphere={atmosphere}
              now={now}
              focusedId={featured?.flight.id ?? null}
              route={featuredRoute}
              onStatusChange={setAirspaceStatus}
            />
          </Suspense>
        )}

        <div className="page-body">
          {currentTraffic.freshness !== 'fresh' && (
            <output className="phone-only phone-feed-note">
              {status}
              {traffic.observedAt !== null &&
                ` · last report ${formatAge(traffic.observedAt, now)}`}
            </output>
          )}
          <section className="intro" aria-labelledby="intro-title">
            <div className="intro-copy">
              <p className="eyebrow">
                <span className="eyebrow-line" /> {airport.iata} / LIVE ARCADE
                OBSERVATORY <span className="eyebrow-index">/ 001</span>
              </p>
              <h1 id="intro-title">
                The sky is
                <br />
                <em>always on.</em>
              </h1>
              <p className="intro-description">
                {airport.name}, unfolding in real time. Flights, weather, and
                sound in one neon window.
              </p>
            </div>
            <div className="conditions-card">
              <div className="conditions-top">
                <span>WEATHER CHANNEL / LIVE</span>
                <span>{airport.weatherStation} / METAR</span>
              </div>
              <div className="conditions-main">
                <WeatherIcon size={35} strokeWidth={1.25} />
                <strong>{temp}</strong>
                <span>
                  {currentWeather.description || 'Waiting for weather'}
                </span>
              </div>
              <div className="conditions-bottom">
                <span>
                  <Wind size={14} />{' '}
                  {currentWeather.windSpeedKt === null
                    ? 'Wind —'
                    : `${Math.round(currentWeather.windSpeedKt)} kt wind`}
                </span>
                <span>
                  {currentWeather.freshness === 'unavailable'
                    ? 'No observation'
                    : `${currentWeather.freshness === 'stale' ? 'Stale · ' : ''}${formatAge(currentWeather.observedAt, now)}`}
                </span>
              </div>
            </div>
          </section>

          <div className="section-title">
            <span>AIRPORT MOMENTS / LIVE</span>
            <span className="section-rule" />
            <span>{localDate.toUpperCase()}</span>
          </div>
          <section
            className="observer-bar"
            aria-label="Viewing location"
            inert={airspaceVisible}
            aria-hidden={airspaceVisible}
          >
            <div className="observer-switch">
              <button
                aria-pressed={observer.mode === 'airport'}
                onClick={() => changeObserver({ ...observer, mode: 'airport' })}
              >
                Airport view
              </button>
              <button
                aria-pressed={observer.mode === 'nearby'}
                onClick={() =>
                  observer.viewpoint
                    ? changeObserver({ ...observer, mode: 'nearby' })
                    : setViewpointOpen(true)
                }
              >
                Near me
              </button>
            </div>
            {observer.mode === 'nearby' && (
              <span className="observer-status">
                {nearby.length
                  ? `${nearby.length} nearby · approximate, not sound identification`
                  : 'No nearby flight reported · showing airport activity'}
              </span>
            )}
            {observer.viewpoint && (
              <button
                className="observer-edit"
                onClick={() => setViewpointOpen(true)}
              >
                Viewing point ↗
              </button>
            )}
            {preferenceError && <output>{preferenceError}</output>}
          </section>
          <section
            className="flight-grid"
            aria-label="Live airport activity"
            inert={airspaceVisible}
            aria-hidden={airspaceVisible}
          >
            <button
              className="phone-only phone-view-trigger"
              onClick={() => setPhonePanel('view')}
              aria-label={`Viewing location: ${observer.mode === 'nearby' ? 'Near me' : 'Airport view'}. Change view`}
              aria-haspopup="dialog"
            >
              {observer.mode === 'nearby' ? 'Near me' : 'Airport view'}{' '}
              <ChevronDown size={14} />
            </button>
            <MomentCard
              featured={featured}
              moments={rotationMoments}
              onCycle={cycleMoment}
              active={!airspaceVisible && pageVisible && !modalOpen}
              onSelect={(flight) => choose(flight.id)}
              weather={currentWeather}
              atmosphere={atmosphere}
              status={status}
              now={now}
              route={featuredRoute}
              nearLabel={
                featuredNearby
                  ? `About ${featuredNearby.miles.toFixed(1)} mi ${featuredNearby.direction} of your viewing point`
                  : null
              }
            />
            {presentation && (
              <div className="tv-globe">
                <Suspense fallback={null}>
                  <ArcadeGlobe
                    route={featuredRoute}
                    active={!airspaceVisible && pageVisible && !modalOpen}
                  />
                </Suspense>
              </div>
            )}
            <nav
              className="phone-only phone-flight-actions"
              aria-label="Browse flights"
            >
              <button disabled={!canBrowse} onClick={() => cycleMoment(-1)}>
                <ArrowLeft size={16} />
                Previous
              </button>
              <button
                disabled={!featured}
                onClick={() => featured && choose(featured.flight.id)}
              >
                Flight details <ArrowUpRight size={16} />
              </button>
              <button disabled={!canBrowse} onClick={() => cycleMoment(1)}>
                Next
                <ArrowRight size={16} />
              </button>
            </nav>
          </section>
          <div className="phone-only phone-footnotes">
            {observer.mode === 'nearby' && !nearby.length && (
              <p className="phone-nearby-empty">
                No nearby flight reported · showing airport activity
              </p>
            )}
            {preferenceError && <output>{preferenceError}</output>}
            <div className="phone-footer-row">
              <span className="phone-sources">
                {positionSource ? (
                  <a
                    href={positionSource.href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {positionSource.name}
                  </a>
                ) : (
                  'ADS-B positions'
                )}
                {featuredRoute?.source === 'Flightradar24' && (
                  <span>· Flightradar24</span>
                )}
              </span>
              {observer.mode === 'nearby' && (
                <button
                  onClick={() => setRecentOpen(true)}
                  aria-haspopup="dialog"
                  aria-label={`Recently nearby, ${recentThree.length} ${recentThree.length === 1 ? 'flight' : 'flights'}. View history`}
                >
                  <History size={13} /> Recent
                  {recentThree.length > 0 && (
                    <span className="phone-recent-count">
                      {recentThree.length}
                    </span>
                  )}
                </button>
              )}
              <button onClick={() => setInfoOpen(true)}>
                About <Info size={13} />
              </button>
            </div>
          </div>
          {observer.mode === 'nearby' && (
            <section className="recent-nearby" aria-label="Recently nearby">
              <span className="recent-heading">
                RECENTLY NEARBY <small>LAST 5 MIN · THIS SESSION</small>
              </span>
              {recentThree.length ? (
                recentThree.map((item) => (
                  <button key={item.key} onClick={() => selectRecent(item)}>
                    <strong>{flightName(item.flight)}</strong>
                    <span>
                      {momentCopy[item.moment].title} ·{' '}
                      {formatAge(item.lastSeen, now)} · {item.miles.toFixed(1)}{' '}
                      mi {item.direction}
                    </span>
                  </button>
                ))
              ) : (
                <p>Nearby activity will collect here as you watch.</p>
              )}
            </section>
          )}
          <div className="below-cards">
            <p>
              <span className="tiny-diamond">✦</span> {active.length} aircraft
              reported within 20 nautical miles{' '}
              <span className="muted-separator">·</span> positions refresh every
              5 seconds
            </p>
            <button onClick={() => setInfoOpen(true)}>
              How this works <ArrowUpRight size={15} />
            </button>
          </div>
        </div>

        <footer className="soundbar">
          <div className="soundbar-label">
            <span className="sound-icon">
              <Headphones size={19} strokeWidth={1.6} />
            </span>
            <span>
              <strong>ARCADE ATMOSPHERE</strong>
              <small>Wind, gusts, temperature &amp; weather</small>
            </span>
          </div>
          <div className="sound-actions">
            {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- The live tower stream has no caption track. */}
            {HAS_TOWER && (
              /* oxlint-disable-next-line jsx-a11y/media-has-caption -- Live tower streams do not provide a caption track. */
              <audio
                ref={towerAudio}
                src={TOWER_STREAM_URL}
                preload="none"
                onPlay={() => setTowerOn(true)}
                onPlaying={() => setTowerConnecting(false)}
                onWaiting={() => setTowerConnecting(true)}
                onPause={() => {
                  setTowerOn(false);
                  setTowerConnecting(false);
                }}
                onEnded={() => {
                  setTowerOn(false);
                  setTowerConnecting(false);
                }}
                onError={() => {
                  setTowerOn(false);
                  setTowerConnecting(false);
                  setRadioStatus('failed');
                }}
              />
            )}
            <button
              className={`ambience-button ${ambientOn ? 'active' : ''}`}
              onClick={() => void toggleAmbience()}
              aria-pressed={ambientOn}
            >
              {ambientOn ? (
                <Pause size={15} fill="currentColor" />
              ) : (
                <Volume2 size={17} />
              )}
              <span>{ambientOn ? 'Pause ambience' : 'Play ambience'}</span>
            </button>
            <label className="volume-wrap">
              <span className="sr-only">Ambience volume</span>
              <VolumeX size={16} />
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(volume * 100)}
                onChange={(event) =>
                  setVolume(Number(event.target.value) / 100)
                }
                aria-label="Ambience volume"
              />
              <Volume2 size={16} />
            </label>
            {HAS_TOWER && (
              <>
                <span className="sound-divider" />
                <button
                  className={`tower-link ${towerOn || towerConnecting ? 'active' : ''}`}
                  onClick={() => void toggleTower()}
                  aria-pressed={towerOn || towerConnecting}
                  aria-label={
                    towerConnecting ? 'Stop connecting to tower' : undefined
                  }
                >
                  {towerOn ? (
                    <Pause size={15} fill="currentColor" />
                  ) : (
                    <Radio size={17} />
                  )}
                  {towerConnecting
                    ? 'Connecting to tower…'
                    : towerOn
                      ? 'Pause tower'
                      : 'Play tower'}
                </button>
                <label className="tower-volume">
                  <span className="sr-only">Tower volume</span>
                  <VolumeX size={16} />
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round(towerVolume * 100)}
                    onChange={(event) =>
                      setTowerVolume(Number(event.target.value) / 100)
                    }
                    aria-label="Tower volume"
                  />
                  <Volume2 size={16} />
                </label>
              </>
            )}
          </div>
          {(radioStatus || audioError) && (
            <output className="sound-message">
              <span>
                {audioError ??
                  'Tower stream could not play. Try the official player.'}
              </span>
              {radioStatus && (
                <a href={RADIO_URL} target="_blank" rel="noopener noreferrer">
                  Open official player ↗
                </a>
              )}
              <button
                aria-label="Dismiss message"
                onClick={() => {
                  setRadioStatus(null);
                  setAudioError(null);
                }}
              >
                <X size={14} />
              </button>
            </output>
          )}
        </footer>
      </MobileControls>

      {isPhone && recentOpen && (
        <ResponsiveDialog
          mobile
          label="Recently nearby"
          onClose={() => setRecentOpen(false)}
        >
          <h2>Recently nearby</h2>
          <p className="modal-note">
            Last 5 minutes · this session. These are past sightings, not sound
            identification.
          </p>
          <div className="phone-history">
            {recentThree.length ? (
              recentThree.map((item) => (
                <button key={item.key} onClick={() => selectRecent(item)}>
                  <span>
                    <strong>{flightName(item.flight)}</strong>
                    <small>
                      {momentCopy[item.moment].title} ·{' '}
                      {formatAge(item.lastSeen, now)} · {item.miles.toFixed(1)}{' '}
                      mi {item.direction}
                    </small>
                  </span>
                  <ArrowUpRight size={18} />
                </button>
              ))
            ) : (
              <p className="modal-note">
                Nearby activity will collect here as you watch. History starts
                when you open the page.
              </p>
            )}
          </div>
        </ResponsiveDialog>
      )}
      {viewpointOpen && (
        <ViewpointPicker
          mobile={isPhone}
          preferences={observer}
          onChange={changeObserver}
          onClose={() => setViewpointOpen(false)}
        />
      )}
      {(selectedId || selectedRecent) && (
        <ResponsiveDialog
          mobile={isPhone}
          label="Flight details"
          closeLabel="Close flight details"
          onClose={closeDetails}
        >
          {selected ? (
            <>
              <p className="modal-kicker">
                {selectedRecent ? 'RECENTLY NEARBY' : 'LIVE AIRCRAFT'}{' '}
                <span>·</span>{' '}
                {selectedPositionSource ? (
                  <a
                    href={selectedPositionSource.href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {selectedPositionSource.name}
                  </a>
                ) : (
                  'ADS-B POSITIONS'
                )}
              </p>
              <div className="modal-airline">
                <span
                  className="airline-mark"
                  style={{ backgroundColor: selected.airline.color }}
                >
                  ✦
                </span>
                {selected.airline.name}
              </div>
              <h2>{flightName(selected)}</h2>
              {selectedRoute?.flightNumber && (
                <p className="modal-phase">
                  Flight {selectedRoute.flightNumber}
                </p>
              )}
              {selectedRoute && (
                <p className="modal-route">
                  {selectedRoute.verification === 'usual' && 'Usually: '}
                  {selectedRoute.origin.city}{' '}
                  <span>{selectedRoute.origin.code}</span>
                  <ArrowRight size={16} aria-hidden="true" />
                  {selectedRoute.destination.city}{' '}
                  <span>{selectedRoute.destination.code}</span>
                </p>
              )}
              <Suspense fallback={null}>
                <ArcadeGlobe route={selectedRoute} />
              </Suspense>
              <p className="modal-phase">
                {selectedRecent
                  ? `Last seen: ${momentCopy[selectedRecent.moment].title}`
                  : `${phase(selected)} near ${airport.name}`}
              </p>
              {observer.viewpoint && (
                <p className="modal-phase">
                  About{' '}
                  {proximity(selected, observer.viewpoint).miles.toFixed(1)} mi{' '}
                  {proximity(selected, observer.viewpoint).direction} of your
                  viewing point
                </p>
              )}
              {(selectedRoute?.takeoffAt || selectedRoute?.landedAt) && (
                <p className="reported-events">
                  {selectedRoute.takeoffAt && (
                    <span>
                      Reported takeoff{' '}
                      {airportTime(selectedRoute.takeoffAt, false)}{' '}
                      {airportZone(selectedRoute.takeoffAt)}
                      {selectedRoute.takeoffRunway
                        ? ` · runway ${selectedRoute.takeoffRunway}`
                        : ''}
                    </span>
                  )}
                  {selectedRoute.landedAt && (
                    <span>
                      Reported landing{' '}
                      {airportTime(selectedRoute.landedAt, false)}{' '}
                      {airportZone(selectedRoute.landedAt)}
                      {selectedRoute.landingRunway
                        ? ` · runway ${selectedRoute.landingRunway}`
                        : ''}
                    </span>
                  )}
                </p>
              )}
              <div className="modal-stats">
                <div>
                  <span>CALLSIGN</span>
                  <strong>{selected.callsign ?? '—'}</strong>
                </div>
                <div>
                  <span>AIRCRAFT</span>
                  <strong>{selected.aircraftType ?? '—'}</strong>
                </div>
                <div>
                  <span>ALTITUDE</span>
                  <strong>
                    {selected.onGround
                      ? 'Ground'
                      : formatNumber(selected.altitudeFt, 'ft')}
                  </strong>
                </div>
                <div>
                  <span>GROUND SPEED</span>
                  <strong>{formatNumber(selected.speedKt, 'kt')}</strong>
                </div>
              </div>
              <p className="modal-note">
                Observed {formatAge(selected.observedAt, now)}.{' '}
                {selectedRecent &&
                  `Last position ${new Date(selected.observedAt).toLocaleTimeString()}. History is a snapshot, not a live position. `}
                {selectedRoute &&
                  (selectedRoute.verification === 'usual'
                    ? 'Origin and destination are a usual route learned from prior verified Flightradar24 legs for this callsign, not an exact match to this live leg. The position feed has no schedule or gate.'
                    : 'Origin and destination are matched to this live aircraft from Flightradar24. The position feed has no schedule or gate.')}
              </p>
            </>
          ) : (
            <>
              <h2>Position expired</h2>
              <p>This aircraft is no longer in the recent feed.</p>
            </>
          )}
        </ResponsiveDialog>
      )}
      {infoOpen && (
        <ResponsiveDialog
          mobile={isPhone}
          label={`About ${airport.brand.title}`}
          closeLabel="Close information"
          className="info-modal"
          onClose={() => setInfoOpen(false)}
        >
          <Info size={25} strokeWidth={1.5} />
          <p className="modal-kicker">ABOUT THIS WINDOW</p>
          <h2>The sky is always on.</h2>
          <p className="creator-byline">
            by{' '}
            <a
              href="https://juan.pemberthy.com"
              target="_blank"
              rel="noreferrer"
              aria-label="Juan Pemberthy’s website"
            >
              jpemberthy <ArrowUpRight size={14} />
            </a>
          </p>
          <p>{airport.brand.about}</p>
          <p>
            Aircraft positions come from{' '}
            <a href="https://www.adsb.lol/" target="_blank" rel="noreferrer">
              ADSB.lol
            </a>{' '}
            or{' '}
            <a href="https://adsb.fi/" target="_blank" rel="noreferrer">
              adsb.fi
            </a>
            ; each flight credits its position source. The current weather comes
            from{' '}
            <a
              href="https://aviationweather.gov/data/api/"
              target="_blank"
              rel="noreferrer"
            >
              NOAA
            </a>{' '}
            observations at {airport.weatherStation}. One card rotates through
            aircraft showing approach, landing, taxi, takeoff, and climb. These
            moments come from reported position, speed, climb, descent, and
            ground changes; some aircraft remain unclassified. Origin and
            destination, when shown, come from Flightradar24 live flight data
            and are matched to the exact aircraft address and callsign.
          </p>
          <p>
            The artwork and airport sound cues are illustrative; they are not
            recordings of the featured aircraft. The ambience is synthesized in
            your browser and changes with the weather; it begins only when you
            press Play.
            {HAS_TOWER && (
              <>
                {' '}
                The live tower has a separate Play control and can run alongside
                the ambience. On phones, use the device volume buttons for tower
                radio.{' '}
                <a href={RADIO_URL} target="_blank" rel="noreferrer">
                  Official tower player
                </a>{' '}
                is also available directly.
              </>
            )}
          </p>
          <p>
            Harbor geography ©{' '}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
            >
              OpenStreetMap contributors
            </a>
            .
          </p>
          <p className="modal-note">
            Near me uses your device-local viewing point to rank fresh, low
            flights and recent runway transitions. Multiple nearby flights are
            possible; this does not identify which aircraft made a sound.
            Altitude and distance are approximate. For enjoyment, not
            navigation. Press Esc to close this panel.
          </p>
        </ResponsiveDialog>
      )}
    </main>
  );
}
