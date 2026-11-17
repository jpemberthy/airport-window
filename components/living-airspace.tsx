'use client';

import { airport } from '@/lib/airport';

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { atmosphereProfile, type AtmosphereProfile } from '@/lib/atmosphere';
import {
  harborFrame,
  harborView,
  HARBOR_WIDTH,
  HARBOR_HEIGHT,
} from '@/lib/harbor-view';
import { drawHarbor, harborDayMix } from '@/lib/harbor-renderer';
import { HarborSurface } from '@/lib/harbor-surface';
import {
  HarborClock,
  HarborMotion,
  type HarborPose,
} from '@/lib/harbor-motion';
import type { TrackHistory, WeatherSnapshot } from '@/lib/types';
import type { FlightRoute } from '@/lib/flight-routes';

export type AirspaceStatus = 'loading' | 'ready' | 'error';
export const HARBOR_ASSETS = airport.map
  ? [
      airport.map.assets.night,
      airport.map.assets.day,
      airport.map.assets.aircraft,
    ]
  : [];

export default function LivingAirspace({
  active,
  visible = active,
  tracks,
  weather,
  daylight,
  atmosphere,
  now,
  focusedId,
  route = null,
  onStatusChange,
  reducedMotionOverride,
  synthetic = false,
}: {
  active: boolean;
  visible?: boolean;
  tracks: Map<string, TrackHistory>;
  weather: WeatherSnapshot;
  daylight: number;
  atmosphere?: AtmosphereProfile;
  now: number;
  focusedId: string | null;
  route?: FlightRoute | null;
  onStatusChange?: (status: AirspaceStatus) => void;
  reducedMotionOverride?: boolean;
  synthetic?: boolean;
}) {
  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const wake = useRef<() => void>(() => {});
  const [size, setSize] = useState({ width: 1280, height: 720 });
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [status, setStatus] = useState<AirspaceStatus>('loading');
  const [display, setDisplay] = useState<{
    now: number;
    poses: Map<string, HarborPose>;
    tracks: Map<string, TrackHistory>;
  } | null>(null);
  const reducedMotion = reducedMotionOverride ?? prefersReducedMotion;
  const profile = useMemo(
    () => atmosphere ?? atmosphereProfile(weather, daylight, now),
    [atmosphere, weather, daylight, now],
  );
  const frame = useMemo(() => harborFrame(size.width, size.height), [size]);
  const view = useMemo(
    () =>
      harborView(
        display?.tracks ?? tracks,
        display?.now ?? now,
        frame,
        reducedMotion,
        display?.poses,
      ),
    [tracks, now, frame, reducedMotion, display],
  );
  const current = useRef({
    active,
    tracks,
    now,
    focusedId,
    profile,
    wind: { direction: weather.windDirection, speed: weather.windSpeedKt },
    reducedMotion,
  });
  const reportStatus = useRef(onStatusChange);
  useLayoutEffect(() => {
    current.current = {
      active,
      tracks,
      now,
      focusedId,
      profile,
      wind: { direction: weather.windDirection, speed: weather.windSpeedKt },
      reducedMotion,
    };
    reportStatus.current = onStatusChange;
  });
  useEffect(() => {
    wake.current();
  }, [active, reducedMotion]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setPrefersReducedMotion(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  useEffect(() => {
    const element = canvas.current!;
    const context = element.getContext('2d');
    let disposed = false,
      loaded = false,
      raf = 0,
      timer = 0,
      last = 0;
    let viewport = { width: 1280, height: 720 };
    const clock = new HarborClock();
    const motion = new HarborMotion();
    const surface = new HarborSurface();
    const directions = new Map<string, number>();
    let running = false,
      lastHud = -Infinity,
      lastReduced = current.current.reducedMotion;
    const images = HARBOR_ASSETS.map(() => new Image());
    const statusChange = (value: AirspaceStatus) => {
      if (disposed) return;
      setStatus(value);
      reportStatus.current?.(value);
    };
    statusChange('loading');
    if (!context) {
      statusChange('error');
      return;
    }
    let smoothed = current.current.profile;
    function render(stamp: number) {
      raf = 0;
      if (
        disposed ||
        !loaded ||
        !context ||
        !current.current.active ||
        document.hidden
      )
        return;
      const source = current.current;
      const interval = source.reducedMotion ? 1000 : 1000 / 24;
      if (!last || stamp - last >= interval) {
        const elapsed = last ? Math.min(0.1, (stamp - last) / 1000) : 0.05;
        last = stamp;
        const scale = Math.min(
          1,
          1920 / viewport.width,
          1080 / viewport.height,
        );
        const w = Math.max(1, Math.round(viewport.width * scale));
        const h = Math.max(1, Math.round(viewport.height * scale));
        if (element.width !== w || element.height !== h) {
          element.width = w;
          element.height = h;
        }
        const f = harborFrame(w, h);
        clock.sync(source.now, stamp);
        const time = clock.read(stamp);
        const poses = surface.sample(
          source.tracks,
          motion.sample(source.tracks, time, source.reducedMotion),
          time,
          source.reducedMotion,
        );
        // HUD reads the same display samples, but never rerenders at canvas FPS.
        if (stamp - lastHud >= 1000) {
          lastHud = stamp;
          setDisplay({ now: time, poses, tracks: source.tracks });
        }
        const blend = source.reducedMotion ? 1 : 1 - Math.exp(-elapsed / 3.5);
        smoothed = {
          ...source.profile,
          cloudCover:
            smoothed.cloudCover +
            (source.profile.cloudCover - smoothed.cloudCover) * blend,
          particleDensity:
            smoothed.particleDensity +
            (source.profile.particleDensity - smoothed.particleDensity) * blend,
          windX:
            smoothed.windX + (source.profile.windX - smoothed.windX) * blend,
          precipitation:
            source.profile.precipitation ??
            (smoothed.particleDensity > 0.5 ? smoothed.precipitation : null),
        };
        drawHarbor(
          context,
          images[2],
          harborView(source.tracks, time, f, source.reducedMotion, poses),
          f,
          smoothed,
          source.wind,
          source.focusedId,
          stamp,
          source.reducedMotion,
          directions,
        );
        element.dataset.renderWidth = String(w);
        element.dataset.renderHeight = String(h);
        element.dataset.frames = String(
          Number(element.dataset.frames ?? 0) + 1,
        );
      }
      if (source.reducedMotion)
        timer = window.setTimeout(() => {
          raf = requestAnimationFrame(render);
        }, 1000);
      else raf = requestAnimationFrame(render);
    }
    const sync = () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      raf = 0;
      const next =
        !disposed && loaded && current.current.active && !document.hidden;
      if (next !== running || lastReduced !== current.current.reducedMotion) {
        running = next;
        lastReduced = current.current.reducedMotion;
        last = 0;
        lastHud = -Infinity;
        motion.clear();
        surface.clear();
        directions.clear();
        clock.reset(current.current.now, performance.now());
      }
      if (next) raf = requestAnimationFrame(render);
    };
    wake.current = sync;
    const resize = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (!width || !height) return;
      viewport = { width, height };
      setSize(viewport);
      sync();
    });
    resize.observe(root.current!);
    document.addEventListener('visibilitychange', sync);
    Promise.all(
      images.map(
        (img, i) =>
          new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('Harbor asset unavailable'));
            img.src = HARBOR_ASSETS[i];
          }),
      ),
    )
      .then(() => {
        if (!disposed) {
          loaded = true;
          statusChange('ready');
          sync();
        }
      })
      .catch(() => statusChange('error'));
    return () => {
      disposed = true;
      motion.clear();
      surface.clear();
      directions.clear();
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      resize.disconnect();
      wake.current = () => {};
      document.removeEventListener('visibilitychange', sync);
      images.forEach((img) => {
        img.onload = null;
        img.onerror = null;
      });
    };
  }, []);
  const focused = view.aircraft.find((a) => a.id === focusedId);
  const summaryLabel =
    view.feedTotal === 0
      ? `Quiet over ${airport.name}`
      : view.total === 0
        ? 'Quiet in this view'
        : 'IN THIS VIEW';
  const style = {
    '--harbor-day': harborDayMix(profile.daylight),
    '--harbor-brightness':
      0.8 + harborDayMix(profile.daylight) * 0.07 - profile.cloudCover * 0.09,
    '--harbor-haze': profile.distanceVeil * 0.5,
    '--harbor-wetness': profile.wetness * 0.12,
  } as CSSProperties;
  return (
    <section
      ref={root}
      style={style}
      className={`living-airspace harbor-scene ${visible && status === 'ready' ? 'is-active' : ''} ${reducedMotion ? 'harbor-reduced' : ''}`}
      aria-hidden={!visible}
      aria-label={`${synthetic ? 'Fictional flights. ' : ''}${view.total} aircraft in view, ${view.outside} outside view. Movement inferred from live positions.`}
      data-status={status}
    >
      <div
        className="harbor-world"
        style={{
          width: HARBOR_WIDTH * frame.scale,
          height: HARBOR_HEIGHT * frame.scale,
          left: frame.x,
          top: frame.y,
        }}
        aria-hidden="true"
      >
        {/* oxlint-disable-next-line next/no-img-element -- Authored, preloaded fixed-composition artwork. */}
        <img className="harbor-night" src={HARBOR_ASSETS[0]} alt="" />
        {/* oxlint-disable-next-line next/no-img-element -- Day and night share one registered composition. */}
        <img className="harbor-day" src={HARBOR_ASSETS[1]} alt="" />
      </div>
      <div className="harbor-atmosphere" aria-hidden="true" />
      <div className="harbor-vignette" aria-hidden="true" />
      <canvas ref={canvas} className="harbor-canvas" aria-hidden="true" />
      <div className="harbor-weather">
        <time>
          {new Date(now || 0).toLocaleTimeString('en-US', {
            timeZone: airport.timeZone,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })}{' '}
          <small>{airport.city.toUpperCase()}</small>
        </time>
        <span>
          {profile.known ? weather.description : 'Weather unavailable'}
          {profile.known && weather.windSpeedKt !== null
            ? ` · ${Math.round(weather.windSpeedKt)} kt`
            : ''}
        </span>
      </div>
      <div className="harbor-bottom">
        <div className="harbor-summary">
          <span className="harbor-kicker">
            {summaryLabel}
            {view.outside ? ` · +${view.outside} OUTSIDE VIEW` : ''}
          </span>
          <dl>
            {(['total', 'inbound', 'outbound', 'ground'] as const).map(
              (kind) => (
                <div key={kind} className={`harbor-count-${kind}`}>
                  <dt>
                    {kind === 'total'
                      ? 'aircraft'
                      : kind === 'ground'
                        ? 'on ground'
                        : kind}
                  </dt>
                  <dd>{view[kind]}</dd>
                </div>
              ),
            )}
          </dl>
          <small>Movement inferred from live positions</small>
        </div>
        {focused && (
          <div className="harbor-featured">
            <span className="harbor-kicker">
              FEATURED{!focused.inView ? ' · OUTSIDE VIEW' : ''}
            </span>
            <strong>
              {focused.flight.callsign ??
                focused.flight.registration ??
                focused.id}
            </strong>
            {route && (
              <span>
                {route.origin.city} → {route.destination.city}
              </span>
            )}
            <small>
              {focused.flight.aircraftType ?? 'Aircraft'}
              {focused.flight.altitudeFt !== null
                ? ` · ${Math.round(focused.flight.altitudeFt).toLocaleString()} ft`
                : ''}
            </small>
          </div>
        )}
      </div>
    </section>
  );
}
