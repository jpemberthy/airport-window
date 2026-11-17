'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AIRPORT, unproject } from '@/lib/geo';
import {
  drawScene,
  groundLayer,
  type Hit,
  type MapData,
  type SceneState,
  type View,
} from '@/lib/renderer';

export function AirportScene({
  state,
  onSelect,
  onView,
  active = true,
  readOnly = false,
  coverageNm,
  ariaLabel,
  onStatusChange,
}: {
  state: SceneState;
  onSelect?: (id: string) => void;
  onView?: (view: View) => void;
  active?: boolean;
  readOnly?: boolean;
  coverageNm?: 3 | 8 | 20;
  ariaLabel?: string;
  onStatusChange?: (status: 'loading' | 'ready' | 'error') => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null),
    current = useRef(state),
    actions = useRef({ onSelect, onView, onStatusChange }),
    isActive = useRef(active),
    coverage = useRef(coverageNm),
    wake = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    current.current = state;
    actions.current = { onSelect, onView, onStatusChange };
    coverage.current = coverageNm;
  });
  useLayoutEffect(() => {
    isActive.current = active;
    wake.current();
  }, [active]);
  const [error, setError] = useState(false),
    [loaded, setLoaded] = useState(false),
    hits = useRef<Hit[]>([]),
    drag = useRef<{ x: number; y: number; view: View; moved: boolean } | null>(
      null,
    );
  useEffect(() => {
    const canvas = ref.current!;
    let disposed = false,
      frame = 0,
      base: HTMLCanvasElement | null = null,
      key = '',
      last = 0,
      frames = 0,
      measured = performance.now(),
      map: MapData;
    const images = [new Image(), new Image()];
    const controller = new AbortController();
    actions.current.onStatusChange?.('loading');
    const fittedView = (w: number, h: number, view: View): View => {
      const radius = coverage.current;
      if (!radius) return view;
      const base = Math.min(w / 5500, h / 3400);
      const radiusMeters = radius * 1852;
      const zoom = Math.max(
        0.03,
        Math.min(2.5, Math.min(w * 0.9, h * 0.86) / 2 / radiusMeters / base),
      );
      return { center: [AIRPORT.lon, AIRPORT.lat], zoom };
    };
    function render(stamp: number) {
      if (disposed) return;
      if (!isActive.current || document.hidden) return;
      const source = current.current;
      const cadence = source.reducedMotion ? 1000 : 1000 / 24;
      if (stamp - last >= cadence) {
        last = stamp - ((stamp - last) % cadence);
        const widthScale = Math.min(1, 1920 / Math.max(1, canvas.clientWidth));
        const heightScale = Math.min(
          1,
          1080 / Math.max(1, canvas.clientHeight),
        );
        const renderScale = Math.min(widthScale, heightScale);
        const w = Math.max(1, Math.round(canvas.clientWidth * renderScale)),
          h = Math.max(1, Math.round(canvas.clientHeight * renderScale)),
          s = { ...source, view: fittedView(w, h, source.view) };
        const nextKey = [
          w,
          h,
          s.view.zoom,
          ...s.view.center,
          Math.round(s.daylight * 20),
        ].join(':');
        if (key !== nextKey) {
          key = nextKey;
          canvas.width = w;
          canvas.height = h;
          base = groundLayer(map, images[1], w, h, s);
        }
        hits.current = drawScene(
          canvas.getContext('2d')!,
          base!,
          images[0],
          s,
          s.now ?? Date.now(),
        );
        frames++;
        if (stamp - measured > 5000) {
          canvas.dataset.fps = ((frames * 1000) / (stamp - measured)).toFixed(
            1,
          );
          measured = stamp;
          frames = 0;
        }
      }
      if (!document.hidden && isActive.current)
        frame = requestAnimationFrame(render);
    }
    function visibility() {
      cancelAnimationFrame(frame);
      last = 0;
      measured = performance.now();
      frames = 0;
      if (!document.hidden && map && isActive.current)
        frame = requestAnimationFrame(render);
    }
    wake.current = visibility;
    Promise.all([
      fetch('/data/logan-map.json', { signal: controller.signal }).then((r) => {
        if (!r.ok) throw new Error('Map unavailable');
        return r.json();
      }),
      ...images.map(
        (image, i) =>
          new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = reject;
            image.src = i ? '/sprites/buildings.png' : '/sprites/aircraft.png';
          }),
      ),
    ])
      .then(([data]) => {
        if (disposed) return;
        map = data as MapData;
        setLoaded(true);
        actions.current.onStatusChange?.('ready');
        if (isActive.current) frame = requestAnimationFrame(render);
      })
      .catch(() => {
        if (!disposed) {
          setError(true);
          actions.current.onStatusChange?.('error');
        }
      });
    document.addEventListener('visibilitychange', visibility);
    return () => {
      disposed = true;
      wake.current = () => {};
      controller.abort();
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', visibility);
      images.forEach((i) => {
        i.onload = null;
        i.onerror = null;
      });
    };
  }, []);
  function pointerPoint(e: React.PointerEvent<HTMLCanvasElement>) {
    const bounds = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - bounds.left) * e.currentTarget.width) / bounds.width,
      y: ((e.clientY - bounds.top) * e.currentTarget.height) / bounds.height,
    };
  }
  return (
    <>
      <canvas
        ref={ref}
        className="airport-canvas"
        tabIndex={readOnly ? undefined : 0}
        aria-hidden={readOnly || undefined}
        aria-label={
          readOnly
            ? undefined
            : (ariaLabel ??
              'Live pixel-art Logan map. Drag to pan or select an aircraft.')
        }
        data-motion={state.reducedMotion ? 'reduced' : 'animated'}
        onPointerDown={
          readOnly
            ? undefined
            : (e) => {
                if (e.button !== 0) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                const p = pointerPoint(e);
                drag.current = { ...p, view: state.view, moved: false };
              }
        }
        onPointerMove={
          readOnly
            ? undefined
            : (e) => {
                const p = pointerPoint(e),
                  d = drag.current;
                if (d) {
                  if (Math.hypot(p.x - d.x, p.y - d.y) > 4) d.moved = true;
                  if (d.moved) {
                    const center = unproject(
                      e.currentTarget.width * 0.53 - (p.x - d.x),
                      e.currentTarget.height * 0.51 - (p.y - d.y),
                      e.currentTarget.width,
                      e.currentTarget.height,
                      d.view.zoom,
                      d.view.center,
                    );
                    if (
                      Math.abs(center[0] - AIRPORT.lon) < 0.55 &&
                      Math.abs(center[1] - AIRPORT.lat) < 0.45
                    )
                      actions.current.onView?.({ ...d.view, center });
                  }
                } else
                  e.currentTarget.style.cursor = hits.current.some(
                    (h) => Math.hypot(h.x - p.x, h.y - p.y) < h.radius,
                  )
                    ? 'pointer'
                    : 'grab';
              }
        }
        onPointerUp={
          readOnly
            ? undefined
            : (e) => {
                const d = drag.current;
                drag.current = null;
                if (e.currentTarget.hasPointerCapture(e.pointerId))
                  e.currentTarget.releasePointerCapture(e.pointerId);
                if (!d || d.moved) return;
                const p = pointerPoint(e),
                  hit = [...hits.current]
                    .reverse()
                    .find((h) => Math.hypot(h.x - p.x, h.y - p.y) < h.radius);
                if (hit) actions.current.onSelect?.(hit.id);
              }
        }
        onPointerCancel={
          readOnly
            ? undefined
            : () => {
                drag.current = null;
              }
        }
      />
      {error ? (
        <div className="scene-notice" role="alert">
          The harbor artwork couldn’t load. Reload to try again; live aircraft
          are still available in the list.
        </div>
      ) : !loaded ? (
        <div className="scene-notice">Opening the harbor…</div>
      ) : null}
    </>
  );
}
