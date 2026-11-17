import { heightAboveAirport } from './airport';
import { AIRPORT } from './geo';
import type { AircraftTrack, TrackHistory } from './types';

export type FlightDirection = 'arrival' | 'departure';
export const MOMENT_ORDER = [
  'approach',
  'landing',
  'taxi',
  'takeoff',
  'climb',
] as const;
export type FlightMoment = (typeof MOMENT_ORDER)[number];
export interface LiveMoment {
  flight: AircraftTrack;
  moment: FlightMoment;
  /** Lower scores are nearer the viewer; absent for the airport rotation. */
  priority?: number;
}

// The position feed has no airport pair or schedule. Only show a direction
// when the observed climb/descent or movement relative to Logan supports it.
export function flightDirection(history: TrackHistory): FlightDirection | null {
  const { current, previous } = history;
  if (current.onGround !== false) return null;
  const distance = distanceNm(current.lat, current.lon);
  if (distance > 16 || (heightAboveAirport(current.altitudeFt) ?? 0) > 12_000)
    return null;
  const rate = current.verticalRateFpm;
  if (rate !== null && rate <= -180) return 'arrival';
  if (rate !== null && rate >= 180) return 'departure';
  if (!previous || previous.onGround !== false) return null;
  const elapsed = current.observedAt - previous.observedAt;
  if (elapsed < 2000 || elapsed > 30000) return null;
  const before = distanceNm(previous.lat, previous.lon);
  const after = distanceNm(current.lat, current.lon);
  const change = after - before;
  if (
    Math.abs(change) < 0.25 ||
    distance > 12 ||
    (heightAboveAirport(current.altitudeFt) ?? 0) > 6000
  )
    return null;
  return change < 0 ? 'arrival' : 'departure';
}

function distanceNm(lat: number, lon: number) {
  const north = (lat - AIRPORT.lat) * 60;
  const east =
    (lon - AIRPORT.lon) * 60 * Math.cos((AIRPORT.lat * Math.PI) / 180);
  return Math.hypot(north, east);
}

/** A short lived transition is the strongest signal for touchdown or liftoff. */
export function flightMoment(
  history: TrackHistory,
  now: number,
): FlightMoment | null {
  const { current, groundTransition } = history;
  if (now - current.observedAt >= 60_000) return null;
  const distance = distanceNm(current.lat, current.lon);
  if (distance > 16) return null;
  if (
    groundTransition &&
    current.observedAt - groundTransition.observedAt < 22_000 &&
    distance < 3.5
  ) {
    if (
      groundTransition.fromGround &&
      current.onGround === false &&
      (current.altitudeFt === null ||
        heightAboveAirport(current.altitudeFt)! < 1500)
    )
      return 'takeoff';
    if (
      !groundTransition.fromGround &&
      current.onGround === true &&
      (current.speedKt === null || current.speedKt > 45)
    )
      return 'landing';
  }
  if (current.onGround === true)
    return distance < 3.5 &&
      (current.speedKt ?? 0) >= 4 &&
      (current.speedKt ?? 0) <= 45
      ? 'taxi'
      : null;
  const direction = flightDirection(history);
  if (direction === 'arrival')
    return distance < 2.5 &&
      current.altitudeFt !== null &&
      heightAboveAirport(current.altitudeFt)! < 400
      ? 'landing'
      : 'approach';
  if (direction === 'departure')
    return distance < 3.5 &&
      current.altitudeFt !== null &&
      heightAboveAirport(current.altitudeFt)! < 1500
      ? 'takeoff'
      : 'climb';
  return null;
}

/** Interleave phases so a busy approach does not hide every other scene. */
export function liveMoments(
  tracks: Map<string, TrackHistory>,
  now: number,
): LiveMoment[] {
  const groups = MOMENT_ORDER.map(() => [] as LiveMoment[]);
  for (const history of tracks.values()) {
    const moment = flightMoment(history, now);
    if (moment)
      groups[MOMENT_ORDER.indexOf(moment)].push({
        flight: history.current,
        moment,
      });
  }
  for (const group of groups)
    group.sort(
      (a, b) =>
        distanceNm(a.flight.lat, a.flight.lon) -
          distanceNm(b.flight.lat, b.flight.lon) ||
        a.flight.id.localeCompare(b.flight.id),
    );
  const result: LiveMoment[] = [];
  for (let index = 0; groups.some((group) => index < group.length); index++)
    for (const group of groups) if (group[index]) result.push(group[index]);
  return result;
}

export function flightName(track: AircraftTrack): string {
  const callsign = track.callsign?.trim().toUpperCase();
  const match = callsign?.match(/^[A-Z]{3}(\d+[A-Z]?)$/);
  if (match && track.airline.code) {
    const shortNames: Record<string, string> = {
      DAL: 'Delta',
      JBU: 'JetBlue',
      AAL: 'American',
      UAL: 'United',
      SWA: 'Southwest',
      BAW: 'British Airways',
      ASA: 'Alaska',
      ACA: 'Air Canada',
      KLM: 'KLM',
      AFR: 'Air France',
    };
    return `${shortNames[track.airline.code] ?? track.airline.name} ${match[1]}`;
  }
  return callsign ?? track.registration ?? 'Unidentified aircraft';
}

export function nearbyFlights(
  tracks: Map<string, TrackHistory>,
  direction: FlightDirection,
  now: number,
): AircraftTrack[] {
  return [...tracks.values()]
    .filter(({ current }) => now - current.observedAt < 60_000)
    .filter((history) => flightDirection(history) === direction)
    .map(({ current }) => current)
    .sort(
      (a, b) =>
        // Favor aircraft close to the airport, then a stable callsign order.
        distanceNm(a.lat, a.lon) - distanceNm(b.lat, b.lon) ||
        (a.callsign ?? a.id).localeCompare(b.callsign ?? b.id),
    );
}
