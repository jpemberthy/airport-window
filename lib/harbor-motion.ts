import { airport } from './airport';
import { sampleTrack } from './tracks';
import type { TrackHistory } from './types';
import type { HarborSurfacePose } from './harbor-surface';

export type HarborPose = ReturnType<typeof sampleTrack> & {
  surface?: HarborSurfacePose;
};
type Vector = [number, number];
const METRES = 111_320;
const EAST_METRES = METRES * Math.cos((airport.center.lat * Math.PI) / 180);
const point = (p: { lat: number; lon: number }): Vector => [
  (p.lon - airport.center.lon) * EAST_METRES,
  (p.lat - airport.center.lat) * METRES,
];
const difference = (a: number, b: number) => ((a - b + 540) % 360) - 180;
const course = (heading: number): Vector => [
  Math.sin((heading * Math.PI) / 180),
  Math.cos((heading * Math.PI) / 180),
];
const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1];
const subtract = (a: Vector, b: Vector): Vector => [a[0] - b[0], a[1] - b[1]];
function travelHeading(v: Vector, onGround: boolean | null) {
  // Below walking speed, position noise must not spin a stationary aircraft.
  if (Math.hypot(...v) < (onGround === true ? 0.25 : 1)) return null;
  return ((Math.atan2(v[0], v[1]) * 180) / Math.PI + 360) % 360;
}

/** One monotonic presentation clock, not a new anchor on every React render. */
export class HarborClock {
  private input = 0;
  private anchor = 0;
  private stamp = 0;
  private last = 0;
  reset(now: number, stamp: number) {
    this.input = this.anchor = this.last = now;
    this.stamp = stamp;
  }
  sync(now: number, stamp: number) {
    if (now <= this.input) return;
    this.anchor = Math.max(now, this.read(stamp));
    this.input = now;
    this.stamp = stamp;
  }
  read(stamp: number) {
    this.last = Math.max(
      this.last,
      Math.min(
        this.input + 1000,
        this.anchor + Math.max(0, stamp - this.stamp),
      ),
    );
    return this.last;
  }
}

/** Keep the five-second buffer; smoothly spend the final two prediction seconds. */
export function harborTarget(history: TrackHistory, now: number): HarborPose {
  const a = history.current;
  const sampled = sampleTrack(history, now);
  const t = Math.max(0, Math.min(5, (now - a.observedAt - 5000) / 1000));
  if (t <= 3 || a.heading === null || a.speedKt === null) return sampled;
  const u = t - 3;
  const seconds = 3 + u - u ** 3 / 4 + u ** 4 / 16;
  const metres = a.speedKt * 0.514444 * seconds;
  const direction = course(a.heading);
  return {
    ...sampled,
    lat: a.lat + (direction[1] * metres) / METRES,
    lon:
      a.lon +
      (direction[0] * metres) / (METRES * Math.cos((a.lat * Math.PI) / 180)),
  };
}

function velocity(history: TrackHistory, now: number): Vector {
  if (now - history.current.observedAt >= 10_000) return [0, 0];
  const a = point(harborTarget(history, now));
  const b = point(harborTarget(history, now + 20));
  return [(b[0] - a[0]) / 0.02, (b[1] - a[1]) / 0.02];
}

/** Exact critically damped step relative to a locally linear moving target.
 * omega=3 settles a stationary correction by ~98% in two seconds. */
function spring(
  p: number,
  v: number,
  target: number,
  targetV: number,
  dt: number,
) {
  const error = p - (target - targetV * dt);
  const relativeV = v - targetV;
  const j = relativeV + 3 * error;
  const decay = Math.exp(-3 * dt);
  return [
    target + (error + j * dt) * decay,
    targetV + (relativeV - 3 * j * dt) * decay,
  ];
}

interface Motion {
  history: TrackHistory;
  p: Vector;
  v: Vector;
  heading: number | null;
  headingV: number;
  time: number;
  backwardReports: number;
  guard: { direction: Vector; since: number } | null;
  fade: { since: number; anchored: boolean } | null;
}

/** Presentation-only state. Never writes reports or changes inferred movement. */
export class HarborMotion {
  private states = new Map<string, Motion>();
  clear() {
    this.states.clear();
  }
  get size() {
    return this.states.size;
  }

  sample(
    tracks: ReadonlyMap<string, TrackHistory>,
    now: number,
    reduced = false,
  ) {
    const poses = new Map<string, HarborPose>();
    for (const [id, incoming] of tracks) {
      const report = incoming.current;
      if (
        now < report.observedAt ||
        now - report.observedAt >= 60_000 ||
        !Number.isFinite(report.lat) ||
        !Number.isFinite(report.lon)
      )
        continue;
      if (reduced) {
        poses.set(id, sampleTrack(incoming, now, true));
        continue;
      }
      let state = this.states.get(id);
      if (!state) {
        const pose = harborTarget(incoming, now);
        const v = velocity(incoming, now);
        state = {
          history: incoming,
          p: point(pose),
          v,
          heading: travelHeading(v, pose.onGround) ?? pose.heading,
          headingV: 0,
          time: now,
          backwardReports: 0,
          guard: null,
          fade: null,
        };
        this.states.set(id, state);
      }
      const previousReport = state.history.current;
      const newer =
        report.observedAt > previousReport.observedAt ||
        (report.observedAt === previousReport.observedAt &&
          report.positionSource !== previousReport.positionSource);
      if (newer) {
        const target = point(harborTarget(incoming, now));
        const error = subtract(target, state.p);
        const headingKnown =
          report.heading !== null && previousReport.heading !== null;
        const sameCourse =
          headingKnown &&
          Math.abs(difference(report.heading!, previousReport.heading!)) <= 30;
        const direction = course(previousReport.heading ?? 0);
        const displacement = subtract(point(report), point(previousReport));
        state.backwardReports =
          sameCourse && dot(displacement, direction) < -0.5
            ? state.backwardReports + 1
            : 0;
        if (
          Math.hypot(...error) > (report.onGround === true ? 30 : 200) ||
          report.positionSource !== previousReport.positionSource ||
          report.observedAt - previousReport.observedAt > 20_000
        ) {
          state.fade ??= { since: now, anchored: false };
          state.guard = null;
        } else if (
          sameCourse &&
          state.backwardReports < 2 &&
          dot(error, direction) < -0.5
        ) {
          state.guard ??= { direction, since: now };
        } else {
          state.guard = null;
        }
        state.history = incoming;
      }
      const pose = harborTarget(state.history, now);
      const target = point(pose);
      const targetV = velocity(state.history, now);
      const dt = Math.max(0, Math.min(0.1, (now - state.time) / 1000));
      state.time = now;
      if (state.guard) {
        if (dot(subtract(target, state.p), state.guard.direction) >= 0)
          state.guard = null;
        else if (now - state.guard.since >= 2000) {
          state.fade ??= { since: state.guard.since + 2000, anchored: false };
          state.guard = null;
        }
      }
      let alpha = 1;
      let frozen = now - state.history.current.observedAt >= 10_000;
      if (state.fade) {
        const elapsed = now - state.fade.since;
        if (elapsed < 200) {
          alpha = 1 - elapsed / 200;
          frozen = true;
        } else {
          if (!state.fade.anchored) {
            state.p = target;
            state.v = targetV;
            state.heading =
              travelHeading(targetV, pose.onGround) ?? pose.heading;
            state.headingV = 0;
            state.fade.anchored = true;
          }
          alpha = Math.min(1, (elapsed - 200) / 200);
          if (elapsed >= 400) state.fade = null;
        }
      }
      if (!frozen) {
        const next: Vector = [0, 0];
        for (const axis of [0, 1] as const) {
          const [p, v] = spring(
            state.p[axis],
            state.v[axis],
            target[axis],
            targetV[axis],
            dt,
          );
          next[axis] = p;
          state.v[axis] = v;
        }
        // A correction hold decelerates along the existing course, rather than
        // sliding sideways while its backwards component is suppressed. During
        // prediction's final slowdown, also prevent spring overshoot from
        // taking a small backwards step before the ten-second stop.
        const direction =
          state.guard?.direction ??
          (now - state.history.current.observedAt >= 8000 &&
          pose.heading !== null &&
          (pose.speedKt ?? 0) > 0
            ? course(pose.heading)
            : null);
        if (direction) {
          if (state.guard) {
            const forward = Math.max(
              0,
              dot(subtract(next, state.p), direction),
            );
            const forwardV = Math.max(0, dot(state.v, direction));
            for (const axis of [0, 1] as const) {
              next[axis] = state.p[axis] + forward * direction[axis];
              state.v[axis] = forwardV * direction[axis];
            }
          }
          const backward = Math.min(0, dot(subtract(next, state.p), direction));
          const backwardV = Math.min(0, dot(state.v, direction));
          for (const axis of [0, 1] as const) {
            next[axis] -= backward * direction[axis];
            state.v[axis] -= backwardV * direction[axis];
          }
        }
        const travelled = subtract(next, state.p);
        const bearing =
          dt > 0
            ? travelHeading(
                [travelled[0] / dt, travelled[1] / dt],
                pose.onGround,
              )
            : null;
        state.p = next;
        if (bearing !== null) {
          // Position has already been damped. A second heading spring lags the
          // visible path, especially through turns and report reconciliation.
          state.heading = bearing;
          state.headingV = 0;
        } else if (pose.heading === null || state.heading === null) {
          state.heading = pose.heading;
          state.headingV = 0;
        } else {
          const [heading, headingV] = spring(
            state.heading,
            state.headingV,
            state.heading + difference(pose.heading, state.heading),
            0,
            dt,
          );
          state.heading = ((heading % 360) + 360) % 360;
          state.headingV = headingV;
        }
      } else state.v = [0, 0];
      poses.set(id, {
        ...pose,
        lat: airport.center.lat + state.p[1] / METRES,
        lon: airport.center.lon + state.p[0] / EAST_METRES,
        heading: state.heading,
        opacity: pose.opacity * alpha,
      });
    }
    for (const id of this.states.keys())
      if (reduced || !poses.has(id)) this.states.delete(id);
    return poses;
  }
}
