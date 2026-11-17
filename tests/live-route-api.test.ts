import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { identifyAirline } from '../lib/airlines';
import { RouteStore } from '../lib/route-budget';
import type { AircraftTrack } from '../lib/types';
import { testDatabase } from './d1-fixture';

vi.mock('../lib/traffic-feed', () => ({ getTraffic: vi.fn() }));
vi.mock('../db', () => ({ getRouteDatabase: vi.fn() }));
import { getTraffic } from '../lib/traffic-feed';
import { getRouteDatabase } from '../db';
import { GET } from '../app/api/route/route';

const now = Date.parse('2026-10-11T12:00:00Z');
const track: AircraftTrack = {
  id: 'abcdef',
  callsign: 'JBU1488',
  registration: 'N123JB',
  aircraftType: 'A320',
  lat: 42.39,
  lon: -71.03,
  altitudeFt: 3000,
  speedKt: 200,
  heading: 150,
  verticalRateFpm: -500,
  onGround: false,
  observedAt: now,
  airline: identifyAirline('JBU1488'),
};
const record = {
  fr24_id: 'leg123',
  hex: 'ABCDEF',
  callsign: 'JBU1488',
  flight: 'B61488',
  lat: track.lat,
  lon: track.lon,
  timestamp: new Date(now).toISOString(),
  orig_icao: 'KLAX',
  orig_iata: 'LAX',
  dest_icao: 'KBOS',
  dest_iata: 'BOS',
  first_seen: new Date(now - 5 * 3600000).toISOString(),
  last_seen: new Date(now - 10000).toISOString(),
  flight_ended: false,
};
const request = () =>
  new Request('http://localhost/api/route?callsign=JBU1488&hex=abcdef');
let database: ReturnType<typeof testDatabase>;

async function seedUsualRoute() {
  const store = new RouteStore(database.db);
  const observation = {
    callsign: 'JBU1488',
    flightNumber: 'B61488',
    originIcao: 'KLAX',
    destinationIcao: 'KBOS',
  };
  await store.recordObservation(
    { ...observation, flightLegId: 'prior-1' },
    now - 2 * 86400_000,
  );
  await store.recordObservation(
    { ...observation, flightLegId: 'prior-2' },
    now - 86400_000,
  );
  return store;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  database = testDatabase();
  vi.mocked(getRouteDatabase).mockReturnValue(database.db);
  for (const [key, value] of Object.entries({
    FR24_API_TOKEN: 'test-token',
    FR24_DATA_ENABLED: 'true',
    FR24_DISPLAY_CACHE_APPROVED: 'true',
    FR24_BILLING_PERIOD_START: '2026-10-01T00:00:00Z',
    FR24_BILLING_PERIOD_END: '2026-11-01T00:00:00Z',
  }))
    vi.stubEnv(key, value);
  vi.mocked(getTraffic).mockResolvedValue({
    source: 'ADSB.lol',
    observedAt: now,
    receivedAt: now,
    freshness: 'fresh',
    error: null,
    retryAfterSeconds: null,
    aircraft: [track],
  });
});
afterEach(() => {
  database.sqlite.close();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('paid live route lookup', () => {
  it('uses the real provider for an explicitly enabled hosted experiment', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('FR24_DISPLAY_CACHE_APPROVED', 'false');
    vi.stubEnv('FR24_OWNER_EXPERIMENT', 'true');
    const fetch = vi.fn().mockResolvedValue(Response.json({ data: [record] }));
    vi.stubGlobal('fetch', fetch);
    const result = await GET(
      new Request(
        'https://logan.example/api/route?callsign=JBU1488&hex=abcdef',
      ),
    );
    expect(await result.json()).toMatchObject({ status: 'ready' });
    expect(new URL(fetch.mock.calls[0][0]).origin).toBe(
      'https://fr24api.flightradar24.com',
    );
    expect(result.headers.get('Cache-Control')).toBe('no-store');
  });
  it('uses the real provider in an opted-in localhost development experiment, never production', async () => {
    vi.stubEnv('FR24_CREDIT_ALLOWANCE', '6000');
    vi.stubEnv('FR24_DAILY_CREDIT_LIMIT', '100');
    vi.stubEnv('FR24_DISPLAY_CACHE_APPROVED', 'false');
    vi.stubEnv('FR24_PRIVATE_EXPERIMENT', 'true');
    vi.stubEnv('NODE_ENV', 'development');
    const fetch = vi.fn().mockResolvedValue(Response.json({ data: [record] }));
    vi.stubGlobal('fetch', fetch);
    expect(await (await GET(request())).json()).toMatchObject({
      status: 'ready',
    });
    expect(new URL(fetch.mock.calls[0][0]).origin).toBe(
      'https://fr24api.flightradar24.com',
    );
    fetch.mockClear();
    vi.stubEnv('NODE_ENV', 'production');
    expect(await (await GET(request())).json()).toMatchObject({
      status: 'disabled',
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not call the provider without explicit configured enablement', async () => {
    vi.stubEnv('FR24_DATA_ENABLED', 'false');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await (await GET(request())).json()).toMatchObject({
      route: null,
      enabled: false,
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('fails closed without shared storage or a live matching aircraft', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.mocked(getRouteDatabase).mockReturnValue(null);
    expect((await GET(request())).status).toBe(503);
    vi.mocked(getRouteDatabase).mockReturnValue(database.db);
    vi.mocked(getTraffic).mockResolvedValue({
      source: 'ADSB.lol',
      observedAt: now,
      receivedAt: now,
      freshness: 'fresh',
      error: null,
      retryAfterSeconds: null,
      aircraft: [],
    });
    expect(await (await GET(request())).json()).toMatchObject({
      route: null,
      status: 'not-live',
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['adsb-lol', 'adsb-fi'] as const)(
    'validates %s aircraft, shares full summary, and charges the returned live record',
    async (provider) => {
      vi.mocked(getTraffic).mockResolvedValue({
        source: provider === 'adsb-fi' ? 'adsb.fi' : 'ADSB.lol',
        provider,
        observedAt: now,
        receivedAt: now,
        freshness: 'fresh',
        error: null,
        retryAfterSeconds: null,
        aircraft: [{ ...track, positionSource: provider }],
      });
      const fetch = vi
        .fn()
        .mockResolvedValue(Response.json({ data: [record] }));
      vi.stubGlobal('fetch', fetch);
      const result = (await (await GET(request())).json()) as {
        route: { origin: { code: string } };
      };
      expect(result.route).toMatchObject({
        verification: 'exact',
        flightLegId: 'leg123',
        origin: { city: 'Los Angeles', code: 'LAX', country: 'United States' },
        destination: { code: 'BOS', lat: expect.any(Number) },
      });
      expect(String(fetch.mock.calls[0][0])).toContain('flight-summary/full');
      const query = new URL(fetch.mock.calls[0][0]).searchParams;
      // FR24 rejects ISO milliseconds / Z suffix in these query fields (HTTP 400).
      expect(query.get('flight_datetime_from')).toBe('2026-10-10T12:00:00');
      expect(query.get('flight_datetime_to')).toBe('2026-10-11T12:00:00');
      expect(query.get('sort')).toBe('desc');
      expect(query.get('registrations')).toBe('N123JB');
      await GET(request());
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(
        database.sqlite
          .prepare('SELECT SUM(credits) total FROM route_credits')
          .get()?.total,
      ).toBe(2);
      expect(
        database.sqlite.prepare('SELECT expires_at FROM route_cache').get()
          ?.expires_at,
      ).toBe(now + 7200_000);
      expect(
        database.sqlite
          .prepare('SELECT COUNT(*) n FROM route_observations')
          .get()?.n,
      ).toBe(1);
    },
  );
  it('falls back to live position matching on an ambiguous or missing summary', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ data: [] }))
      .mockResolvedValueOnce(Response.json({ data: [record] }));
    vi.stubGlobal('fetch', fetch);
    const result = (await (await GET(request())).json()) as {
      route: { origin: { code: string } };
    };
    expect(result.route.origin.code).toBe('LAX');
    expect(String(fetch.mock.calls[1][0])).toContain(
      'live/flight-positions/full',
    );
    expect(
      database.sqlite
        .prepare('SELECT SUM(credits) total FROM route_credits')
        .get()?.total,
    ).toBe(9);
  });
  it('stops before a provider call when the daily reservation does not fit', async () => {
    vi.stubEnv('FR24_DAILY_CREDIT_LIMIT', '14');
    vi.stubEnv('FR24_PACING_BURST_CREDITS', '14');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await (await GET(request())).json()).toMatchObject({
      route: null,
      status: 'daily-budget',
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps the maximum debit after a network failure and prevents rapid retry', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('timeout'));
    vi.stubGlobal('fetch', fetch);
    expect((await GET(request())).status).toBe(503);
    expect(
      database.sqlite
        .prepare('SELECT SUM(credits) total FROM route_credits')
        .get()?.total,
    ).toBe(15);
    await GET(request());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(
      database.sqlite
        .prepare('SELECT expires_at, lease FROM route_cache')
        .get(),
    ).toMatchObject({ expires_at: 0, lease: null });
    expect(
      database.sqlite
        .prepare(
          "SELECT failures, next_attempt_at, reason FROM route_provider_state WHERE key = 'fr24'",
        )
        .get(),
    ).toMatchObject({
      failures: 1,
      next_attempt_at: now + 15_000,
      reason: 'unavailable',
    });
    vi.setSystemTime(now + 16_000);
    vi.mocked(getTraffic).mockResolvedValue({
      source: 'ADSB.lol',
      observedAt: now + 16_000,
      receivedAt: now + 16_000,
      freshness: 'fresh',
      error: null,
      retryAfterSeconds: null,
      aircraft: [{ ...track, observedAt: now + 16_000 }],
    });
    await GET(request());
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(
      database.sqlite
        .prepare(
          "SELECT failures, next_attempt_at FROM route_provider_state WHERE key = 'fr24'",
        )
        .get(),
    ).toMatchObject({ failures: 2, next_attempt_at: now + 46_000 });
  });

  it('honors Retry-After on 429 and persists a rate-limited cooldown', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response('', { status: 429, headers: { 'Retry-After': '45' } }),
      );
    vi.stubGlobal('fetch', fetch);
    expect(await (await GET(request())).json()).toMatchObject({
      route: null,
      status: 'rate-limited',
    });
    expect(
      database.sqlite
        .prepare(
          "SELECT next_attempt_at, reason FROM route_provider_state WHERE key = 'fr24'",
        )
        .get(),
    ).toMatchObject({
      next_attempt_at: now + 45_000,
      reason: 'rate-limited',
    });
    await GET(request());
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('uses a 60-second 429 cooldown when Retry-After is absent or invalid', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('', { status: 429 }));
    vi.stubGlobal('fetch', fetch);
    await GET(request());
    expect(
      database.sqlite
        .prepare(
          "SELECT next_attempt_at FROM route_provider_state WHERE key = 'fr24'",
        )
        .get(),
    ).toMatchObject({ next_attempt_at: now + 60_000 });
  });

  it('caches only a valid provider miss for five minutes', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(async () => Response.json({ data: [] }));
    vi.stubGlobal('fetch', fetch);
    expect(await (await GET(request())).json()).toMatchObject({
      route: null,
      status: 'missing',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(
      database.sqlite
        .prepare('SELECT payload, expires_at FROM route_cache')
        .get(),
    ).toMatchObject({ payload: null, expires_at: now + 300_000 });
    await GET(request());
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('returns a qualified usual route for valid missing and pending exact paths', async () => {
    const store = await seedUsualRoute();
    const fetch = vi.fn().mockResolvedValue(Response.json({ data: [] }));
    vi.stubGlobal('fetch', fetch);
    expect(await (await GET(request())).json()).toMatchObject({
      status: 'usual',
      route: { verification: 'usual' },
    });
    expect(fetch).toHaveBeenCalledTimes(2);

    const secondKey = 'abcdef:JBU1488:arrival:air';
    await database.db
      .prepare('DELETE FROM route_cache WHERE key = ?')
      .bind(secondKey)
      .run();
    expect(await store.lease(secondKey, now)).toBeTruthy();
    fetch.mockClear();
    expect(await (await GET(request())).json()).toMatchObject({
      status: 'usual',
      route: { verification: 'usual' },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects a direction-conflicting exact cache entry without another paid call', async () => {
    const store = new RouteStore(database.db);
    const key = 'abcdef:JBU1488:arrival:air';
    const lease = (await store.lease(key, now))!;
    await store.finish(
      key,
      lease,
      {
        verification: 'exact',
        callsign: 'JBU1488',
        aircraftId: 'abcdef',
        origin: { icao: 'KBOS', code: 'BOS', city: 'Boston' },
        destination: { icao: 'KLAX', code: 'LAX', city: 'Los Angeles' },
        expiresAt: now + 7200_000,
      },
      now + 7200_000,
    );
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await (await GET(request())).json()).toMatchObject({
      route: null,
      status: 'pending',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns a qualified usual route when the exact request is budget-blocked', async () => {
    await seedUsualRoute();
    vi.stubEnv('FR24_DAILY_CREDIT_LIMIT', '14');
    vi.stubEnv('FR24_PACING_BURST_CREDITS', '14');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const result = (await (await GET(request())).json()) as {
      status: string;
      route: Record<string, unknown>;
    };
    expect(result).toMatchObject({
      status: 'usual',
      route: {
        verification: 'usual',
        origin: { icao: 'KLAX', code: 'LAX' },
        destination: { icao: 'KBOS', code: 'BOS' },
      },
    });
    expect(result.route).not.toHaveProperty('flightNumber');
    expect(result.route).not.toHaveProperty('takeoffAt');
    expect(fetch).not.toHaveBeenCalled();
    expect(
      database.sqlite
        .prepare(
          'SELECT learned_hits, daily_denials, covered FROM route_metrics',
        )
        .get(),
    ).toMatchObject({ learned_hits: 1, daily_denials: 1, covered: 1 });
  });
});
