// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ArcadeGlobe from '../components/arcade-globe';
import type { FlightRoute } from '../lib/flight-routes';

const route: FlightRoute = {
  verification: 'exact',
  aircraftId: 'abcdef',
  callsign: 'TAP217',
  origin: {
    icao: 'LPPT',
    code: 'LIS',
    city: 'Lisbon',
    country: 'Portugal',
    lat: 38.774,
    lon: -9.135,
  },
  destination: {
    icao: 'KBOS',
    code: 'BOS',
    city: 'Boston',
    lat: 42.364,
    lon: -71.009,
  },
};
let frames: Map<number, FrameRequestCallback>;
let frameId = 0;
let reduce = false;
let context: Record<string, ReturnType<typeof vi.fn>>;
const step = (time: number) => {
  const pending = [...frames.values()];
  frames.clear();
  act(() => {
    pending.forEach((callback) => callback(time));
  });
};
beforeEach(() => {
  frames = new Map();
  reduce = false;
  context = Object.fromEntries(
    [
      'clearRect',
      'beginPath',
      'moveTo',
      'lineTo',
      'arc',
      'closePath',
      'fill',
      'stroke',
      'fillRect',
      'fillText',
    ].map((name) => [name, vi.fn()]),
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      frames.set(++frameId, callback);
      return frameId;
    }),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => {
      frames.delete(id);
    }),
  );
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return reduce;
    },
    addEventListener() {},
    removeEventListener() {},
  }));
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

describe('quiet arcade globe', () => {
  it('renders geographic endpoints, settles, and preserves orientation on metadata updates', () => {
    const { rerender } = render(<ArcadeGlobe route={route} />);
    step(1);
    step(1200);
    expect(context.fillText).toHaveBeenCalledWith(
      'BOS',
      expect.any(Number),
      expect.any(Number),
    );
    expect(context.fillText).toHaveBeenCalledWith(
      'LIS',
      expect.any(Number),
      expect.any(Number),
    );
    expect(screen.getByText('From Lisbon, Portugal')).toBeTruthy();
    expect(frames.size).toBe(0);
    rerender(<ArcadeGlobe route={{ ...route, checkedAt: 42 }} />);
    expect(frames.size).toBe(0);
  });
  it('uses Boston alone without inventing missing coordinates and retains route text', () => {
    render(
      <ArcadeGlobe
        route={{
          ...route,
          origin: { ...route.origin, lat: undefined, lon: undefined },
        }}
      />,
    );
    step(1);
    step(1200);
    expect(context.fillText.mock.calls.map((call) => call[0])).not.toContain(
      'LIS',
    );
    expect(screen.getByText('From Lisbon, Portugal')).toBeTruthy();
    expect(screen.getByText('LIS → BOS')).toBeTruthy();
    expect(screen.queryByText(/unavailable/i)).toBeNull();
  });
  it('keeps Boston visible without route placeholders when no route is available', () => {
    const { container } = render(<ArcadeGlobe route={null} />);
    step(1);
    step(1200);
    expect(screen.getByText('Boston, United States')).toBeTruthy();
    expect(container.querySelector('figcaption small')).toBeNull();
    expect(container.textContent).not.toMatch(/unavailable|routes appear/i);
    expect(context.fillText.mock.calls.map((call) => call[0])).toEqual([
      'BOS',
      'BOS',
    ]);
  });
  it('renders one frame with reduced motion and cancels when hidden/unmounted', () => {
    reduce = true;
    const { unmount } = render(<ArcadeGlobe route={route} />);
    step(1);
    expect(frames.size).toBe(0);
    expect(context.clearRect).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true,
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(frames.size).toBe(0);
    unmount();
    expect(frames.size).toBe(0);
  });
});
