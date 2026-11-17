import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configuredTrafficProviders,
  trafficProviders,
} from '../lib/traffic/providers';
import { createTrafficService } from '../lib/traffic/service';
import { D1TrafficStore, type TrafficStore } from '../lib/traffic/store';
import { testDatabase } from './d1-fixture';

const start = Date.parse('2026-10-12T12:00:00Z');
const key = (id = 'adsb-fi') =>
  `airport-v1:boston:KBOS:42.364:-71.009:20:${id}`;
// Synthetic readsb-compatible samples, not retained live provider data.
const aircraft = {
  hex: 'abc123',
  flight: 'JBU123 ',
  lat: 42.36,
  lon: -71.01,
  seen_pos: 2,
  alt_baro: 1200,
  gs: 180,
};
const payload = (now: number, ac = [aircraft]) => ({
  now,
  ac,
  msg: 'No error',
});
const json = (now: number, ac = [aircraft]) => Response.json(payload(now, ac));

describe('position provider adapters', () => {
  it('has allowlisted, deduplicated, configurable ordering', () => {
    expect(configuredTrafficProviders().map((p) => p.id)).toEqual([
      'adsb-lol',
      'adsb-fi',
    ]);
    expect(
      configuredTrafficProviders('adsb-fi, adsb-lol,adsb-fi').map((p) => p.id),
    ).toEqual(['adsb-fi', 'adsb-lol']);
    for (const invalid of [
      '',
      'https://example.com',
      'fr24',
      '__proto__',
      'adsb-fi,',
    ])
      expect(() => configuredTrafficProviders(invalid)).toThrow();
  });

  it.each(['adsb-lol', 'adsb-fi'] as const)(
    'normalizes %s with real source attribution and original timestamps',
    (id) => {
      const snapshot = trafficProviders[id].normalize(
        payload(start / 1000),
        start,
      );
      expect(snapshot).toMatchObject({
        provider: id,
        observedAt: start,
        freshness: 'fresh',
      });
      expect(snapshot.aircraft[0]).toMatchObject({
        id: 'abc123',
        callsign: 'JBU123',
        observedAt: start - 2000,
        positionSource: id,
        onGround: false,
      });
      const ground = trafficProviders[id].normalize(
        { now: start, ac: [{ ...aircraft, alt_baro: 'ground' }] },
        start,
      );
      expect(ground.aircraft[0]).toMatchObject({
        onGround: true,
        altitudeFt: 0,
      });
      expect(() =>
        trafficProviders[id].normalize(
          { ...payload(start), msg: 'Error' },
          start,
        ),
      ).toThrow();
    },
  );
});

describe('shared position cache and failover', () => {
  let database: ReturnType<typeof testDatabase>;
  let store: D1TrafficStore;
  let now: number;
  let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
  const service = () =>
    createTrafficService({
      providers: configuredTrafficProviders('adsb-fi,adsb-lol'),
      store,
      fetcher,
      clock: () => now,
    });

  beforeEach(() => {
    database = testDatabase();
    store = new D1TrafficStore(database.db);
    now = start;
    fetcher = vi.fn<typeof fetch>().mockImplementation(async () => json(now));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    database.sqlite.close();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('shares a five-second cache across visitors and restarted service instances', async () => {
    const first = await service()();
    now += 4999;
    expect(await service()()).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(trafficProviders['adsb-fi'].url);
    now += 1;
    expect((await service()()).observedAt).toBe(now);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not mistake a fresh empty sky for a failed feed', async () => {
    fetcher.mockImplementation(async () => json(now, []));
    expect(await service()()).toMatchObject({
      provider: 'adsb-fi',
      freshness: 'fresh',
      aircraft: [],
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each(['120', new Date(start + 120_000).toUTCString()])(
    'honors Retry-After %s and keeps cooldown across restarts',
    async (retry) => {
      fetcher.mockResolvedValueOnce(
        new Response('', { status: 429, headers: { 'Retry-After': retry } }),
      );
      const snapshot = await service()();
      expect(snapshot).toMatchObject({
        provider: 'adsb-lol',
        source: 'ADSB.lol',
        freshness: 'fresh',
      });
      expect(
        snapshot.aircraft.every((a) => a.positionSource === 'adsb-lol'),
      ).toBe(true);
      expect(await store.read(key())).toMatchObject({
        nextAttemptAt: start + 120_000,
        failures: 1,
      });
      now += 10_000;
      await service()();
      expect(fetcher.mock.calls.map((call) => call[0])).toEqual([
        trafficProviders['adsb-fi'].url,
        trafficProviders['adsb-lol'].url,
        trafficProviders['adsb-lol'].url,
      ]);
      now = start + 120_000;
      expect((await service()()).provider).toBe('adsb-fi');
      expect(await store.read(key())).toMatchObject({
        failures: 0,
        error: null,
      });
    },
  );

  it.each([401, 403, 404])(
    'backs off an access rejection (%s) for 30 minutes',
    async (status) => {
      fetcher.mockResolvedValueOnce(new Response('', { status }));
      expect((await service()()).provider).toBe('adsb-lol');
      expect(await store.read(key())).toMatchObject({
        nextAttemptAt: start + 30 * 60_000,
      });
    },
  );

  it('backs off repeated errors exponentially without losing state on restart', async () => {
    fetcher.mockImplementation(async () => new Response('', { status: 503 }));
    const get = service();
    expect((await get()).freshness).toBe('unavailable');
    expect(await store.read(key())).toMatchObject({
      nextAttemptAt: start + 30_000,
      failures: 1,
    });
    now += 30_000;
    await service()();
    expect(await store.read(key())).toMatchObject({
      nextAttemptAt: now + 60_000,
      failures: 2,
    });
    now += 60_000;
    await service()();
    expect(await store.read(key())).toMatchObject({
      nextAttemptAt: now + 120_000,
      failures: 3,
    });
  });

  it('leases across concurrent Workers and coalesces requests within one Worker', async () => {
    let release!: (response: Response) => void;
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    fetcher.mockImplementation(() => {
      started();
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    });
    const get = service();
    const owner = get();
    const coalesced = get();
    await startedPromise;
    const contenders = await Promise.all(
      Array.from({ length: 12 }, () => service()()),
    );
    expect(contenders.every((s) => s.freshness === 'unavailable')).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    release(json(now));
    expect(await coalesced).toEqual(await owner);
    expect((await service()()).freshness).toBe('fresh');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('serves a previous snapshot while the backup refresh is leased elsewhere', async () => {
    await service()();
    now += 5000;
    await store.acquire(key('adsb-lol'), now, 6000);
    fetcher.mockResolvedValueOnce(new Response('', { status: 429 }));
    expect(await service()()).toMatchObject({
      provider: 'adsb-fi',
      freshness: 'stale',
      observedAt: start,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([
    () => new Response('not json'),
    () => Response.json({ wrong: true }),
    () => Response.json({ ...payload(start), msg: 'Error' }),
    () => json(start - 60_000),
    () => new Response(null, { status: 204 }),
  ])('rejects bad snapshots without replacing last good data', async (bad) => {
    await service()();
    now += 5000;
    fetcher.mockImplementation(async () => bad());
    const stale = await service()();
    expect(stale).toMatchObject({
      provider: 'adsb-fi',
      freshness: 'stale',
      observedAt: start,
      receivedAt: start,
    });
    expect(stale.aircraft[0].observedAt).toBe(start - 2000);
    now += 60_000;
    expect((await service()()).aircraft).toEqual([]);
  });

  it('chooses the newest stale snapshot without merging providers', async () => {
    await service()();
    now += 5000;
    fetcher.mockResolvedValueOnce(new Response('', { status: 429 }));
    await service()();
    now += 5000;
    fetcher.mockResolvedValueOnce(new Response('', { status: 503 }));
    expect(await service()()).toMatchObject({
      provider: 'adsb-lol',
      freshness: 'stale',
      observedAt: start + 5000,
    });
  });

  it('aborts a slow upstream and uses the next provider', async () => {
    // Stub only the timeout factory so no test depends on real four-second waits.
    const controller = new AbortController();
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValueOnce(controller.signal);
    fetcher.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () =>
            reject(new Error('timeout')),
          );
          controller.abort();
        }),
    );
    expect((await service()()).provider).toBe('adsb-lol');
    expect(timeout).toHaveBeenCalledWith(4000);
    expect(await store.read(key())).toMatchObject({
      failures: 1,
      nextAttemptAt: now + 30_000,
    });
  });

  it('fails closed when the shared database is unavailable', async () => {
    const broken = {
      read: async () => {
        throw new Error('D1 offline');
      },
    } as unknown as TrafficStore;
    const get = createTrafficService({
      providers: configuredTrafficProviders(),
      store: broken,
      fetcher,
      clock: () => now,
    });
    expect(await get()).toMatchObject({
      freshness: 'unavailable',
      error: 'Position cache temporarily unavailable',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('recovers an abandoned lease and prevents an old owner overwriting the new owner', async () => {
    const first = await store.acquire(key(), now, 6000);
    expect(await store.acquire(key(), now + 5999, 6000)).toBeNull();
    now += 6000;
    const second = await store.acquire(key(), now, 6000);
    expect(second!.lease).not.toBe(first!.lease);
    await store.finish(key(), second!.lease, {
      nextAttemptAt: now + 30_000,
      failures: 1,
      error: 'busy',
    });
    await store.finish(key(), first!.lease, {
      snapshot: trafficProviders['adsb-fi'].normalize(payload(now), now),
      nextAttemptAt: now,
      failures: 0,
      error: null,
    });
    expect(await store.read(key())).toMatchObject({
      snapshot: null,
      failures: 1,
      error: 'busy',
    });
  });
});
