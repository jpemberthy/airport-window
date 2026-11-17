import { airport as homeAirport } from './airport';
import airportCities from './airport-cities.json';
import airportMetadata from './airport-metadata.json';
import {
  normalizeFlightSummary,
  normalizeLiveFlightRoute,
  routeMatchesTrack,
  type FlightRoute,
  type RouteAirport,
} from './flight-routes';
import {
  RouteStore,
  type LearnedRouteEvidence,
  type RouteBudget,
  type RouteBudgetDenial,
} from './route-budget';
import type { AircraftTrack } from './types';

const PROVIDER_KEY = 'fr24';
const FAILURE_BACKOFF_SECONDS = [15, 30, 60, 120, 300] as const;

function providerRetryAfter(value: string | null, now: number) {
  if (!value) return 60;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(1, seconds);
  const date = Date.parse(value);
  return Number.isFinite(date)
    ? Math.max(1, Math.ceil((date - now) / 1000))
    : 60;
}

const city = (code: string) => (airportCities as Record<string, string>)[code];
const airport = (icao: string): RouteAirport => {
  if (icao === homeAirport.icao)
    return {
      icao,
      code: homeAirport.iata,
      city: homeAirport.city,
      country: homeAirport.country,
      ...homeAirport.center,
    };
  const metadata = (
    airportMetadata as Record<string, Omit<RouteAirport, 'icao'>>
  )[icao];
  return metadata ? { icao, ...metadata } : { icao, code: icao, city: icao };
};

export function enrichRoute(
  route: FlightRoute,
  expiresAt: number,
): FlightRoute {
  return {
    ...route,
    origin: { ...route.origin, ...airport(route.origin.icao) },
    destination: {
      ...route.destination,
      ...airport(route.destination.icao),
    },
    expiresAt,
  };
}

export function learnedFlightRoute(
  track: AircraftTrack,
  evidence: LearnedRouteEvidence,
  expiresAt: number,
): FlightRoute | null {
  if (
    !track.callsign ||
    evidence.originIcao === evidence.destinationIcao ||
    (evidence.originIcao !== homeAirport.icao &&
      evidence.destinationIcao !== homeAirport.icao)
  )
    return null;
  const route: FlightRoute = {
    verification: 'usual',
    callsign: track.callsign.trim().toUpperCase(),
    aircraftId: track.id,
    origin: airport(evidence.originIcao),
    destination: airport(evidence.destinationIcao),
    source: 'Flightradar24',
    checkedAt: Date.now(),
    expiresAt,
  };
  return routeMatchesTrack(route, track) ? route : null;
}

type ProviderRequest =
  | { kind: 'ok'; payload: unknown }
  | {
      kind: 'stopped';
      status: RouteBudgetDenial | 'unavailable';
      budgetDenial?: RouteBudgetDenial;
    };

export async function fetchRoute(
  track: AircraftTrack,
  store: RouteStore,
  key: string,
  lease: string,
  budget: RouteBudget,
  token: string,
): Promise<{
  route: FlightRoute | null;
  status: 'ready' | 'missing' | RouteBudgetDenial | 'unavailable';
  budgetDenial?: RouteBudgetDenial;
}> {
  async function request(summary: boolean): Promise<ProviderRequest> {
    const now = Date.now();
    const state = await store.providerState(PROVIDER_KEY);
    if (state && state.nextAttemptAt > now)
      return {
        kind: 'stopped',
        status: state.reason ?? 'unavailable',
      };

    // Both calls ask for no more than five records. Summary covers only the
    // previous 24 hours, so its maximum is five recent historical records × 3.
    const maximum = summary ? 15 : 40;
    const reservation = await store.reserve(key, lease, maximum, budget, now);
    if (!reservation.ok)
      return {
        kind: 'stopped',
        status: reservation.reason,
        budgetDenial: reservation.reason,
      };

    const url = new URL(
      `https://fr24api.flightradar24.com/api/${summary ? 'flight-summary/full' : 'live/flight-positions/full'}`,
    );
    url.searchParams.set('callsigns', track.callsign!.trim().toUpperCase());
    const registration = track.registration?.trim().toUpperCase();
    if (registration && /^[A-Z0-9-]{2,12}$/.test(registration))
      url.searchParams.set('registrations', registration);
    url.searchParams.set('limit', '5');
    if (summary) {
      url.searchParams.set(
        'flight_datetime_from',
        new Date(now - 24 * 3600_000).toISOString().slice(0, 19),
      );
      url.searchParams.set(
        'flight_datetime_to',
        new Date(now).toISOString().slice(0, 19),
      );
      url.searchParams.set('sort', 'desc');
      url.searchParams.set('airports', `both:${homeAirport.icao}`);
    }

    const started = Date.now();
    const fail = async (
      status: number | null,
      retryAfter: string | null,
    ): Promise<ProviderRequest> => {
      const failedAt = Date.now();
      const previous = await store.providerState(PROVIDER_KEY);
      const failures = Math.min((previous?.failures ?? 0) + 1, 20);
      const reason = status === 429 ? 'rate-limited' : 'unavailable';
      const delaySeconds =
        status === 429
          ? providerRetryAfter(retryAfter, failedAt)
          : status !== null && status < 500
            ? 300
            : FAILURE_BACKOFF_SECONDS[
                Math.min(failures - 1, FAILURE_BACKOFF_SECONDS.length - 1)
              ];
      await store.providerFailed(
        PROVIDER_KEY,
        {
          nextAttemptAt: failedAt + delaySeconds * 1000,
          failures,
          reason,
          status,
        },
        failedAt,
      );
      await store.metric(now, {
        providerCalls: 1,
        latencyMs: failedAt - started,
        ...(status === 429 ? { upstream429s: 1 } : { otherFailures: 1 }),
      });
      if (process.env.NODE_ENV === 'development')
        console.warn('FR24 lookup cooling down', {
          endpoint: summary ? 'summary' : 'positions',
          status,
          retrySeconds: delaySeconds,
        });
      return { kind: 'stopped', status: reason };
    };

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'Accept-Version': 'v1',
          Authorization: `Bearer ${token}`,
        },
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      return fail(null, null);
    }
    if (!response.ok) {
      const retryAfter = response.headers.get('Retry-After');
      await response.body?.cancel();
      return fail(response.status, retryAfter);
    }

    let payload: { data?: unknown };
    try {
      payload = (await response.json()) as { data?: unknown };
    } catch {
      return fail(null, null);
    }
    if (
      !Array.isArray(payload.data) ||
      payload.data.length > 5 ||
      payload.data.some((row) => !row || typeof row !== 'object')
    )
      return fail(null, null);

    const cost = summary
      ? payload.data.reduce(
          (sum, row) =>
            sum +
            (row.flight_ended === false || row.flight_ended === 'false'
              ? 2
              : 3),
          0,
        )
      : payload.data.length * 8;
    await store.settle(reservation.id, Math.max(1, cost));
    const succeededAt = Date.now();
    await store.providerSucceeded(PROVIDER_KEY, succeededAt);
    await store.metric(now, {
      providerCalls: 1,
      latencyMs: succeededAt - started,
    });
    return { kind: 'ok', payload };
  }

  const summary = await request(true);
  if (summary.kind === 'stopped')
    return {
      route: null,
      status: summary.status,
      budgetDenial: summary.budgetDenial,
    };
  let route = normalizeFlightSummary(summary.payload, track, city);
  if (!route) {
    const positions = await request(false);
    if (positions.kind === 'stopped')
      return {
        route: null,
        status: positions.status,
        budgetDenial: positions.budgetDenial,
      };
    route = normalizeLiveFlightRoute(positions.payload, track, city);
    if (route && !routeMatchesTrack(route, track)) route = null;
  }
  await store.metric(
    Date.now(),
    route ? { providerSuccesses: 1 } : { providerMisses: 1 },
  );
  return {
    route: route ? enrichRoute(route, Date.now() + budget.cacheMs) : null,
    status: route ? 'ready' : 'missing',
  };
}

export function observationForRoute(route: FlightRoute, track: AircraftTrack) {
  if (
    route.verification !== 'exact' ||
    !route.flightLegId ||
    !route.flightNumber ||
    !track.airline.code
  )
    return null;
  return {
    flightLegId: route.flightLegId,
    callsign: route.callsign,
    flightNumber: route.flightNumber,
    originIcao: route.origin.icao,
    destinationIcao: route.destination.icao,
  };
}
