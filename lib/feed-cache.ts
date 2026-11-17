import type { FeedStatus } from './types';
export function parseRetryAfter(
  value: string | null,
  now = Date.now(),
): number {
  if (!value) return 15;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(1, seconds);
  const date = Date.parse(value);
  return Number.isFinite(date)
    ? Math.max(1, Math.ceil((date - now) / 1000))
    : 15;
}
export function createFeedCache<T extends FeedStatus>(options: {
  url: string;
  ttl: number;
  staleAfter: number;
  normalize: (raw: unknown, now: number) => T;
  unavailable: (error: string, retry: number) => T;
  fetcher?: typeof fetch;
  clock?: () => number;
}) {
  let cached: T | null = null,
    expiresAt = 0,
    retryAt = 0,
    error: string | null = null,
    inflight: Promise<T> | null = null;
  const now = options.clock ?? Date.now;
  function current(): T {
    const retry = Math.max(1, Math.ceil((retryAt - now()) / 1000));
    if (!cached) return options.unavailable(error ?? 'Feed unavailable', retry);
    return {
      ...cached,
      freshness:
        error ||
        cached.observedAt === null ||
        now() - cached.observedAt > options.staleAfter
          ? 'stale'
          : 'fresh',
      error,
      retryAfterSeconds: error ? retry : null,
    };
  }
  async function refresh(): Promise<T> {
    try {
      const response = await (options.fetcher ?? fetch)(options.url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'AirportWindow/1.0 (personal airport ambience)',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) {
        // Fixed, keyless upstreams only. Keep provider failures diagnosable in
        // Worker logs without exposing request headers or credentials.
        console.warn('Flight/weather upstream rejected request', {
          host: new URL(options.url).hostname,
          status: response.status,
          retryAfter: response.headers.get('Retry-After'),
          ray: response.headers.get('cf-ray'),
        });
        retryAt =
          now() +
          parseRetryAfter(response.headers.get('Retry-After'), now()) * 1000;
        throw new Error(
          response.status === 429
            ? 'Feed is busy; waiting to retry'
            : 'Feed is temporarily unavailable',
        );
      }
      if (response.status === 204)
        throw new Error('No recent observations available');
      cached = options.normalize(await response.json(), now());
      expiresAt = now() + options.ttl;
      retryAt = 0;
      error = null;
    } catch (e) {
      error =
        e instanceof Error && e.name === 'TimeoutError'
          ? 'Feed request timed out'
          : e instanceof Error
            ? e.message
            : 'Feed is temporarily unavailable';
      retryAt = Math.max(retryAt, now() + 15_000);
    }
    return current();
  }
  return async () => {
    if (now() < retryAt || (cached && now() < expiresAt)) return current();
    if (inflight) return inflight;
    inflight = refresh();
    try {
      return await inflight;
    } finally {
      inflight = null;
    }
  };
}
