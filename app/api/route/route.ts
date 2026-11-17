import { getRouteDatabase } from '@/db';
import {
  routeDirection,
  routeMatchesTrack,
  type FlightRoute,
  type RouteStatus,
} from '@/lib/flight-routes';
import {
  RouteStore,
  routeBudget,
  type RouteBudget,
  type RouteBudgetDenial,
} from '@/lib/route-budget';
import {
  fetchRoute,
  learnedFlightRoute,
  observationForRoute,
} from '@/lib/route-provider';
import { getTraffic } from '@/lib/traffic-feed';

const denialMetric = (denial: RouteBudgetDenial) => ({
  denied: 1,
  ...(denial === 'paced' ? { pacingDenials: 1 } : {}),
  ...(denial === 'daily-budget' ? { dailyDenials: 1 } : {}),
  ...(denial === 'period-budget' ? { periodDenials: 1 } : {}),
  ...(denial === 'rate-limited' ? { rateDenials: 1 } : {}),
});

export async function GET(request: Request) {
  const now = Date.now();
  const budget = routeBudget(
    { ...process.env, NODE_ENV: process.env.NODE_ENV },
    now,
    request.url,
  );
  const reply = (
    route: FlightRoute | null,
    status: RouteStatus,
    enabled = true,
    httpStatus = 200,
  ) =>
    Response.json(
      { route, enabled, status },
      { status: httpStatus, headers: { 'Cache-Control': 'no-store' } },
    );
  if (!budget) return reply(null, 'disabled', false);
  const params = new URL(request.url).searchParams;
  const callsign = params.get('callsign')?.trim().toUpperCase();
  const hex = params.get('hex')?.trim().toLowerCase();
  if (
    !callsign ||
    !/^[A-Z0-9]{3,8}$/.test(callsign) ||
    !hex ||
    !/^[a-f0-9]{6}$/.test(hex)
  )
    return reply(null, 'invalid', true, 400);

  let store: RouteStore | null = null;
  let lease: string | null = null;
  let key = '';
  try {
    const db = getRouteDatabase();
    if (!db) return reply(null, 'storage-unavailable', true, 503);
    store = new RouteStore(db);
    await store.prune(now);
    const traffic = await getTraffic();
    const observedNow = Date.now();
    const track =
      traffic.freshness === 'fresh'
        ? traffic.aircraft.find(
            (candidate) =>
              candidate.id === hex &&
              candidate.callsign?.trim().toUpperCase() === callsign &&
              observedNow - candidate.observedAt >= -30_000 &&
              observedNow - candidate.observedAt < 35_000,
          )
        : null;
    if (!track) return reply(null, 'not-live');

    key = `${hex}:${callsign}:${routeDirection(track)}:${track.onGround === true ? 'ground' : 'air'}`;
    await store.metric(now, { requests: 1 });

    const usual = async (
      fallbackStatus: RouteStatus,
      httpStatus = fallbackStatus === 'unavailable' ? 503 : 200,
    ) => {
      const learned = track.airline.code
        ? await store!.learnedRoute(callsign, Date.now())
        : null;
      const route = learned
        ? learnedFlightRoute(
            track,
            learned,
            Math.min(
              learned.evidenceExpiresAt,
              Date.now() + (budget as RouteBudget).usualCacheMs,
            ),
          )
        : null;
      if (!route) return reply(null, fallbackStatus, true, httpStatus);
      await store!.metric(now, { learnedHits: 1, covered: 1 });
      return reply(route, 'usual');
    };

    const hit = await store.cached(key, now);
    if (hit) {
      const cachedRoute = hit.route
        ? ({
            ...hit.route,
            verification: hit.route.verification ?? 'exact',
          } as FlightRoute)
        : null;
      if (!cachedRoute || routeMatchesTrack(cachedRoute, track)) {
        await store.metric(now, {
          cacheHits: 1,
          ...(cachedRoute ? { exactCacheHits: 1, covered: 1 } : {}),
        });
        return cachedRoute ? reply(cachedRoute, 'ready') : usual('missing');
      }
    }

    lease = await store.lease(key, now);
    if (!lease) return usual('pending');
    const result = await fetchRoute(
      track,
      store,
      key,
      lease,
      budget,
      process.env.FR24_API_TOKEN!,
    );

    if (result.route) {
      await store.finish(key, lease, result.route, result.route.expiresAt!);
      lease = null;
      const observation = observationForRoute(result.route, track);
      if (observation)
        await store
          .recordObservation(observation, Date.now())
          .catch(async () => {
            await store!.metric(now, { errors: 1, otherFailures: 1 });
          });
      await store.metric(now, { covered: 1 });
      return reply(result.route, 'ready');
    }

    if (result.status === 'missing') {
      await store.finish(key, lease, null, now + budget.negativeCacheMs);
      lease = null;
      return usual('missing');
    }

    await store.release(key, lease);
    lease = null;
    if (result.budgetDenial)
      await store.metric(now, denialMetric(result.budgetDenial));
    return usual(result.status);
  } catch {
    if (store) {
      await store.metric(now, { errors: 1, otherFailures: 1 }).catch(() => {});
      if (lease) await store.release(key, lease).catch(() => {});
    }
    return reply(null, 'unavailable', true, 503);
  }
}
