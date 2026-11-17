import { describe, expect, it, vi } from 'vitest';
import { identifyAirline } from '../lib/airlines';
import { AIRPORT } from '../lib/geo';
import { unavailableWeather } from '../lib/normalize';
import { drawScene, type SceneState } from '../lib/renderer';
import type { AircraftTrack } from '../lib/types';

const now = Date.parse('2026-10-15T18:00:00Z');
const flight: AircraftTrack = {
  id: 'focus',
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

function drawingContext() {
  const methods = Object.fromEntries(
    [
      'fillRect',
      'drawImage',
      'save',
      'restore',
      'translate',
      'rotate',
      'beginPath',
      'ellipse',
      'arc',
      'fill',
      'stroke',
      'setLineDash',
      'moveTo',
      'lineTo',
      'fillText',
    ].map((name) => [name, vi.fn()]),
  );
  const strokeStyles: string[] = [];
  const context = {
    ...methods,
    canvas: { width: 1000, height: 600 },
    measureText: vi.fn(() => ({ width: 44 })),
  } as unknown as CanvasRenderingContext2D;
  Object.defineProperty(context, 'strokeStyle', {
    set(value) {
      strokeStyles.push(String(value));
    },
  });
  return { context, methods, strokeStyles };
}

function state(selectedId: string | null): SceneState {
  return {
    view: { center: [AIRPORT.lon, AIRPORT.lat], zoom: 0.4 },
    tracks: new Map([['focus', { previous: null, current: flight }]]),
    weather: unavailableWeather('', now),
    daylight: 1,
    selectedId,
    reducedMotion: true,
    activityKinds: new Map([['focus', 'inbound']]),
  };
}

describe('living airspace aircraft styling', () => {
  it('uses the movement category color and labels only the focused aircraft', () => {
    const focused = drawingContext();
    drawScene(
      focused.context,
      {} as HTMLCanvasElement,
      { width: 256 } as HTMLImageElement,
      state('focus'),
      now,
    );
    expect(focused.strokeStyles).toContain('#ffbe8c');
    expect(focused.methods.fillText).toHaveBeenCalledWith(
      'JBU1267',
      expect.any(Number),
      expect.any(Number),
    );

    const unfocused = drawingContext();
    drawScene(
      unfocused.context,
      {} as HTMLCanvasElement,
      { width: 256 } as HTMLImageElement,
      state(null),
      now,
    );
    expect(unfocused.methods.fillText).not.toHaveBeenCalledWith(
      'JBU1267',
      expect.any(Number),
      expect.any(Number),
    );
  });
});
