import { airportCacheKey } from '../airport';
import { parseRetryAfter } from '../feed-cache';
import { TRAFFIC_STALE_MS, unavailableTraffic } from '../normalize';
import type { TrafficSnapshot } from '../types';
import type { TrafficProvider } from './providers';
import type { TrafficCacheEntry, TrafficStore } from './store';

const CACHE_MS = 5000;
const TIMEOUT_MS = 4000;
const LEASE_MS = TIMEOUT_MS + 2000;

function snapshotAt(
  entry: TrafficCacheEntry | null,
  now: number,
  provider: TrafficProvider,
) {
  const retry = Math.min(
    60,
    Math.max(
      1,
      Math.ceil(
        (Math.max(entry?.nextAttemptAt ?? 0, entry?.leaseUntil ?? 0) - now) /
          1000,
      ),
    ),
  );
  if (!entry?.snapshot)
    return unavailableTraffic(
      entry?.error ?? 'Waiting for live positions',
      retry,
      provider.id,
    );
  const snapshot = entry.snapshot;
  return {
    ...snapshot,
    aircraft: snapshot.aircraft.filter((a) => now - a.observedAt < 60_000),
    freshness:
      entry.error ||
      snapshot.observedAt === null ||
      now - snapshot.observedAt > TRAFFIC_STALE_MS
        ? ('stale' as const)
        : ('fresh' as const),
    error: entry.error,
    retryAfterSeconds: entry.error ? retry : null,
  };
}

export function createTrafficService(options: {
  providers: TrafficProvider[];
  store: TrafficStore;
  fetcher?: typeof fetch;
  clock?: () => number;
}) {
  const { providers, store } = options;
  const now = options.clock ?? Date.now;
  let inflight: Promise<TrafficSnapshot> | null = null;

  async function readProvider(provider: TrafficProvider) {
    // Bump the key version if the fixed coverage area or normalized schema changes.
    const key = `airport-v1:${airportCacheKey}:${provider.id}`;
    let entry = await store.read(key);
    if (entry && (now() < entry.nextAttemptAt || now() < entry.leaseUntil))
      return {
        snapshot: snapshotAt(entry, now(), provider),
        pending: !entry.error && !entry.snapshot,
      };
    const owner = await store.acquire(key, now(), LEASE_MS);
    if (!owner) {
      entry = await store.read(key);
      return {
        snapshot: snapshotAt(entry, now(), provider),
        pending: !entry?.error && !entry?.snapshot,
      };
    }
    let retryAfter: string | null = null;
    let status: number | null = null;
    try {
      const response = await (options.fetcher ?? fetch)(provider.url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'AirportWindow/1.0 (self-hosted airport display)',
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      status = response.status;
      retryAfter = response.headers.get('Retry-After');
      if (!response.ok || response.status === 204) {
        await response.body?.cancel();
        throw new Error('Upstream unavailable');
      }
      const snapshot = provider.normalize(await response.json(), now());
      if (snapshot.freshness !== 'fresh')
        throw new Error('Stale upstream snapshot');
      await store.finish(key, owner.lease, {
        snapshot,
        nextAttemptAt: now() + CACHE_MS,
        failures: 0,
        error: null,
      });
    } catch {
      const failures = Math.min(owner.failures + 1, 10);
      const backoff =
        status === 401 || status === 403 || status === 404
          ? 30 * 60_000
          : Math.min(10 * 60_000, 30_000 * 2 ** (failures - 1));
      const delay = Math.max(
        backoff,
        retryAfter ? parseRetryAfter(retryAfter, now()) * 1000 : 0,
      );
      // Never log response bodies, request headers, or individual aircraft.
      console.warn('Traffic provider cooling down', {
        provider: provider.id,
        status,
        retrySeconds: Math.ceil(delay / 1000),
      });
      await store.finish(key, owner.lease, {
        nextAttemptAt: now() + delay,
        failures,
        error:
          status === 429
            ? 'Position provider is busy'
            : 'Position provider temporarily unavailable',
      });
    }
    return {
      snapshot: snapshotAt(await store.read(key), now(), provider),
      pending: false,
    };
  }

  async function refresh(): Promise<TrafficSnapshot> {
    const attempts: TrafficSnapshot[] = [];
    try {
      for (const provider of providers) {
        const { snapshot, pending } = await readProvider(provider);
        // An empty *fresh* snapshot is a legitimate quiet sky, not a failure.
        // Do not fan out while another Worker is fetching a healthy primary.
        if (snapshot.freshness === 'fresh') return snapshot;
        attempts.push(snapshot);
        if (pending) break;
      }
    } catch {
      // Missing migrations/DB must not turn a global request cap into per-isolate
      // requests. Fail closed rather than bypassing the shared store.
      return unavailableTraffic('Position cache temporarily unavailable', 15);
    }
    const stale = attempts
      .filter((s) => s.observedAt !== null)
      .sort((a, b) => b.observedAt! - a.observedAt!)[0];
    if (stale) return stale;
    return unavailableTraffic(
      'Position feeds temporarily unavailable',
      Math.min(60, ...attempts.map((s) => s.retryAfterSeconds ?? 30)),
    );
  }

  return async (): Promise<TrafficSnapshot> => {
    if (inflight) return inflight;
    inflight = refresh();
    try {
      return await inflight;
    } finally {
      inflight = null;
    }
  };
}
