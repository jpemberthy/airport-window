import { localMeters } from './geo';
import { heightAboveAirport } from './airport';
import { harborTaxiLanes } from './harbor-lanes';
import {
  harborHeading,
  harborRunways,
  projectHarbor,
  unprojectHarbor,
} from './harbor-view';
import type { HarborPose } from './harbor-motion';
import type { TrackHistory } from './types';

type Point = [number, number];
export interface HarborSurfacePose {
  point: Point;
  heading: number | null;
  strength: number;
  laneId: string | null;
}
export const HARBOR_SURFACE_MAX_METRES = 45;
const delta = (a: number, b: number) => ((a - b + 540) % 360) - 180;
const bearing = (a: Point, b: Point) =>
  ((Math.atan2(b[0] - a[0], a[1] - b[1]) * 180) / Math.PI + 360) % 360;
const fade = (v: number) => {
  const t = Math.max(0, Math.min(1, v));
  return t * t * (3 - 2 * t);
};
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function nearest(p: Point, a: Point, b: Point): Point {
  const x = b[0] - a[0],
    y = b[1] - a[1];
  const length = x * x + y * y;
  const t = length
    ? Math.max(0, Math.min(1, ((p[0] - a[0]) * x + (p[1] - a[1]) * y) / length))
    : 0;
  return [a[0] + t * x, a[1] + t * y];
}
const lanes = [
  ...harborRunways.map((r) => ({
    id: r.name,
    points: [r.artStart, r.artEnd],
    runway: r,
  })),
  ...harborTaxiLanes.map((lane) => ({ ...lane, runway: null })),
];
export interface HarborSurfaceMatch extends HarborSurfacePose {
  correctionMetres: number;
  score: number;
}

/** Match only nearby pavement consistent with observed ground travel. Nothing
 * here rewrites a report, assigns a real taxi clearance, or reroutes a flight. */
export function matchHarborSurface(
  pose: HarborPose,
  history: TrackHistory,
  previousLane: string | null = null,
): HarborSurfaceMatch | null {
  const report = history.current;
  const ground = report.onGround === true;
  const height = heightAboveAirport(report.altitudeFt);
  const rolling = (report.speedKt ?? 0) >= 1.5;
  const runwayFlight =
    report.onGround === false &&
    height !== null &&
    height < 250 &&
    (report.speedKt ?? 0) >= 35 &&
    (Math.abs(report.verticalRateFpm ?? 0) >= 180 ||
      history.previous?.onGround === true);
  if (
    (!ground && !runwayFlight) ||
    (ground && !rolling && !previousLane) ||
    pose.heading === null
  )
    return null;
  const p = projectHarbor(pose.lon, pose.lat);
  const h = harborHeading(pose.lon, pose.lat, pose.heading);
  const metres = localMeters(pose.lon, pose.lat);
  const limit = ground ? HARBOR_SURFACE_MAX_METRES : 25;
  let best: HarborSurfaceMatch | null = null;
  for (const lane of lanes) {
    if (!ground && !lane.runway) continue;
    if (lane.runway) {
      // Do not pull a parallel taxiway or a low flyover onto a runway merely
      // because the painted lines happen to be close together.
      const r = lane.runway;
      const a = localMeters(...r.start),
        b = localMeters(...r.end);
      const raw = localMeters(report.lon, report.lat);
      if (distance(raw, nearest(raw, a, b)) > (ground ? 32 : 25)) continue;
    }
    for (let i = 1; i < lane.points.length; i++) {
      const a = lane.points[i - 1],
        b = lane.points[i];
      const point = nearest(p, a, b);
      const pixels = distance(p, point);
      if (pixels > 16) continue;
      const forward = bearing(a, b);
      const heading =
        Math.abs(delta(h, forward)) <= 90 ? forward : (forward + 180) % 360;
      const difference = Math.abs(delta(heading, h));
      if (difference > (ground ? 35 : 15)) continue;
      const correctionMetres = distance(
        metres,
        localMeters(...unprojectHarbor(...point)),
      );
      if (correctionMetres > limit) continue;
      const score =
        pixels + difference * 0.08 - (previousLane === lane.id ? 2 : 0);
      const strength =
        (1 - fade((correctionMetres / limit - 0.7) / 0.3)) *
        (1 - fade((pixels - 12) / 4)) *
        (ground ? 1 : 1 - fade((height! - 75) / 175));
      if (!best || score < best.score)
        best = {
          point,
          heading,
          laneId: lane.id,
          correctionMetres,
          score,
          strength,
        };
    }
  }
  return best;
}

type State = {
  base: Point;
  offset: Point;
  pose: HarborSurfacePose;
  time: number;
  source: TrackHistory['current']['positionSource'];
  observedAt: number;
};

/** A small display-only offset after geographic motion, shared by the canvas
 * and HUD. Matching has lane hysteresis; acquisition/release never teleports. */
export class HarborSurface {
  private states = new Map<string, State>();
  clear() {
    this.states.clear();
  }
  get size() {
    return this.states.size;
  }
  sample(
    tracks: ReadonlyMap<string, TrackHistory>,
    poses: ReadonlyMap<string, HarborPose>,
    now: number,
    reduced = false,
  ) {
    const result = new Map<string, HarborPose>();
    for (const [id, pose] of poses) {
      const history = tracks.get(id);
      if (!history) continue;
      const base = projectHarbor(pose.lon, pose.lat);
      let state = this.states.get(id);
      if (
        state &&
        (state.source !== history.current.positionSource ||
          history.current.observedAt - state.observedAt > 20_000 ||
          distance(base, state.base) > 40)
      )
        state = undefined;
      const heading =
        pose.heading === null
          ? null
          : harborHeading(pose.lon, pose.lat, pose.heading);
      const match = matchHarborSurface(pose, history, state?.pose.laneId);
      const target: Point = match
        ? [
            (match.point[0] - base[0]) * match.strength,
            (match.point[1] - base[1]) * match.strength,
          ]
        : [0, 0];
      const frozen = now - history.current.observedAt >= 10_000;
      const blend =
        reduced || !state
          ? 1
          : frozen
            ? 0
            : 1 - Math.exp(-Math.max(0, Math.min(100, now - state.time)) / 250);
      const offset: Point = state
        ? [
            state.offset[0] + (target[0] - state.offset[0]) * blend,
            state.offset[1] + (target[1] - state.offset[1]) * blend,
          ]
        : target;
      // An offset can cross a registration triangle while it is releasing.
      // Recheck its geographic size rather than assuming a fixed pixel scale.
      if (!frozen && (offset[0] !== 0 || offset[1] !== 0)) {
        const origin = localMeters(pose.lon, pose.lat);
        const correction = (scale: number) =>
          distance(
            origin,
            localMeters(
              ...unprojectHarbor(
                base[0] + offset[0] * scale,
                base[1] + offset[1] * scale,
              ),
            ),
          );
        if (correction(1) > HARBOR_SURFACE_MAX_METRES) {
          let low = 0,
            high = 1;
          for (let i = 0; i < 10; i++) {
            const mid = (low + high) / 2;
            if (correction(mid) <= HARBOR_SURFACE_MAX_METRES) low = mid;
            else high = mid;
          }
          offset[0] *= low;
          offset[1] *= low;
        }
      }
      const strength = state
        ? state.pose.strength +
          ((match?.strength ?? 0) - state.pose.strength) * blend
        : (match?.strength ?? 0);
      const targetHeading =
        heading !== null &&
        match?.heading !== null &&
        match?.heading !== undefined
          ? (heading + delta(match.heading, heading) * match.strength + 360) %
            360
          : heading;
      const displayHeading =
        targetHeading === null
          ? null
          : state?.pose.heading === null || !state
            ? targetHeading
            : (state.pose.heading +
                delta(targetHeading, state.pose.heading) * blend +
                360) %
              360;
      const surface: HarborSurfacePose = {
        point: [base[0] + offset[0], base[1] + offset[1]],
        heading: strength > 0.01 ? displayHeading : heading,
        strength,
        laneId: match?.laneId ?? null,
      };
      this.states.set(id, {
        base,
        offset,
        pose: surface,
        time: now,
        source: history.current.positionSource,
        observedAt: history.current.observedAt,
      });
      result.set(id, { ...pose, surface });
    }
    for (const id of this.states.keys())
      if (!result.has(id)) this.states.delete(id);
    return result;
  }
}
