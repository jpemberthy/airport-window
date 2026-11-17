import { describe, expect, it } from 'vitest';
import { HarborClock, HarborMotion, harborTarget } from '../lib/harbor-motion';
import { sampleTrack } from '../lib/tracks';
import { harborSpriteDirection } from '../lib/harbor-renderer';
import { harborFrame, harborView } from '../lib/harbor-view';
import {
  harborFixtureTracks,
  HARBOR_FIXTURE_EPOCH,
} from '../lib/harbor-fixtures';
import type { AircraftTrack, TrackHistory } from '../lib/types';

const epoch = 100_000;
function report(
  north = 0,
  time = 0,
  changes: Partial<AircraftTrack> = {},
): AircraftTrack {
  return {
    id: 'abc123',
    callsign: 'TEST',
    registration: null,
    aircraftType: 'A320',
    lat: 42.364 + north / 111320,
    lon: -71.009,
    altitudeFt: 1200,
    onGround: false,
    heading: 0,
    speedKt: 100,
    verticalRateFpm: 0,
    observedAt: epoch + time,
    positionSource: 'adsb-lol',
    airline: { code: 'XX', name: 'Test', color: '#fff', sprite: 0 },
    ...changes,
  };
}
const tracks = (current = report(), previous: AircraftTrack | null = null) =>
  new Map<string, TrackHistory>([[current.id, { current, previous }]]);
const north = (pose: { lat: number }) => (pose.lat - 42.364) * 111320;
const pose = (
  controller: HarborMotion,
  map: Map<string, TrackHistory>,
  time: number,
  reduced = false,
) => controller.sample(map, epoch + time, reduced).get('abc123')!;

describe('harbor presentation clock', () => {
  it('does not rewind on unrelated rerenders, delayed ticks or older wall clocks', () => {
    const clock = new HarborClock();
    clock.reset(epoch, 100);
    expect(clock.read(600)).toBe(epoch + 500);
    clock.sync(epoch, 600);
    expect(clock.read(700)).toBe(epoch + 600);
    clock.sync(epoch + 400, 700);
    expect(clock.read(800)).toBe(epoch + 700);
    clock.sync(epoch - 1000, 900);
    expect(clock.read(1000)).toBe(epoch + 900);
    expect(clock.read(50_000)).toBe(epoch + 1400);
    clock.reset(epoch + 90_000, 100_000);
    expect(clock.read(100_050)).toBe(epoch + 90_050);
  });
});

describe('harbor motion continuity', () => {
  it('reproduces the old 46m correction, without jumping or reversing the new display', () => {
    const old = tracks(report(), report(-250, -5000));
    const next = tracks(report(200, 5000, { speedKt: 78 }), report());
    const rawBefore = sampleTrack(old.get('abc123')!, epoch + 8999);
    const rawAfter = sampleTrack(next.get('abc123')!, epoch + 9000);
    expect(north(rawBefore) - north(rawAfter)).toBeCloseTo(45.726, 2);
    const controller = new HarborMotion();
    for (let t = 0; t < 9000; t += 50) pose(controller, old, t);
    let last = north(pose(controller, old, 8999));
    const first = north(pose(controller, next, 9000));
    expect(Math.abs(first - last)).toBeLessThan(0.1);
    last = first;
    for (let t = 9050; t <= 11_500; t += 50) {
      const p = pose(controller, next, t);
      expect(north(p)).toBeGreaterThanOrEqual(last - 1e-6);
      expect(north(p) - last).toBeLessThan(8);
      expect(p.opacity).toBe(1);
      last = north(p);
    }
  });
  it('retargets repeated small corrections without replacing the displayed position', () => {
    const controller = new HarborMotion();
    let map = tracks(report(0, 0, { speedKt: 0 }));
    let last = pose(controller, map, 5000);
    for (let t = 5050; t < 8000; t += 50) {
      if (t % 500 === 0)
        map = tracks(report(10 + (t % 1000) / 100, t - 5000, { speedKt: 0 }));
      const next = pose(controller, map, t);
      expect(Math.abs(north(next) - north(last))).toBeLessThan(2);
      last = next;
    }
    expect(north(last)).toBeGreaterThan(5);
  });
  it('ignores duplicate/out-of-order poses, prunes expired/missing tracks, and does not mutate reports', () => {
    const controller = new HarborMotion();
    const current = Object.freeze(report(100, 1000, { speedKt: null }));
    const first = pose(controller, tracks(current), 6000);
    expect(pose(controller, tracks(report(-500, 0)), 6100).lat).toBe(first.lat);
    expect(pose(controller, tracks(report(-500, 1000)), 6200).lat).toBe(
      first.lat,
    );
    expect(controller.size).toBe(1);
    expect(controller.sample(tracks(current), epoch + 61_000).size).toBe(0);
    expect(controller.size).toBe(0);
    pose(controller, tracks(), 0);
    controller.sample(new Map(), epoch + 100);
    expect(controller.size).toBe(0);
    pose(controller, tracks(), 0);
    controller.clear();
    expect(controller.size).toBe(0);
  });
  it('decelerates predictions at 8–10 seconds and freezes all motion at ten', () => {
    const map = tracks();
    const h = map.get('abc123')!;
    const distance = (a: number, b: number) =>
      north(harborTarget(h, epoch + b)) - north(harborTarget(h, epoch + a));
    expect(distance(9900, 10_000)).toBeLessThan(distance(8900, 9000));
    expect(distance(8900, 9000)).toBeLessThan(distance(7900, 8000));
    const controller = new HarborMotion();
    let lastNorth = -Infinity;
    for (let t = 0; t <= 10_000; t += 50) {
      const next = north(pose(controller, map, t));
      expect(next).toBeGreaterThanOrEqual(lastNorth - 1e-6);
      lastNorth = next;
    }
    const stopped = pose(controller, map, 10_000);
    expect(pose(controller, map, 25_000).lat).toBe(stopped.lat);
    expect(pose(controller, map, 45_000).opacity).toBe(0.5);
    expect(controller.sample(map, epoch + 60_000).size).toBe(0);
  });
  it.each([90, null])(
    'faces observed travel when the reported bearing is %s',
    (heading) => {
      const controller = new HarborMotion();
      const map = tracks(
        report(250, 5000, { heading, speedKt: null }),
        report(0, 0, { heading, speedKt: null }),
      );
      pose(controller, map, 5000);
      for (let t = 5050; t < 10_000; t += 50) {
        const p = pose(controller, map, t);
        expect(p.heading).toBeCloseTo(0, 5);
      }
      expect(map.get('abc123')!.current.heading).toBe(heading);
    },
  );
  it('does not turn a nearly stationary taxiing plane to face position jitter', () => {
    const controller = new HarborMotion();
    const map = tracks(
      report(0.5, 5000, { heading: 90, onGround: true, speedKt: 0 }),
      report(0, 0, { heading: 90, onGround: true, speedKt: 0 }),
    );
    for (let t = 5000; t < 10_000; t += 50) {
      expect(pose(controller, map, t).heading).toBeCloseTo(90, 5);
    }
  });
  it.each([
    'steady',
    'delayed',
    'correction',
    'turns',
    'dropout',
    'runways',
  ] as const)(
    'keeps displayed bearings aligned with the projected path through %s',
    (scenario) => {
      const controller = new HarborMotion();
      const frame = harborFrame(1672, 941);
      let previous = new Map<
        string,
        ReturnType<typeof harborView>['aircraft'][number]
      >();
      let checked = 0;
      for (let t = 0; t < 60_000; t += 50) {
        const now = HARBOR_FIXTURE_EPOCH + t;
        const tracks = harborFixtureTracks('normal', now, scenario);
        const view = harborView(
          tracks,
          now,
          frame,
          false,
          controller.sample(tracks, now),
        );
        for (const plane of view.aircraft) {
          const old = previous.get(plane.id);
          if (
            !old ||
            !plane.inView ||
            plane.heading === null ||
            old.flight.opacity < 1 ||
            plane.flight.opacity < 1
          )
            continue;
          const dx = plane.x - old.x,
            dy = plane.y - old.y;
          if (Math.hypot(dx, dy) < 0.02) continue;
          const bearing = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
          // A finite projection tangent may straddle a mesh edge. The nose
          // still follows travel, rather than a separately lagging report.
          expect(
            Math.abs(((plane.heading - bearing + 540) % 360) - 180),
          ).toBeLessThan(10);
          checked++;
        }
        previous = new Map(view.aircraft.map((plane) => [plane.id, plane]));
      }
      expect(checked).toBeGreaterThan(500);
    },
  );
  it.each([
    ['airborne correction', report(500, 1000)],
    ['ground correction', report(40, 1000, { onGround: true })],
    ['provider change', report(5, 1000, { positionSource: 'adsb-fi' })],
    ['long gap', report(5, 30_000)],
  ])(
    'fades and reanchors a %s without drawing across the gap',
    (_name, changed) => {
      const controller = new HarborMotion();
      const start = changed.observedAt - epoch + 5000;
      const old = tracks(report(0, 0, { speedKt: null }));
      const initial = pose(controller, old, start);
      const next = tracks({ ...changed, speedKt: null });
      expect(pose(controller, next, start).lat).toBe(initial.lat);
      const halfway = pose(controller, next, start + 100);
      expect(halfway.lat).toBe(initial.lat);
      expect(halfway.opacity).toBe(0.5);
      expect(pose(controller, next, start + 200).opacity).toBe(0);
      expect(pose(controller, next, start + 400).lat).toBeCloseTo(
        changed.lat,
        8,
      );
      expect(pose(controller, next, start + 400).opacity).toBe(1);
    },
  );
  it('bounds a correction hold at two seconds then fades rather than hiding a persistent discrepancy', () => {
    const controller = new HarborMotion();
    pose(controller, tracks(report(20, 0, { speedKt: 0 })), 5000);
    const next = tracks(report(0, 1000, { speedKt: 0 }));
    for (let t = 6000; t < 8000; t += 50) {
      expect(north(pose(controller, next, t))).toBeCloseTo(20, 6);
    }
    expect(pose(controller, next, 8100).opacity).toBe(0.5);
    expect(north(pose(controller, next, 8400))).toBeCloseTo(0, 6);
  });
  it('allows real turns and two consecutive backward reports, including taxi reversals', () => {
    const controller = new HarborMotion();
    pose(
      controller,
      tracks(report(0, 0, { onGround: true, speedKt: 0 })),
      5000,
    );
    pose(
      controller,
      tracks(report(-5, 1000, { onGround: true, speedKt: 0 })),
      6000,
    );
    const second = tracks(report(-10, 2000, { onGround: true, speedKt: 0 }));
    expect(north(pose(controller, second, 7000))).toBeLessThan(0);
    const turning = new HarborMotion();
    pose(turning, tracks(report(0, 0, { speedKt: 0 })), 5000);
    const reverse = tracks(report(-10, 1000, { speedKt: 0, heading: 180 }));
    for (let t = 6000; t < 7900; t += 50) pose(turning, reverse, t);
    expect(north(pose(turning, reverse, 7900))).toBeLessThan(-9);
  });
  it('wraps heading through north, holds unknown data honestly, and bypasses effects for reduced motion', () => {
    const controller = new HarborMotion();
    pose(
      controller,
      tracks(report(0, 0, { heading: 355, speedKt: null })),
      5000,
    );
    const next = tracks(report(0, 1000, { heading: 5, speedKt: null }));
    for (let t = 6000; t < 8000; t += 50) {
      const heading = pose(controller, next, t).heading!;
      expect(heading > 350 || heading < 10).toBe(true);
    }
    const missing = tracks(report(10, 2000, { heading: null, speedKt: null }));
    expect(pose(controller, missing, 8000, true)).toMatchObject({
      heading: null,
      opacity: 1,
    });
    expect(pose(controller, missing, 8000, true).lat).toBe(
      missing.get('abc123')!.current.lat,
    );
    expect(controller.size).toBe(0);
  });
  it('uses hysteresis at sprite boundaries, including north wrap', () => {
    expect(harborSpriteDirection(24, 0)).toBe(0);
    expect(harborSpriteDirection(28, 0)).toBe(1);
    expect(harborSpriteDirection(21, 1)).toBe(1);
    expect(harborSpriteDirection(17, 1)).toBe(0);
    expect(harborSpriteDirection(335, 0)).toBe(0);
    expect(harborSpriteDirection(331, 0)).toBe(7);
  });
});

describe('honest motion fixtures', () => {
  it('reports speed/course consistent with observed travel and has no runway-wrap teleport', () => {
    for (let elapsed = 0; elapsed <= 950_000; elapsed += 5000) {
      const map = harborFixtureTracks('normal', HARBOR_FIXTURE_EPOCH + elapsed);
      for (const { current: a, previous: b } of map.values()) {
        const metres = Math.hypot(
          (a.lat - b!.lat) * 111320,
          (a.lon - b!.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180),
        );
        expect(metres).toBeLessThan(a.onGround ? 60 : 400);
        expect(Math.abs(metres / 5 / 0.514444 - a.speedKt!)).toBeLessThan(2);
      }
    }
  });
});
