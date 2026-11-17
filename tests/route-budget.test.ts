import { afterEach, describe, expect, it } from 'vitest';
import {
  airportRoutePacing,
  routeBudget,
  RouteStore,
  type RouteBudget,
} from '../lib/route-budget';
import { testDatabase } from './d1-fixture';

const now = Date.parse('2026-10-11T12:00:00Z');
const budget: RouteBudget = {
  start: now - 86400_000,
  end: now + 30 * 86400_000,
  credits: 3000,
  dailyCredits: 100,
  cacheMs: 300_000,
  negativeCacheMs: 300_000,
  usualCacheMs: 300_000,
  burstCredits: 100,
};
const databases: ReturnType<typeof testDatabase>[] = [];
const database = () => {
  const value = testDatabase();
  databases.push(value);
  return value;
};
afterEach(() => {
  databases.splice(0).forEach((d) => d.sqlite.close());
});

describe('shared route spending', () => {
  it('allows explicit hosted owner experimentation without claiming provider approval', () => {
    const env = {
      NODE_ENV: 'production',
      FR24_API_TOKEN: 'test',
      FR24_DATA_ENABLED: 'true',
      FR24_DISPLAY_CACHE_APPROVED: 'false',
      FR24_OWNER_EXPERIMENT: 'true',
      FR24_BILLING_PERIOD_START: '2026-10-01T00:00:00Z',
      FR24_BILLING_PERIOD_END: '2026-11-01T00:00:00Z',
      FR24_CREDIT_ALLOWANCE: '24000',
      FR24_DAILY_CREDIT_LIMIT: '900',
    };
    expect(
      routeBudget(env, now, 'https://logan.example/api/route'),
    ).toMatchObject({
      credits: 24000,
      dailyCredits: 900,
    });
    for (const change of [
      { FR24_OWNER_EXPERIMENT: 'false' },
      { FR24_DATA_ENABLED: 'false' },
      { FR24_API_TOKEN: '' },
      { FR24_CREDIT_ALLOWANCE: '0' },
      { FR24_DAILY_CREDIT_LIMIT: '0' },
      { FR24_BILLING_PERIOD_END: '2026-10-10T00:00:00Z' },
    ])
      expect(routeBudget({ ...env, ...change }, now)).toBeNull();
  });
  it('allows an explicit private experiment only in development on loopback', () => {
    const env = {
      NODE_ENV: 'development',
      FR24_API_TOKEN: 'test',
      FR24_DATA_ENABLED: 'true',
      FR24_DISPLAY_CACHE_APPROVED: 'false',
      FR24_PRIVATE_EXPERIMENT: 'true',
      FR24_BILLING_PERIOD_START: '2026-10-01T00:00:00Z',
      FR24_BILLING_PERIOD_END: '2026-11-01T00:00:00Z',
      FR24_CREDIT_ALLOWANCE: '6000',
      FR24_DAILY_CREDIT_LIMIT: '100',
    };
    for (const host of ['localhost', '127.0.0.1', '[::1]'])
      expect(
        routeBudget(env, now, `http://${host}:55020/api/route`),
      ).toMatchObject({ credits: 6000, dailyCredits: 100, burstCredits: 100 });
    for (const url of [
      undefined,
      'not a URL',
      'https://logan.example/api/route',
      'http://localhost.example/api/route',
    ])
      expect(routeBudget(env, now, url)).toBeNull();
    for (const change of [
      { NODE_ENV: 'production' },
      { NODE_ENV: 'test' },
      { FR24_PRIVATE_EXPERIMENT: 'false' },
      { FR24_DATA_ENABLED: 'false' },
      { FR24_API_TOKEN: '' },
      { FR24_DAILY_CREDIT_LIMIT: '0' },
      { FR24_PACING_BURST_CREDITS: '101' },
      { FR24_PACING_BURST_CREDITS: '0' },
      { FR24_PACING_BURST_CREDITS: 'NaN' },
      { FR24_BILLING_PERIOD_END: '2026-10-10T00:00:00Z' },
    ])
      expect(
        routeBudget({ ...env, ...change }, now, 'http://localhost/api/route'),
      ).toBeNull();
  });
  it('requires explicit enablement, terms confirmation and a current bounded billing period', () => {
    const env = {
      FR24_API_TOKEN: 'test',
      FR24_DATA_ENABLED: 'true',
      FR24_DISPLAY_CACHE_APPROVED: 'true',
      FR24_BILLING_PERIOD_START: '2026-10-01T00:00:00Z',
      FR24_BILLING_PERIOD_END: '2026-11-01T00:00:00Z',
    };
    expect(routeBudget(env, now)).toMatchObject({
      credits: 30000,
      cacheMs: 7200000,
      negativeCacheMs: 300000,
      usualCacheMs: 300000,
      burstCredits: 180,
    });
    for (const change of [
      { FR24_DATA_ENABLED: 'false' },
      { FR24_DISPLAY_CACHE_APPROVED: '' },
      { FR24_API_TOKEN: '' },
      { FR24_BILLING_PERIOD_END: '2026-10-10' },
      { FR24_CACHE_TTL_SECONDS: '7201' },
      { FR24_CREDIT_ALLOWANCE: 'NaN' },
    ])
      expect(routeBudget({ ...env, ...change }, now)).toBeNull();
  });
  it('grants only one cross-instance lease and protects against an expired owner', async () => {
    const { db } = database();
    const a = new RouteStore(db),
      b = new RouteStore(db);
    const leases = await Promise.all([
      a.lease('flight', now),
      b.lease('flight', now),
    ]);
    expect(leases.filter(Boolean)).toHaveLength(1);
    const newLease = await b.lease('flight', now + 31000);
    expect(newLease).toBeTruthy();
    expect(
      (
        await a.reserve(
          'flight',
          leases.find(Boolean)!,
          60,
          budget,
          now + 31000,
        )
      ).ok,
    ).toBe(false);
    await a.finish(
      'flight',
      leases.find(Boolean)!,
      { stale: true },
      now + 60000,
    );
    expect(await b.cached('flight', now + 31000)).toBeNull();
    await b.finish('flight', newLease!, { current: true }, now + 60000);
    expect((await a.cached('flight', now + 31000))?.route).toEqual({
      current: true,
    });
  });
  it('atomically reserves maximum cost under concurrent requests and survives store restart', async () => {
    const { db, sqlite } = database();
    const store = new RouteStore(db);
    const leases = await Promise.all(
      ['a', 'b'].map((key) => store.lease(key, now)),
    );
    const reservations = await Promise.all(
      ['a', 'b'].map((key, i) =>
        new RouteStore(db).reserve(key, leases[i]!, 60, budget, now),
      ),
    );
    const successes = reservations.filter((result) => result.ok);
    expect(successes).toHaveLength(1);
    expect(
      sqlite.prepare('SELECT SUM(credits) total FROM route_credits').get()
        ?.total,
    ).toBe(60);
    const id = successes[0].id;
    await store.settle(id, 2);
    await store.settle(id, 1);
    expect(
      sqlite.prepare('SELECT SUM(credits) total FROM route_credits').get()
        ?.total,
    ).toBe(2);
    // A crash before settle leaves the full reservation charged.
    expect(
      (await new RouteStore(db).reserve('a', leases[0]!, 60, budget, now)).ok,
    ).toBe(true);
    expect(
      (await new RouteStore(db).reserve('b', leases[1]!, 60, budget, now)).ok,
    ).toBe(false);
  });
  it('enforces daily, monthly and rolling provider rate limits separately', async () => {
    const { db } = database();
    const store = new RouteStore(db);
    const lease = (await store.lease('a', now))!;
    expect(
      await store.reserve(
        'a',
        lease,
        60,
        { ...budget, dailyCredits: 50, burstCredits: 50 },
        now,
      ),
    ).toMatchObject({ ok: false, reason: 'daily-budget' });
    expect(
      await store.reserve('a', lease, 60, { ...budget, credits: 50 }, now),
    ).toMatchObject({ ok: false, reason: 'period-budget' });
    expect(
      await store.reserve('a', lease, 60, { ...budget, burstCredits: 10 }, now),
    ).toMatchObject({ ok: false, reason: 'paced' });
    for (let i = 0; i < 10; i++)
      expect((await store.reserve('a', lease, 1, budget, now)).ok).toBe(true);
    expect(await store.reserve('a', lease, 1, budget, now)).toMatchObject({
      ok: false,
      reason: 'rate-limited',
    });
  });
  it('shares positive and negative cache entries; expires and removes provider payloads', async () => {
    const { db, sqlite } = database();
    const store = new RouteStore(db);
    const lease = (await store.lease('a', now))!;
    await store.finish('a', lease, { origin: 'BOS' }, now + 1000);
    expect((await new RouteStore(db).cached('a', now))?.route).toEqual({
      origin: 'BOS',
    });
    expect(await store.lease('a', now)).toBeNull();
    expect(await store.cached('a', now + 1001)).toBeNull();
    await store.prune(now + 1001);
    expect(sqlite.prepare('SELECT COUNT(*) n FROM route_cache').get()?.n).toBe(
      0,
    );
  });

  it('paces cumulative allowance across Boston evening, overnight and daytime blocks', () => {
    const targetBudget: RouteBudget = {
      ...budget,
      start: Date.parse('2026-10-01T00:00:00Z'),
      end: Date.parse('2026-11-01T00:00:00Z'),
      credits: 30000,
      dailyCredits: 900,
      burstCredits: 180,
    };
    const evening = airportRoutePacing(
      targetBudget,
      0,
      Date.parse('2026-10-14T00:00:00Z'),
    );
    expect(evening).toMatchObject({
      block: 'evening',
      dailyTarget: 900,
      pacedAllowance: 180,
    });
    const overnight = airportRoutePacing(
      targetBudget,
      0,
      Date.parse('2026-10-14T06:00:00Z'),
    );
    expect(overnight).toMatchObject({
      block: 'overnight',
      pacedAllowance: 270,
    });
    const morning = airportRoutePacing(
      targetBudget,
      0,
      Date.parse('2026-10-14T12:00:00Z'),
    );
    expect(morning).toMatchObject({
      block: 'daytime',
      pacedAllowance: 450,
    });
    expect(
      airportRoutePacing(targetBudget, 0, Date.parse('2026-10-14T23:59:59Z'))
        .pacedAllowance,
    ).toBe(899);
  });

  it('uses America/New_York boundaries through spring and fall DST changes', () => {
    const pacingBudget: RouteBudget = {
      ...budget,
      start: Date.parse('2026-01-01T00:00:00Z'),
      end: Date.parse('2026-12-31T00:00:00Z'),
      credits: 90000,
      dailyCredits: 900,
      burstCredits: 180,
    };
    const spring = airportRoutePacing(
      pacingBudget,
      0,
      Date.parse('2026-03-08T00:00:00Z'),
    );
    expect(new Date(spring.eveningEnd).toISOString()).toBe(
      '2026-03-08T06:00:00.000Z',
    );
    expect(new Date(spring.morningStart).toISOString()).toBe(
      '2026-03-08T12:00:00.000Z',
    );
    const fall = airportRoutePacing(
      pacingBudget,
      0,
      Date.parse('2026-11-01T00:00:00Z'),
    );
    expect(new Date(fall.eveningEnd).toISOString()).toBe(
      '2026-11-01T05:00:00.000Z',
    );
    expect(new Date(fall.morningStart).toISOString()).toBe(
      '2026-11-01T13:00:00.000Z',
    );
  });

  it('qualifies two-date learned routes, deduplicates legs and suppresses recent conflicts', async () => {
    const { db, sqlite } = database();
    const store = new RouteStore(db);
    const first = Date.parse('2026-10-01T12:00:00Z');
    const observation = {
      callsign: 'JBU1488',
      flightNumber: 'B61488',
      originIcao: 'KLAX',
      destinationIcao: 'KBOS',
    };
    await store.recordObservation(
      { ...observation, flightLegId: 'leg-1' },
      first,
    );
    await store.recordObservation(
      { ...observation, flightLegId: 'leg-1' },
      first + 86400_000,
    );
    expect(
      sqlite.prepare('SELECT COUNT(*) n FROM route_observations').get()?.n,
    ).toBe(1);
    expect(await store.learnedRoute('JBU1488', first + 86400_000)).toBeNull();
    await store.recordObservation(
      { ...observation, flightLegId: 'leg-2' },
      first + 86400_000,
    );
    expect(
      await store.learnedRoute('JBU1488', first + 86400_000 + 1),
    ).toMatchObject({ originIcao: 'KLAX', destinationIcao: 'KBOS' });
    await store.recordObservation(
      {
        ...observation,
        flightLegId: 'leg-3',
        originIcao: 'KMIA',
      },
      first + 2 * 86400_000,
    );
    expect(
      await store.learnedRoute('JBU1488', first + 2 * 86400_000 + 1),
    ).toBeNull();
    await store.prune(first + 33 * 86400_000);
    expect(
      sqlite.prepare('SELECT COUNT(*) n FROM route_observations').get()?.n,
    ).toBe(0);
  });
});
