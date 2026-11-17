import { describe, expect, it, vi } from 'vitest';
import { drawHarbor } from '../lib/harbor-renderer';
import { harborFrame, harborView } from '../lib/harbor-view';
import {
  harborFixtureTracks,
  HARBOR_FIXTURE_EPOCH as now,
} from '../lib/harbor-fixtures';
import { atmosphereProfile } from '../lib/atmosphere';
import { unavailableWeather } from '../lib/normalize';

describe('harbor aircraft rendering', () => {
  it('labels only the featured visible aircraft, draws the neon atlas and omits offscreen traffic', () => {
    const drawImage = vi.fn(),
      fillText = vi.fn();
    const context = {
      clearRect: vi.fn(),
      createRadialGradient: () => ({ addColorStop: vi.fn() }),
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      measureText: () => ({ width: 50 }),
      drawImage,
      fillText,
    } as unknown as CanvasRenderingContext2D;
    const frame = harborFrame(1672, 941);
    const view = harborView(harborFixtureTracks('normal', now), now, frame);
    view.aircraft[0].x = 700;
    view.aircraft[0].y = 400;
    const profile = atmosphereProfile(unavailableWeather('', now), 0, now);
    drawHarbor(
      context,
      {} as HTMLImageElement,
      view,
      frame,
      profile,
      { direction: 270, speed: 4 },
      'harbor-0',
      1000,
      false,
    );
    expect(drawImage).toHaveBeenCalledTimes(view.total);
    expect(
      drawImage.mock.calls.every((call) => call[3] === 32 && call[4] === 32),
    ).toBe(true);
    expect(fillText).toHaveBeenCalledTimes(1);
    expect(fillText.mock.calls[0][0]).toBe('JBU1267');
    fillText.mockClear();
    drawHarbor(
      context,
      {} as HTMLImageElement,
      view,
      frame,
      profile,
      { direction: 270, speed: 4 },
      'missing',
      1000,
      true,
    );
    expect(fillText).not.toHaveBeenCalled();
  });
  it('aligns the authored surface sprite exactly with its lane tangent', () => {
    const rotate = vi.fn(),
      translate = vi.fn(),
      drawImage = vi.fn();
    const c = {
      clearRect: vi.fn(),
      createRadialGradient: () => ({ addColorStop: vi.fn() }),
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      rotate,
      translate,
      drawImage,
    } as unknown as CanvasRenderingContext2D;
    const frame = harborFrame(1672, 941);
    const view = harborView(harborFixtureTracks('normal', now), now, frame);
    view.aircraft = [
      {
        ...view.aircraft[0],
        inView: true,
        x: 700,
        y: 400,
        heading: 31,
        surfaceAligned: true,
      },
    ];
    drawHarbor(
      c,
      {} as HTMLImageElement,
      view,
      frame,
      atmosphereProfile(unavailableWeather('', now), 0, now),
      { direction: 270, speed: 0 },
      null,
      1000,
      false,
    );
    expect(translate).toHaveBeenCalledWith(700, 400);
    expect(rotate).toHaveBeenCalledWith((-14 * Math.PI) / 180);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(drawImage.mock.calls[0][1]).toBe(32);
  });
});
