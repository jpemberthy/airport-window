// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LivingAirspace from '../components/living-airspace';
import {
  harborFixtureTracks,
  HARBOR_FIXTURE_EPOCH as now,
} from '../lib/harbor-fixtures';
import { calibrationScenario } from '../lib/weather-calibration';

const renderer = vi.hoisted(() => ({ drawHarbor: vi.fn() }));
vi.mock('../lib/harbor-renderer', async (original) => ({
  ...(await original<typeof import('../lib/harbor-renderer')>()),
  ...renderer,
}));
const weather = {
  ...calibrationScenario('clear-day').weather,
  observedAt: now,
};
const props = {
  active: false,
  tracks: harborFixtureTracks('normal', now),
  weather,
  daylight: 0,
  now,
  focusedId: 'harbor-0',
};
let frames: Map<number, FrameRequestCallback>,
  frameId: number,
  failImages: boolean;
let disconnect: ReturnType<typeof vi.fn>;
const images: { onload: (() => void) | null; onerror: (() => void) | null }[] =
  [];
function step(time: number) {
  const queued = [...frames.values()];
  frames.clear();
  act(() => queued.forEach((fn) => fn(time)));
}
beforeEach(() => {
  frames = new Map();
  frameId = 0;
  failImages = false;
  images.length = 0;
  disconnect = vi.fn();
  renderer.drawHarbor.mockClear();
  vi.stubGlobal('fetch', vi.fn());
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    frames.set(++frameId, fn);
    return frameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private cb: (entries: unknown[]) => void) {}
      observe() {
        this.cb([{ contentRect: { width: 3840, height: 2160 } }]);
      }
      disconnect = disconnect;
    },
  );
  vi.stubGlobal(
    'Image',
    class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {
        images.push(this);
      }
      set src(_url: string) {
        queueMicrotask(() => (failImages ? this.onerror?.() : this.onload?.()));
      }
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    {} as CanvasRenderingContext2D,
  );
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    value: false,
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('approved live harbor lifecycle', () => {
  it('leaves the map untitled while retaining weather, counts, focus and fictional-data disclosure', async () => {
    const { container } = render(
      <LivingAirspace {...props} active visible synthetic />,
    );
    await waitFor(() =>
      expect(container.querySelector('[data-status="ready"]')).not.toBeNull(),
    );
    expect(container.querySelector('header, h1, h2')).toBeNull();
    for (const copy of [
      'Logan + Winthrop',
      'THE LIVING HARBOR',
      'SAMPLE FLIGHTS',
      'LIVE POSITIONS',
    ]) {
      expect(container.textContent).not.toContain(copy);
    }
    expect(container.querySelector('.harbor-weather')!.textContent).toContain(
      weather.description,
    );
    expect(container.querySelectorAll('.harbor-summary dd')).toHaveLength(4);
    expect(container.querySelector('.harbor-featured')!.textContent).toContain(
      'JBU1267',
    );
    expect(container.querySelector('.harbor-attribution')).toBeNull();
    expect(container.textContent).not.toContain('Illustrated geography');
    expect(container.textContent).not.toContain('OpenStreetMap');
    expect(
      container.querySelector('section')!.getAttribute('aria-label'),
    ).toContain('Fictional flights');
  });
  it('keeps continuous displayed positions across unrelated React renders', async () => {
    let monotonic = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => monotonic);
    const moving = harborFixtureTracks('normal', now);
    const { rerender } = render(
      <LivingAirspace {...props} tracks={moving} active />,
    );
    await waitFor(() => expect(frames.size).toBe(1));
    step(100);
    step(500);
    const before = renderer.drawHarbor.mock.calls.at(-1)![2].aircraft[0];
    monotonic = 500;
    rerender(
      <LivingAirspace
        {...props}
        tracks={moving}
        active
        focusedId="different"
      />,
    );
    step(550);
    const after = renderer.drawHarbor.mock.calls.at(-1)![2].aircraft[0];
    const dx = after.x - before.x,
      dy = after.y - before.y;
    const start = renderer.drawHarbor.mock.calls[0][2].aircraft[0];
    expect(
      dx * (before.x - start.x) + dy * (before.y - start.y),
    ).toBeGreaterThan(0);
    const previous = renderer.drawHarbor.mock.calls.at(-2)![2].aircraft[0];
    expect(Math.hypot(dx, dy)).toBeLessThan(3);
    expect(after.flight.observedAt).toBe(previous.flight.observedAt);
    // A rerender must not move time back to the initial buffered observation.
    expect(after.flight.lon).not.toBe(
      renderer.drawHarbor.mock.calls[0][2].aircraft[0].flight.lon,
    );
    expect(fetch).not.toHaveBeenCalled();
  });
  it('preloads once with no API requests, caps 4K, and suspends while inactive/hidden/dialog-paused', async () => {
    const onStatusChange = vi.fn();
    const { container, rerender, unmount } = render(
      <LivingAirspace {...props} onStatusChange={onStatusChange} />,
    );
    await waitFor(() =>
      expect(onStatusChange).toHaveBeenLastCalledWith('ready'),
    );
    expect(images).toHaveLength(3);
    expect(fetch).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
    rerender(
      <LivingAirspace
        {...props}
        visible
        active
        onStatusChange={onStatusChange}
      />,
    );
    step(100);
    expect(container.querySelector('canvas')!.width).toBe(1920);
    expect(container.querySelector('canvas')!.height).toBe(1080);
    expect(renderer.drawHarbor).toHaveBeenCalledTimes(1);
    expect(renderer.drawHarbor.mock.calls[0][6]).toBe('harbor-0');
    for (let t = 101; t < 140; t++) step(t);
    expect(renderer.drawHarbor).toHaveBeenCalledTimes(1);
    rerender(
      <LivingAirspace
        {...props}
        visible
        active={false}
        onStatusChange={onStatusChange}
      />,
    );
    expect(container.querySelector('.is-active')).not.toBeNull();
    expect(frames.size).toBe(0);
    rerender(
      <LivingAirspace
        {...props}
        visible
        active
        onStatusChange={onStatusChange}
      />,
    );
    Object.defineProperty(document, 'hidden', { value: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(frames.size).toBe(0);
    unmount();
    expect(disconnect).toHaveBeenCalled();
    expect(images.every((i) => i.onload === null && i.onerror === null)).toBe(
      true,
    );
  });
  it('reports failed assets without an error screen or animation', async () => {
    failImages = true;
    const status = vi.fn();
    const { container } = render(
      <LivingAirspace {...props} active visible onStatusChange={status} />,
    );
    await waitFor(() => expect(status).toHaveBeenLastCalledWith('error'));
    expect(container.querySelector('.is-active')).toBeNull();
    expect(frames.size).toBe(0);
    expect(container.textContent).not.toContain('Error');
  });
  it('distinguishes an empty feed from offscreen aircraft and honors reduced motion', async () => {
    const { container, rerender } = render(
      <LivingAirspace
        {...props}
        tracks={new Map()}
        active
        reducedMotionOverride
      />,
    );
    await waitFor(() =>
      expect(container.querySelector('[data-status="ready"]')).not.toBeNull(),
    );
    expect(container.textContent).toContain('Quiet over Boston Logan');
    vi.useFakeTimers();
    step(100);
    step(200);
    expect(renderer.drawHarbor).toHaveBeenCalledTimes(1);
    expect(renderer.drawHarbor.mock.calls[0][8]).toBe(true);
    rerender(
      <LivingAirspace
        {...props}
        tracks={harborFixtureTracks('outside', now)}
        active
      />,
    );
    // A coherent snapshot is held until the next one-second HUD/render update.
    expect(container.textContent).toContain('Quiet over Boston Logan');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    step(1200);
    expect(container.textContent).toContain('Quiet in this view');
    expect(container.textContent).toContain('+6 OUTSIDE VIEW');
    expect(container.textContent).toContain('FEATURED · OUTSIDE VIEW');
  });
});
