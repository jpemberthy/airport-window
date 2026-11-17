import { airport as homeAirport } from './airport';
import type { FlightMoment } from './flight-story';
import type { AircraftTrack } from './types';

export interface RouteAirport {
  icao: string;
  code: string;
  city: string;
  country?: string;
  lat?: number;
  lon?: number;
}

export interface FlightRoute {
  verification: 'exact' | 'usual';
  callsign: string;
  aircraftId: string;
  origin: RouteAirport;
  destination: RouteAirport;
  flightLegId?: string;
  flightNumber?: string;
  source?: 'Flightradar24';
  checkedAt?: number;
  expiresAt?: number;
  takeoffAt?: number;
  landedAt?: number;
  takeoffRunway?: string;
  landingRunway?: string;
}

export type RouteStatus =
  | 'disabled'
  | 'invalid'
  | 'storage-unavailable'
  | 'not-live'
  | 'ready'
  | 'usual'
  | 'missing'
  | 'pending'
  | 'paced'
  | 'daily-budget'
  | 'period-budget'
  | 'rate-limited'
  | 'unavailable';

const code = (value: unknown, pattern: RegExp): string | null =>
  typeof value === 'string' && pattern.test(value) ? value : null;

function distanceNm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const north = (aLat - bLat) * 60;
  const east = (aLon - bLon) * 60 * Math.cos((aLat * Math.PI) / 180);
  return Math.hypot(north, east);
}

/** Accept only a current FR24 record for this exact ADS-B aircraft and callsign. */
export function normalizeLiveFlightRoute(
  value: unknown,
  track: AircraftTrack,
  cityForCode: (code: string) => string | undefined,
  now = Date.now(),
): FlightRoute | null {
  if (!value || typeof value !== 'object') return null;
  const data = (value as Record<string, unknown>).data;
  if (!Array.isArray(data) || !track.callsign) return null;
  const callsign = track.callsign.trim().toUpperCase();
  const matches = data
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === 'object'),
    )
    .filter(
      (item) =>
        item.hex?.toString().toLowerCase() === track.id.toLowerCase() &&
        item.callsign === callsign &&
        typeof item.lat === 'number' &&
        typeof item.lon === 'number' &&
        distanceNm(item.lat, item.lon, track.lat, track.lon) <= 20 &&
        typeof item.timestamp === 'string' &&
        Number.isFinite(Date.parse(item.timestamp)) &&
        now - Date.parse(item.timestamp) >= -30_000 &&
        now - Date.parse(item.timestamp) <= 180_000,
    )
    .sort(
      (a, b) =>
        Date.parse(String(b.timestamp)) - Date.parse(String(a.timestamp)),
    );
  if (
    new Set(
      matches.map((item) =>
        JSON.stringify([item.fr24_id ?? '', item.orig_icao, item.dest_icao]),
      ),
    ).size !== 1
  )
    return null;
  const match = matches[0];
  if (!match) return null;
  const originIcao = code(match.orig_icao, /^[A-Z]{4}$/);
  const destinationIcao = code(match.dest_icao, /^[A-Z]{4}$/);
  if (
    !originIcao ||
    !destinationIcao ||
    originIcao === destinationIcao ||
    (originIcao !== homeAirport.icao && destinationIcao !== homeAirport.icao)
  )
    return null;
  const airport = (icao: string, iataValue: unknown): RouteAirport => {
    if (icao === homeAirport.icao)
      return {
        icao,
        code: homeAirport.iata,
        city: homeAirport.city,
        country: homeAirport.country,
        ...homeAirport.center,
      };
    const airportCode = code(iataValue, /^[A-Z]{3}$/) ?? icao;
    return {
      icao,
      code: airportCode,
      city: cityForCode(airportCode) ?? airportCode,
    };
  };
  return {
    verification: 'exact',
    callsign,
    aircraftId: track.id,
    origin: airport(originIcao, match.orig_iata),
    destination: airport(destinationIcao, match.dest_iata),
    ...(typeof match.fr24_id === 'string'
      ? { flightLegId: match.fr24_id }
      : {}),
    ...(typeof match.flight === 'string' ? { flightNumber: match.flight } : {}),
    source: 'Flightradar24',
    checkedAt: now,
  };
}

/** FR24 timestamps without a zone are documented as UTC, not browser local time. */
export function providerTime(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value))
    return null;
  const time = Date.parse(
    /[Zz]$|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`,
  );
  return Number.isFinite(time) ? time : null;
}

export function routeDirection(
  track: AircraftTrack,
): 'arrival' | 'departure' | 'unknown' {
  if (track.onGround !== false) return 'unknown';
  if ((track.verticalRateFpm ?? 0) <= -180) return 'arrival';
  if ((track.verticalRateFpm ?? 0) >= 180) return 'departure';
  return 'unknown';
}

export function routeMatchesTrack(
  route: FlightRoute,
  track: AircraftTrack,
): boolean {
  if (
    route.aircraftId !== track.id ||
    route.callsign !== track.callsign?.trim().toUpperCase()
  )
    return false;
  const direction = routeDirection(track);
  return (
    direction === 'unknown' ||
    (direction === 'arrival'
      ? route.destination.icao === homeAirport.icao
      : route.origin.icao === homeAirport.icao)
  );
}

/** A callsign is not a flight leg. Reject stale, ended, or ambiguous records. */
export function normalizeFlightSummary(
  value: unknown,
  track: AircraftTrack,
  cityForCode: (code: string) => string | undefined,
  now = Date.now(),
): FlightRoute | null {
  const data =
    value && typeof value === 'object'
      ? (value as { data?: unknown }).data
      : null;
  if (!Array.isArray(data)) return null;
  const matches = data.filter((row): row is Record<string, unknown> => {
    if (!row || typeof row !== 'object') return false;
    const first = providerTime(row.first_seen),
      last = providerTime(row.last_seen),
      landed = providerTime(row.datetime_landed);
    const ended = row.flight_ended === true || row.flight_ended === 'true';
    return (
      typeof row.fr24_id === 'string' &&
      row.fr24_id.length > 0 &&
      String(row.hex).toLowerCase() === track.id &&
      row.callsign === track.callsign?.trim().toUpperCase() &&
      first !== null &&
      last !== null &&
      first <= last &&
      now - first >= -30_000 &&
      now - first <= 24 * 3600_000 &&
      now - last >= -30_000 &&
      now - last <= 180_000 &&
      (row.flight_ended === false ||
        row.flight_ended === 'false' ||
        (ended &&
          track.onGround === true &&
          landed !== null &&
          now - landed >= 0 &&
          now - landed <= 60_000))
    );
  });
  // Do not resolve an ambiguous taxi / reused callsign by taking the newest row.
  const legs = new Set(matches.map((row) => row.fr24_id));
  if (legs.size !== 1) return null;
  const row = matches.sort(
    (a, b) => providerTime(b.last_seen)! - providerTime(a.last_seen)!,
  )[0];
  if (!row) return null;
  const dest =
    row.dest_icao_actual ??
    row.destination_icao_actual ??
    row.dest_icao ??
    row.destination_icao;
  const origin = row.orig_icao ?? row.origin_icao;
  const originIcao = code(origin, /^[A-Z]{4}$/);
  const destinationIcao = code(dest, /^[A-Z]{4}$/);
  if (
    !originIcao ||
    !destinationIcao ||
    originIcao === destinationIcao ||
    (originIcao !== homeAirport.icao && destinationIcao !== homeAirport.icao)
  )
    return null;
  const airport = (icao: string, iataValue: unknown): RouteAirport => {
    if (icao === homeAirport.icao)
      return {
        icao,
        code: homeAirport.iata,
        city: homeAirport.city,
        country: homeAirport.country,
        ...homeAirport.center,
      };
    const airportCode = code(iataValue, /^[A-Z]{3}$/) ?? icao;
    return {
      icao,
      code: airportCode,
      city: cityForCode(airportCode) ?? airportCode,
    };
  };
  // Summary Full does not contain a current position. Its provider recency is
  // established by last_seen above; the route API separately requires the
  // same aircraft to be fresh in the live traffic feed before this call.
  const route: FlightRoute = {
    verification: 'exact',
    callsign: track.callsign!.trim().toUpperCase(),
    aircraftId: track.id,
    origin: airport(originIcao, row.orig_iata),
    destination: airport(
      destinationIcao,
      row.dest_iata_actual ?? row.dest_iata,
    ),
    flightLegId: row.fr24_id as string,
    ...(typeof row.flight === 'string' ? { flightNumber: row.flight } : {}),
    source: 'Flightradar24',
    checkedAt: now,
  };
  if (!routeMatchesTrack(route, track)) return null;
  const event = (value: unknown) => {
    const time = providerTime(value);
    return time !== null &&
      time >= providerTime(row.first_seen)! - 60_000 &&
      time <= now
      ? time
      : undefined;
  };
  const takeoffAt = event(row.datetime_takeoff),
    landedAt = event(row.datetime_landed);
  const runway = (value: unknown) =>
    typeof value === 'string' && /^\d{2}[LRC]?$/.test(value)
      ? value
      : undefined;
  return {
    ...route,
    takeoffAt,
    landedAt,
    takeoffRunway: takeoffAt ? runway(row.runway_takeoff) : undefined,
    landingRunway: landedAt ? runway(row.runway_landed) : undefined,
  };
}

export function routeForMoment(
  route: FlightRoute | null,
  moment: FlightMoment,
): FlightRoute | null {
  if (!route) return null;
  if (moment === 'approach' || moment === 'landing')
    return route.destination.icao === homeAirport.icao ? route : null;
  if (moment === 'takeoff' || moment === 'climb')
    return route.origin.icao === homeAirport.icao ? route : null;
  return route;
}

export function routeCaption(route: FlightRoute, moment: FlightMoment): string {
  if (moment === 'approach' || moment === 'landing')
    return `${route.verification === 'usual' ? 'Usually from' : 'From'} ${route.origin.city} · ${route.origin.code}`;
  if (moment === 'takeoff' || moment === 'climb')
    return `${route.verification === 'usual' ? 'Usually to' : 'To'} ${route.destination.city} · ${route.destination.code}`;
  return `${route.origin.code} → ${route.destination.code}`;
}
