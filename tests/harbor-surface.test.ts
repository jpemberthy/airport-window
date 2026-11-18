import { describe, expect, it } from 'vitest';
import {
  HarborSurface,
  matchHarborSurface,
  HARBOR_SURFACE_MAX_METRES,
} from '../lib/harbor-surface';
import {
  harborRunways,
  harborFrame,
  harborView,
  unprojectHarbor,
  projectHarbor,
} from '../lib/harbor-view';
import { harborTaxiLanes } from '../lib/harbor-lanes';
import { localMeters } from '../lib/geo';
import { airport } from '../lib/airport';
import {
  harborFixtureTracks,
  HARBOR_FIXTURE_EPOCH as now,
} from '../lib/harbor-fixtures';
import type { AircraftTrack, TrackHistory } from '../lib/types';
import { HarborMotion, type HarborPose } from '../lib/harbor-motion';
const template = harborFixtureTracks('normal', now).get('harbor-0')!.current;
type Point = [number, number];
const angle = (a: Point, b: Point) =>
  ((Math.atan2(b[0] - a[0], a[1] - b[1]) * 180) / Math.PI + 360) % 360;
const error = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
function at(
  p: Point,
  screenHeading: number,
  overrides: Partial<AircraftTrack> = {},
) {
  const [lon, lat] = unprojectHarbor(...p);
  const r = (screenHeading * Math.PI) / 180;
  const a = localMeters(lon, lat),
    b = localMeters(...unprojectHarbor(p[0] + Math.sin(r), p[1] - Math.cos(r)));
  const heading =
    ((Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI + 360) % 360;
  const current = {
    ...template,
    lon,
    lat,
    heading,
    onGround: true,
    altitudeFt: 0,
    speedKt: 12,
    ...overrides,
  };
  return {
    history: { current, previous: null } as TrackHistory,
    pose: { ...current, opacity: 1 } as HarborPose,
  };
}
function sampled(
  controller: HarborSurface,
  p: ReturnType<typeof at>,
  time = now,
  reduced = false,
) {
  return controller
    .sample(
      new Map([[p.pose.id, p.history]]),
      new Map([[p.pose.id, p.pose]]),
      time,
      reduced,
    )
    .get(p.pose.id)!;
}

describe('harbor pavement alignment', () => {
  it('round-trips registered geography without moving raw reports', () => {
    for (const r of harborRunways)
      for (const p of [r.start, r.end]) {
        const q = unprojectHarbor(...projectHarbor(...p));
        expect(q[0]).toBeCloseTo(p[0], 8);
        expect(q[1]).toBeCloseTo(p[1], 8);
      }
  });
  it.each([false, true])(
    'centers a runway roll and its nose in either direction (reverse=%s)',
    (reverse) => {
      const r = harborRunways[1];
      const heading = (angle(r.artStart, r.artEnd) + (reverse ? 180 : 0)) % 360;
      const p: Point = [
        r.artStart[0] * 0.75 + r.artEnd[0] * 0.25 + 3,
        r.artStart[1] * 0.75 + r.artEnd[1] * 0.25 + 3,
      ];
      const input = at(p, heading, { speedKt: 90 });
      const original = structuredClone(input.history);
      const match = matchHarborSurface(input.pose, input.history)!;
      expect(match.laneId).toBe(r.name);
      expect(match.strength).toBe(1);
      expect(error(match.heading!, heading)).toBeLessThan(0.001);
      const pose = sampled(new HarborSurface(), input);
      expect(pose.lat).toBe(input.pose.lat);
      expect(pose.lon).toBe(input.pose.lon);
      expect(pose.surface!.point).toEqual(match.point);
      expect(input.history).toEqual(original);
      expect(match.correctionMetres).toBeLessThan(HARBOR_SURFACE_MAX_METRES);
    },
  );
  it('matches a nearby parallel taxiway without pulling it onto the runway', () => {
    const lane = harborTaxiLanes.find((l) => l.id === 'runway09-parallel')!;
    const index = lane.points.findIndex(
      (p, i) => i > 0 && p[0] - lane.points[i - 1][0] > 100,
    );
    const a = lane.points[index - 1],
      b = lane.points[index];
    const p = at([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 3], angle(a, b));
    const match = matchHarborSurface(p.pose, p.history)!;
    expect(match.laneId).toBe(lane.id);
    expect(match.correctionMetres).toBeLessThan(30);
  });
  it('follows taxi curves continuously and lets the takeoff leave the surface', () => {
    const motion = new HarborMotion(),
      surface = new HarborSurface();
    let previous = new Map<string, HarborPose>();
    let matched = 0,
      groundSamples = 0,
      maxStep = 0;
    for (let elapsed = 0; elapsed <= 60000; elapsed += 50) {
      const time = now + elapsed,
        tracks = harborFixtureTracks('normal', time, 'surface');
      const poses = surface.sample(tracks, motion.sample(tracks, time), time);
      for (const [id, p] of poses) {
        const old = previous.get(id);
        if (p.onGround) {
          groundSamples++;
          if (p.surface!.strength > 0.8) matched++;
        }
        if (old && p.opacity === 1 && old.opacity === 1)
          maxStep = Math.max(
            maxStep,
            Math.hypot(
              p.surface!.point[0] - old.surface!.point[0],
              p.surface!.point[1] - old.surface!.point[1],
            ),
          );
      }
      previous = poses;
    }
    expect(matched / groundSamples).toBeGreaterThan(0.95);
    expect(maxStep).toBeLessThan(2);
    expect(previous.get('harbor-2')!.surface!.strength).toBeLessThan(0.001);
  });
  it('uses runway alignment only for a low, aligned landing or takeoff and fades it with altitude', () => {
    const r = harborRunways[1];
    const p: Point = [
      r.artStart[0] * 0.5 + r.artEnd[0] * 0.5 + 1,
      r.artStart[1] * 0.5 + r.artEnd[1] * 0.5 + 1,
    ];
    const values = [25, 150, 250].map((heightFt) => {
      const input = at(p, angle(r.artStart, r.artEnd), {
        onGround: false,
        altitudeFt: airport.elevationFt + heightFt,
        speedKt: 110,
        verticalRateFpm: -500,
      });
      return matchHarborSurface(input.pose, input.history)?.strength ?? 0;
    });
    expect(values[0]).toBe(1);
    expect(values[1]).toBeGreaterThan(0);
    expect(values[1]).toBeLessThan(1);
    expect(values[2]).toBe(0);
  });
  it('keeps each runway at their crossing instead of hopping to the other lane', () => {
    const a = harborRunways[0],
      b = harborRunways[5];
    const ax = a.artEnd[0] - a.artStart[0],
      ay = a.artEnd[1] - a.artStart[1];
    const bx = b.artEnd[0] - b.artStart[0],
      by = b.artEnd[1] - b.artStart[1];
    const t =
      ((b.artStart[0] - a.artStart[0]) * by -
        (b.artStart[1] - a.artStart[1]) * bx) /
      (ax * by - ay * bx);
    const crossing: Point = [a.artStart[0] + ax * t, a.artStart[1] + ay * t];
    for (const runway of [a, b]) {
      const heading = angle(runway.artStart, runway.artEnd),
        radians = (heading * Math.PI) / 180;
      for (let step = -10; step <= 10; step++) {
        const input = at(
          [
            crossing[0] + Math.sin(radians) * step,
            crossing[1] - Math.cos(radians) * step,
          ],
          heading,
          { speedKt: 80 },
        );
        expect(
          matchHarborSurface(input.pose, input.history, runway.name)?.laneId,
        ).toBe(runway.name);
      }
    }
  });
  it('leaves gates, unknown headings, distant positions, and flyovers alone', () => {
    const p: Point = [875, 645];
    for (const input of [
      at(p, 90, { speedKt: 0 }),
      at(p, 90, { heading: null }),
      at([1200, 600], 90),
      at(p, 90, {
        onGround: false,
        altitudeFt: 1500,
        speedKt: 100,
        verticalRateFpm: 800,
      }),
      at(p, 90, { onGround: null }),
    ]) {
      expect(matchHarborSurface(input.pose, input.history)).toBeNull();
      const output = sampled(new HarborSurface(), input);
      expect(output.surface!.point[0]).toBeCloseTo(
        projectHarbor(input.pose.lon, input.pose.lat)[0],
      );
      expect(output.surface!.strength).toBe(0);
    }
  });
  it('rejects a low aircraft over the parallel taxiway, even when a runway is nearby', () => {
    const p = at([875, 642], 90, {
      onGround: false,
      altitudeFt: 50,
      speedKt: 100,
      verticalRateFpm: 1000,
    });
    expect(matchHarborSurface(p.pose, p.history)).toBeNull();
  });
  it('releases alignment smoothly at liftoff and bypasses the easing for reduced motion', () => {
    const r = harborRunways[1];
    const input = at(
      [
        r.artStart[0] * 0.75 + r.artEnd[0] * 0.25 + 3,
        r.artStart[1] * 0.75 + r.artEnd[1] * 0.25 + 3,
      ],
      angle(r.artStart, r.artEnd),
      { speedKt: 90 },
    );
    const controller = new HarborSurface();
    const ground = sampled(controller, input);
    const airborne = at(
      projectHarbor(input.pose.lon, input.pose.lat),
      angle(r.artStart, r.artEnd),
      {
        onGround: false,
        altitudeFt: 500,
        speedKt: 100,
        verticalRateFpm: 1200,
        observedAt: now + 50,
      },
    );
    const first = sampled(controller, airborne, now + 50);
    expect(first.surface!.strength).toBeGreaterThan(0.7);
    expect(first.surface!.strength).toBeLessThan(ground.surface!.strength);
    for (let t = 100; t <= 2000; t += 50)
      sampled(controller, airborne, now + t);
    expect(
      sampled(controller, airborne, now + 2050).surface!.strength,
    ).toBeLessThan(0.001);
    const immediate = sampled(controller, input, now + 2100, true);
    expect(immediate.surface!.strength).toBe(1);
    expect(
      sampled(controller, airborne, now + 2150, true).surface!.strength,
    ).toBe(0);
  });
  it('shares the corrected position between counts and drawing, freezes when stale and cleans up', () => {
    const input = at([875, 645], 90);
    const controller = new HarborSurface();
    const pose = sampled(controller, input);
    const tracks = new Map([[input.pose.id, input.history]]),
      poses = new Map([[input.pose.id, pose]]);
    for (const frame of [
      harborFrame(390, 844),
      harborFrame(1920, 1080),
      harborFrame(3840, 2160),
    ]) {
      const view = harborView(tracks, now, frame, false, poses);
      expect(view.aircraft[0].x).toBeCloseTo(
        frame.x + pose.surface!.point[0] * frame.scale,
      );
      expect(view.total + view.outside).toBe(1);
    }
    const stop = sampled(controller, input, now + 10000);
    expect(sampled(controller, input, now + 20000).surface).toEqual(
      stop.surface,
    );
    expect(controller.size).toBe(1);
    controller.sample(new Map(), new Map(), now + 25000);
    expect(controller.size).toBe(0);
    sampled(controller, input);
    controller.clear();
    expect(controller.size).toBe(0);
  });
});
