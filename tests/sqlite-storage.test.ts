import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SqliteDatabase } from '../db/sqlite';
import { RouteStore } from '../lib/route-budget';
import { D1TrafficStore } from '../lib/traffic/store';

const directories: string[] = [];
const connections: SqliteDatabase[] = [];
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'logan-sqlite-'));
  directories.push(directory);
  const path = join(directory, 'routes.sqlite');
  const open = () => {
    const db = new SqliteDatabase(path, resolve('drizzle'));
    connections.push(db);
    return db;
  };
  return { open, path };
}
afterEach(() => {
  connections.splice(0).forEach((db) => db.close());
  directories.splice(0).forEach((path) => rmSync(path, { recursive: true }));
});

describe('persistent Node SQLite storage', () => {
  it('applies the additive reliability migration without resetting an existing ledger', () => {
    const { open, path } = fixture();
    const legacy = new DatabaseSync(path);
    legacy.exec(
      'CREATE TABLE logan_migrations (name TEXT PRIMARY KEY NOT NULL)',
    );
    for (const name of ['0000_brown_mindworm.sql', '0001_minor_ma_gnuci.sql']) {
      legacy.exec(readFileSync(resolve('drizzle', name), 'utf8'));
      legacy
        .prepare('INSERT INTO logan_migrations (name) VALUES (?)')
        .run(name);
    }
    legacy
      .prepare(
        'INSERT INTO route_credits (id, created_at, credits, reserved, settled) VALUES (?, ?, ?, ?, ?)',
      )
      .run('existing', Date.parse('2026-10-13T12:00:00Z'), 524, 524, 1);
    legacy.close();

    const upgraded = open();
    expect(
      upgraded.connection
        .prepare('SELECT SUM(credits) total FROM route_credits')
        .get()?.total,
    ).toBe(524);
    expect(
      upgraded.connection
        .prepare(
          "SELECT COUNT(*) count FROM sqlite_master WHERE type = 'table' AND name IN ('route_observations', 'route_provider_state')",
        )
        .get()?.count,
    ).toBe(2);
    expect(
      upgraded.connection
        .prepare(
          "SELECT COUNT(*) count FROM pragma_table_info('route_metrics') WHERE name = 'learned_hits'",
        )
        .get()?.count,
    ).toBe(1);
  });

  it('preserves reservations across connection restart and applies migrations once', async () => {
    const { open } = fixture();
    const first = open();
    const store = new RouteStore(first);
    const now = Date.parse('2026-10-14T12:00:00Z');
    const budget = {
      start: now - 1000,
      end: Math.floor(now / 86400_000) * 86400_000 + 86400_000,
      credits: 100,
      dailyCredits: 100,
      cacheMs: 300_000,
      negativeCacheMs: 300_000,
      usualCacheMs: 300_000,
      burstCredits: 100,
    };
    const lease = await store.lease('a', now);
    expect((await store.reserve('a', lease!, 60, budget, now)).ok).toBe(true);
    connections.splice(connections.indexOf(first), 1);
    first.close();
    const restarted = open();
    const other = open();
    const leases = await Promise.all([
      new RouteStore(restarted).lease('b', now),
      new RouteStore(other).lease('b', now),
    ]);
    expect(leases.filter(Boolean)).toHaveLength(1);
    expect(
      (
        await new RouteStore(other).reserve(
          'b',
          leases.find(Boolean)!,
          60,
          budget,
          now,
        )
      ).ok,
    ).toBe(false);
    expect(
      restarted.connection
        .prepare('SELECT SUM(credits) total FROM route_credits')
        .get()?.total,
    ).toBe(60);
  });

  it('shares credit limits among independent connections and rolls back whole batches', async () => {
    const { open } = fixture();
    const a = open(),
      b = open();
    const now = Date.parse('2026-10-14T12:00:00Z');
    const budget = {
      start: now - 1000,
      end: Math.floor(now / 86400_000) * 86400_000 + 86400_000,
      credits: 100,
      dailyCredits: 100,
      cacheMs: 300_000,
      negativeCacheMs: 300_000,
      usualCacheMs: 300_000,
      burstCredits: 100,
    };
    const stores = [new RouteStore(a), new RouteStore(b)];
    const reservations = await Promise.all(
      stores.map(async (store, index) => {
        const key = `flight-${index}`;
        const lease = await store.lease(key, now);
        return store.reserve(key, lease!, 60, budget, now);
      }),
    );
    expect(reservations.filter((result) => result.ok)).toHaveLength(1);
    await expect(
      a.batch([
        a.prepare("INSERT INTO route_metrics (day) VALUES ('test')"),
        a.prepare("INSERT INTO route_metrics (day) VALUES ('test')"),
      ]),
    ).rejects.toThrow();
    expect(
      await b
        .prepare("SELECT day FROM route_metrics WHERE day = 'test'")
        .first(),
    ).toBeNull();
  });

  it('shares feed leases and cooldowns after reconnecting', async () => {
    const { open } = fixture();
    const a = new D1TrafficStore(open()),
      b = new D1TrafficStore(open());
    const now = Date.now();
    const leases = await Promise.all([
      a.acquire('feed', now, 6000),
      b.acquire('feed', now, 6000),
    ]);
    expect(leases.filter(Boolean)).toHaveLength(1);
    await a.finish('feed', leases.find(Boolean)!.lease, {
      nextAttemptAt: now + 60000,
      failures: 1,
      error: 'HTTP 429',
    });
    const restarted = new D1TrafficStore(open());
    expect(await restarted.acquire('feed', now + 10000, 6000)).toBeNull();
    expect(await restarted.read('feed')).toMatchObject({
      nextAttemptAt: now + 60000,
      failures: 1,
    });
  });
});
