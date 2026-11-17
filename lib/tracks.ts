import type { AircraftTrack, TrackHistory } from './types';
import { ageMs } from './normalize';
export function interpolateHeading(
  from: number,
  to: number,
  t: number,
): number {
  return (((from + (((to - from + 540) % 360) - 180) * t) % 360) + 360) % 360;
}
export function mergeTracks(
  previous: Map<string, TrackHistory>,
  incoming: AircraftTrack[],
  now = Date.now(),
): Map<string, TrackHistory> {
  const next = new Map(previous);
  for (const a of incoming) {
    const old = next.get(a.id);
    if (!old || a.observedAt > old.current.observedAt) {
      const sameSource = old?.current.positionSource === a.positionSource;
      const crossedGround =
        old &&
        sameSource &&
        old.current.onGround !== null &&
        a.onGround !== null &&
        old.current.onGround !== a.onGround &&
        a.observedAt - old.current.observedAt <= 30_000;
      next.set(a.id, {
        previous: sameSource ? (old?.current ?? null) : null,
        current: a,
        groundTransition: crossedGround
          ? {
              fromGround: old.current.onGround === true,
              observedAt: a.observedAt,
            }
          : sameSource
            ? (old?.groundTransition ?? null)
            : null,
      });
    }
  }
  for (const [id, h] of next)
    if (ageMs(h.current.observedAt, now) >= 60_000) next.delete(id);
  return next;
}
export function sampleTrack(
  history: TrackHistory,
  now = Date.now(),
  reducedMotion = false,
): AircraftTrack & { opacity: number } {
  const { current: a, previous: b } = history;
  const age = ageMs(a.observedAt, now),
    opacity = age <= 30_000 ? 1 : Math.max(0, 1 - (age - 30_000) / 30_000);
  if (reducedMotion) return { ...a, opacity };
  const renderTime = now - 5000;
  if (b && renderTime < a.observedAt && a.observedAt - b.observedAt <= 20_000) {
    const t = Math.max(
      0,
      Math.min(1, (renderTime - b.observedAt) / (a.observedAt - b.observedAt)),
    );
    return {
      ...a,
      lat: b.lat + (a.lat - b.lat) * t,
      lon: b.lon + (a.lon - b.lon) * t,
      heading:
        a.heading !== null && b.heading !== null
          ? interpolateHeading(b.heading, a.heading, t)
          : a.heading,
      altitudeFt:
        a.onGround !== b.onGround
          ? a.altitudeFt
          : a.altitudeFt !== null && b.altitudeFt !== null
            ? b.altitudeFt + (a.altitudeFt - b.altitudeFt) * t
            : a.altitudeFt,
      opacity,
    };
  }
  // Keep the five-second presentation buffer, but stop moving once the
  // newest observation is ten seconds old, even if no next poll arrives.
  const dt = Math.max(
    0,
    (Math.min(now, a.observedAt + 10_000) - 5000 - a.observedAt) / 1000,
  );
  if (a.heading === null || a.speedKt === null) return { ...a, opacity };
  const meters = a.speedKt * 0.514444 * dt,
    radians = (a.heading * Math.PI) / 180;
  return {
    ...a,
    lat: a.lat + (Math.cos(radians) * meters) / 111_320,
    lon:
      a.lon +
      (Math.sin(radians) * meters) /
        (111_320 * Math.cos((a.lat * Math.PI) / 180)),
    opacity,
  };
}
export function phase(a: AircraftTrack): string {
  if (a.onGround === true)
    return (a.speedKt ?? 0) > 3 ? 'Taxiing' : 'On ground';
  if (a.onGround === null) return 'Status unknown';
  if ((a.verticalRateFpm ?? 0) > 200) return 'Climbing';
  if ((a.verticalRateFpm ?? 0) < -200) return 'Descending';
  return 'Airborne';
}
