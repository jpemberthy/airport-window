// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { WeatherEffects } from '../components/weather-effects';
import { atmosphereProfile } from '../lib/atmosphere';
import { unavailableWeather } from '../lib/normalize';

const now = Date.parse('2026-09-27T18:00:00Z');
const rain = atmosphereProfile(
  {
    ...unavailableWeather('', 0),
    observedAt: now,
    precipitation: 'rain',
    precipitationIntensity: 'heavy',
  },
  0.4,
  now,
);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('weather canvas lifecycle', () => {
  it('draws one still frame for reduced motion without scheduling animation', () => {
    const fillRect = vi.fn();
    const stroke = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: vi.fn(),
      setTransform: vi.fn(),
      fillRect,
      stroke,
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(
      HTMLCanvasElement.prototype,
      'getBoundingClientRect',
    ).mockReturnValue({
      width: 960,
      height: 540,
    } as DOMRect);
    const requestFrame = vi.fn(() => 1);
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );

    render(<WeatherEffects profile={rain} />);
    expect(stroke).toHaveBeenCalled();
    expect(fillRect).not.toHaveBeenCalled();
    expect(requestFrame).not.toHaveBeenCalled();
  });
});
