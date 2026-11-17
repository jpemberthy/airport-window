import { airport, observerRadiusMiles, heightAboveAirport } from './airport';
import { AIRPORT } from './geo';
import { flightMoment, type LiveMoment } from './flight-story';
import type { AircraftTrack, TrackHistory } from './types';

export const OBSERVER_KEY = `airport-observer-v1:${airport.id}`;
export interface Viewpoint {
  lat: number;
  lon: number;
}
export interface ObserverPreferences {
  mode: 'airport' | 'nearby';
  viewpoint: Viewpoint | null;
}
export const DEFAULT_OBSERVER: ObserverPreferences = {
  mode: 'airport',
  viewpoint: null,
};
const MILES_PER_DEGREE = 69.0934;
export const HISTORY_MS = 5 * 60_000;

export function proximity(
  track: Pick<AircraftTrack, 'lat' | 'lon' | 'altitudeFt'>,
  point: Viewpoint,
) {
  const north = (track.lat - point.lat) * MILES_PER_DEGREE;
  const east =
    (track.lon - point.lon) *
    MILES_PER_DEGREE *
    Math.cos((point.lat * Math.PI) / 180);
  const miles = Math.hypot(north, east);
  const bearing = ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
  return {
    miles,
    // ADS-B altitude is approximate MSL, not measured height above the listener.
    slantMiles: Math.hypot(
      miles,
      (heightAboveAirport(track.altitudeFt) ?? 0) / 5280,
    ),
    direction: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][
      Math.round(bearing / 45) % 8
    ],
  };
}

export function validViewpoint(value: unknown): value is Viewpoint {
  if (!value || typeof value !== 'object') return false;
  const { lat, lon } = value as Viewpoint;
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    proximity({ lat, lon, altitudeFt: 0 }, AIRPORT).miles <= observerRadiusMiles
  );
}

export function readObserver(raw: string | null): ObserverPreferences {
  try {
    const value = JSON.parse(raw ?? 'null');
    if (!validViewpoint(value?.viewpoint)) return DEFAULT_OBSERVER;
    return {
      viewpoint: value.viewpoint,
      mode: value.mode === 'nearby' ? 'nearby' : 'airport',
    };
  } catch {
    return DEFAULT_OBSERVER;
  }
}

export interface NearbyMoment extends LiveMoment {
  miles: number;
  direction: string;
  transition: boolean;
}

export function nearbyMoments(
  tracks: Map<string, TrackHistory>,
  point: Viewpoint,
  now: number,
): NearbyMoment[] {
  const result: NearbyMoment[] = [];
  for (const history of tracks.values()) {
    const flight = history.current;
    const age = now - flight.observedAt;
    if (age < 0 || age >= 35_000) continue;
    const distance = proximity(flight, point);
    const transitionAge = now - (history.groundTransition?.observedAt ?? 0);
    const transition =
      !!history.groundTransition &&
      transitionAge >= 0 &&
      transitionAge < 60_000 &&
      proximity(flight, AIRPORT).miles < 3.5 * 1.15078 &&
      flight.onGround === !history.groundTransition.fromGround;
    const airborne =
      flight.onGround === false &&
      flight.altitudeFt !== null &&
      flight.altitudeFt >= 0 &&
      heightAboveAirport(flight.altitudeFt)! <= 6000;
    if (distance.miles > 5 || (!airborne && !transition)) continue;
    const moment =
      flightMoment(history, now) ??
      (transition
        ? history.groundTransition!.fromGround
          ? 'takeoff'
          : 'landing'
        : null);
    // Don't invent an arrival/departure for an unclassified level overflight.
    if (!moment) continue;
    result.push({
      flight,
      moment,
      miles: distance.miles,
      direction: distance.direction,
      transition,
      priority: distance.slantMiles - (transition ? 1 : 0),
    });
  }
  return result.sort(
    (a, b) =>
      a.priority! - b.priority! || a.flight.id.localeCompare(b.flight.id),
  );
}

export interface RecentNearby extends NearbyMoment {
  key: string;
  lastSeen: number;
}
export function rememberNearby(
  previous: RecentNearby[],
  candidates: NearbyMoment[],
  now: number,
): RecentNearby[] {
  const entries = new Map(
    previous
      .filter((item) => now - item.lastSeen < HISTORY_MS)
      .map((item) => [item.key, item]),
  );
  for (const item of candidates) {
    const key = `${item.flight.id}:${item.flight.callsign ?? ''}`;
    const old = entries.get(key);
    if (!old || item.flight.observedAt > old.lastSeen)
      entries.set(key, { ...item, key, lastSeen: item.flight.observedAt });
  }
  return [...entries.values()]
    .sort((a, b) => b.lastSeen - a.lastSeen || a.priority! - b.priority!)
    .slice(0, 100);
}
