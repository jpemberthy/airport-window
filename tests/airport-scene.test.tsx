// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AirportScene } from '../components/airport-scene';
import { identifyAirline } from '../lib/airlines';
import { AIRPORT } from '../lib/geo';
import { unavailableWeather } from '../lib/normalize';
import type { SceneState } from '../lib/renderer';

const renderer = vi.hoisted(() => ({
  drawScene: vi.fn((..._args: unknown[]) => []),
  groundLayer: vi.fn((..._args: unknown[]) => document.createElement('canvas')),
}));
vi.mock('../lib/renderer', async (original) => ({
  ...(await original<typeof import('../lib/renderer')>()),
  drawScene: renderer.drawScene,
  groundLayer: renderer.groundLayer,
}));

const now = Date.parse('2026-10-15T18:00:00Z');
const track = {
  id: 'featured',
  callsign: 'JBU1267',
  registration: null,
  aircraftType: 'A320',
  lat: AIRPORT.lat + 0.02,
  lon: AIRPORT.lon,
  altitudeFt: 1800,
  speedKt: 190,
  heading: 180,
  verticalRateFpm: -500,
  onGround: false,
  observedAt: now,
  airline: identifyAirline('JBU1267'),
};
const state: SceneState = {
  view: { center: [AIRPORT.lon, AIRPORT.lat], zoom: 1 },
  tracks: new Map([['featured', { previous: null, current: track }]]),
  weather: unavailableWeather('', now),
  daylight: 1,
  selectedId: 'featured',
  reducedMotion: false,
  activityKinds: new Map([['featured', 'inbound']]),
};

let frames: Map<number, FrameRequestCallback>;
let frameId = 0;
const step = (time: number) => {
  const pending = [...frames.values()];
  frames.clear();
  act(() => pending.forEach((callback) => callback(time)));
};

beforeEach(() => {
  frames = new Map();
  renderer.drawScene.mockClear();
  renderer.groundLayer.mockClear();
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      frames.set(++frameId, callback);
      return frameId;
    }),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => frames.delete(id)),
  );
  vi.stubGlobal(
    'Image',
    class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      width = 256;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    {} as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'clientWidth', 'get').mockReturnValue(
    3840,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'clientHeight', 'get').mockReturnValue(
    2160,
  );
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    value: false,
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('TV airport canvas lifecycle', () => {
  it('preloads while inactive, caps 4K backing resolution, and renders only while active', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ features: [], runways: [] }),
      })),
    );
    const status = vi.fn();
    const { container, rerender } = render(
      <AirportScene
        state={state}
        active={false}
        readOnly
        coverageNm={8}
        onStatusChange={status}
      />,
    );
    await waitFor(() => expect(status).toHaveBeenLastCalledWith('ready'));
    expect(renderer.drawScene).not.toHaveBeenCalled();
    rerender(
      <AirportScene
        state={state}
        active
        readOnly
        coverageNm={8}
        onStatusChange={status}
      />,
    );
    step(100);
    const canvas = container.querySelector('canvas')!;
    expect(canvas.width).toBe(1920);
    expect(canvas.height).toBe(1080);
    expect(renderer.drawScene).toHaveBeenCalledTimes(1);
    expect(renderer.drawScene.mock.calls[0][3]).toMatchObject({
      selectedId: 'featured',
      activityKinds: new Map([['featured', 'inbound']]),
      view: { center: [AIRPORT.lon, AIRPORT.lat] },
    });
    rerender(
      <AirportScene
        state={state}
        active={false}
        readOnly
        coverageNm={8}
        onStatusChange={status}
      />,
    );
    expect(frames.size).toBe(0);
    step(500);
    expect(renderer.drawScene).toHaveBeenCalledTimes(1);
  });

  it('reports asset failure and cleans up requests and animation on unmount', async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, options: RequestInit) => {
        signal = options.signal as AbortSignal;
        return Promise.reject(new Error('missing map'));
      }),
    );
    const status = vi.fn();
    const { unmount } = render(
      <AirportScene state={state} active readOnly onStatusChange={status} />,
    );
    await waitFor(() => expect(status).toHaveBeenLastCalledWith('error'));
    unmount();
    expect(signal?.aborted).toBe(true);
    expect(frames.size).toBe(0);
  });
});
