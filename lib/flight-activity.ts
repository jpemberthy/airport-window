import { flightDirection } from './flight-story';
import { AIRPORT } from './geo';
import type { TrackHistory } from './types';

export type ActivityKind = 'inbound' | 'outbound' | 'ground' | 'other';

export interface FlightActivity {
  total: number;
  inbound: number;
  outbound: number;
  ground: number;
  other: number;
  coverageNm: 3 | 8 | 20;
  kinds: Map<string, ActivityKind>;
}

export function distanceFromAirportNm(lat: number, lon: number) {
  const north = (lat - AIRPORT.lat) * 60;
  const east =
    (lon - AIRPORT.lon) * 60 * Math.cos((AIRPORT.lat * Math.PI) / 180);
  return Math.hypot(north, east);
}

/** Derive the calm, intentionally sparse summary used by the TV interlude. */
export function flightActivity(
  tracks: Map<string, TrackHistory>,
  now: number,
): FlightActivity {
  const result: FlightActivity = {
    total: 0,
    inbound: 0,
    outbound: 0,
    ground: 0,
    other: 0,
    coverageNm: 3,
    kinds: new Map(),
  };
  let farthest = 0;
  for (const [id, history] of tracks) {
    const age = now - history.current.observedAt;
    if (age < 0 || age >= 60_000) continue;
    const { current } = history;
    const direction = flightDirection(history);
    const kind: ActivityKind =
      current.onGround === true
        ? 'ground'
        : direction === 'arrival'
          ? 'inbound'
          : direction === 'departure'
            ? 'outbound'
            : 'other';
    result.total++;
    result[kind]++;
    result.kinds.set(id, kind);
    farthest = Math.max(
      farthest,
      distanceFromAirportNm(current.lat, current.lon),
    );
  }
  result.coverageNm = farthest <= 3 ? 3 : farthest <= 8 ? 8 : 20;
  return result;
}
