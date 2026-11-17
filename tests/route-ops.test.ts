import { afterEach, describe, expect, it } from 'vitest';
import {
  routeOpsSnapshot,
  unavailableRouteOpsSnapshot,
} from '../lib/route-ops';
import { testDatabase } from './d1-fixture';

const now = Date.parse('2026-10-14T12:00:00Z');
const enabled = {
  NODE_ENV: 'production',
  FR24_DATA_ENABLED: 'true',
  FR24_DISPLAY_CACHE_APPROVED: 'true',
  FR24_API_TOKEN: 'not-returned-secret',
  FR24_BILLING_PERIOD_START: '2026-10-01T00:00:00Z',
  FR24_BILLING_PERIOD_END: '2026-11-01T00:00:00Z',
  FR24_CREDIT_ALLOWANCE: '24000',
  FR24_DAILY_CREDIT_LIMIT: '900',
  FR24_PACING_BURST_CREDITS: '180',
};

const databases: ReturnType<typeof testDatabase>[] = [];
const database = () => {
  const result = testDatabase();
  databases.push(result);
  return result;
};

afterEach(() => {
  for (const item of databases.splice(0)) item.sqlite.close();
});

function creditRows(
  sqlite: ReturnType<typeof testDatabase>['sqlite'],
  credits: number[],
  createdAt = now - 30_000,
) {
  const statement = sqlite.prepare(
    'INSERT INTO route_credits (id, created_at, credits, reserved, settled) VALUES (?, ?, ?, ?, 1)',
  );
  credits.forEach((credits, index) =>
    statement.run(`credit-${index}`, createdAt - index, credits, credits),
  );
}

describe('private route operations snapshot', () => {
  it('sanitizes exact cache, learned evidence, traffic health, and metrics', async () => {
    const { db, sqlite } = database();
    const exact = {
      verification: 'exact',
      callsign: 'JBU1488',
      aircraftId: 'abcdef',
      registration: 'N123JB',
      origin: { icao: 'KLAX', code: 'LAX', city: 'Los Angeles' },
      destination: { icao: 'KBOS', code: 'BOS', city: 'Boston' },
      checkedAt: now - 20_000,
      expiresAt: now + 7_000_000,
    };
    sqlite
      .prepare(
        'INSERT INTO route_cache (key, payload, expires_at, lease_until) VALUES (?, ?, ?, ?)',
      )
      .run(
        'abcdef:JBU1488:arrival:air',
        JSON.stringify(exact),
        now + 7_000_000,
        0,
      );
    sqlite
      .prepare(
        'INSERT INTO route_cache (key, payload, expires_at, lease_until) VALUES (?, NULL, ?, ?)',
      )
      .run('112233:AAL10:departure:air', now + 120_000, now + 10_000);
    sqlite
      .prepare(
        'INSERT INTO route_cache (key, payload, expires_at) VALUES (?, ?, ?)',
      )
      .run('bad-key', '{not-json', now + 120_000);
    const observation = sqlite.prepare(`INSERT INTO route_observations
      (flight_leg_id, callsign, flight_number, origin_icao, destination_icao,
      verified_date, first_received_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    observation.run(
      'leg-1',
      'JBU1488',
      'B61488',
      'KLAX',
      'KBOS',
      '2026-10-12',
      now - 2 * 86_400_000,
      now + 28 * 86_400_000,
    );
    observation.run(
      'leg-2',
      'JBU1488',
      'B61488',
      'KLAX',
      'KBOS',
      '2026-10-13',
      now - 86_400_000,
      now + 29 * 86_400_000,
    );
    observation.run(
      'leg-3',
      'AAL10',
      'AA10',
      'KBOS',
      'KJFK',
      '2026-10-13',
      now - 86_400_000,
      now + 29 * 86_400_000,
    );
    sqlite
      .prepare(`INSERT INTO traffic_feeds
      (key, payload, snapshot_at, next_attempt_at, failures, error)
      VALUES (?, ?, ?, ?, ?, NULL)`)
      .run(
        'logan-20nm-v1:adsb-lol',
        JSON.stringify({ aircraft: [{ hex: 'feed-secret-aircraft' }] }),
        now - 4_000,
        now + 1_000,
        0,
      );
    sqlite
      .prepare(`INSERT INTO route_metrics
      (day, requests, covered, provider_calls, latency_ms, exact_cache_hits,
      learned_hits, provider_successes, provider_misses, pacing_denials,
      daily_denials, period_denials, rate_denials, upstream_429s, other_failures)
      VALUES (?, 10, 8, 4, 1000, 3, 2, 3, 1, 1, 0, 0, 1, 0, 2)`)
      .run('2026-10-14');

    const snapshot = await routeOpsSnapshot(db, enabled, now);
    expect(snapshot.newLookupStatus.state).toBe('available');
    expect(snapshot.cache).toMatchObject({
      positiveExact: 1,
      validNegative: 1,
      activeLeases: 1,
      malformed: 1,
    });
    expect(snapshot.cache.leaseEntries[0]).toEqual({
      callsign: 'AAL10',
      direction: 'departure',
      state: 'air',
      expiresAt: now + 10_000,
    });
    expect(snapshot.cache.exactEntries[0]).toEqual({
      callsign: 'JBU1488',
      originIcao: 'KLAX',
      destinationIcao: 'KBOS',
      direction: 'arrival',
      state: 'air',
      verifiedAt: now - 20_000,
      expiresAt: now + 7_000_000,
    });
    expect(snapshot.learned).toMatchObject({
      observations: 3,
      callsigns: 2,
      qualified: 1,
      warming: 1,
      conflictSuppressed: 0,
    });
    expect(snapshot.traffic.activeProvider).toBe('adsb-lol');
    expect(snapshot.today).toMatchObject({
      requests: 10,
      covered: 8,
      coveragePercent: 80,
      meanLatencyMs: 250,
    });
    const serialized = JSON.stringify(snapshot);
    for (const forbidden of [
      'not-returned-secret',
      'abcdef',
      'N123JB',
      'feed-secret-aircraft',
      'aircraftId',
      'registration',
      'payload',
      'allowance',
      'periodSpent',
    ])
      expect(serialized).not.toContain(forbidden);
  });

  it('classifies warming and conflict-suppressed evidence conservatively', async () => {
    const { db, sqlite } = database();
    const statement = sqlite.prepare(`INSERT INTO route_observations
      (flight_leg_id, callsign, flight_number, origin_icao, destination_icao,
      verified_date, first_received_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    statement.run(
      'a',
      'DAL1',
      'DL1',
      'KATL',
      'KBOS',
      '2026-10-12',
      now - 2 * DAY,
      now + 28 * DAY,
    );
    statement.run(
      'b',
      'DAL1',
      'DL1',
      'KATL',
      'KBOS',
      '2026-10-13',
      now - DAY,
      now + 29 * DAY,
    );
    statement.run(
      'c',
      'DAL1',
      'DL1',
      'KBOS',
      'KATL',
      '2026-10-14',
      now - 1_000,
      now + 30 * DAY,
    );
    statement.run(
      'd',
      'AAL2',
      'AA2',
      'KBOS',
      'KORD',
      '2026-10-14',
      now - 1_000,
      now + 30 * DAY,
    );
    const learned = (await routeOpsSnapshot(db, enabled, now)).learned;
    expect(learned.conflictSuppressed).toBe(2);
    expect(learned.warming).toBe(1);
    expect(learned.qualified).toBe(0);
  });

  it('applies lookup-state precedence and handles empty metrics', async () => {
    const provider = database();
    creditRows(provider.sqlite, [23_990]);
    provider.sqlite
      .prepare(`INSERT INTO route_provider_state
      (key, next_attempt_at, failures, reason, status, updated_at)
      VALUES ('fr24', ?, 2, 'rate-limited', 429, ?)`)
      .run(now + 60_000, now);
    expect(
      (await routeOpsSnapshot(provider.db, enabled, now)).newLookupStatus.state,
    ).toBe('provider-cooldown');

    const period = database();
    creditRows(period.sqlite, [23_990]);
    expect(
      (await routeOpsSnapshot(period.db, enabled, now)).newLookupStatus.state,
    ).toBe('period-budget');

    const daily = database();
    creditRows(daily.sqlite, [890]);
    expect(
      (await routeOpsSnapshot(daily.db, enabled, now)).newLookupStatus.state,
    ).toBe('daily-budget');

    const paced = database();
    creditRows(paced.sqlite, [440]);
    const pacedSnapshot = await routeOpsSnapshot(paced.db, enabled, now);
    expect(pacedSnapshot.newLookupStatus.state).toBe('paced');
    expect(pacedSnapshot.newLookupStatus.nextBoundaryAt).toBeGreaterThan(now);

    const limited = database();
    creditRows(
      limited.sqlite,
      Array.from({ length: 10 }, () => 1),
    );
    expect(
      (await routeOpsSnapshot(limited.db, enabled, now)).newLookupStatus.state,
    ).toBe('rate-limited');

    const empty = database();
    const emptySnapshot = await routeOpsSnapshot(empty.db, enabled, now);
    expect(emptySnapshot.newLookupStatus.state).toBe('available');
    expect(emptySnapshot.today).toMatchObject({
      requests: 0,
      coveragePercent: 0,
      meanLatencyMs: 0,
    });
    expect(emptySnapshot.history).toEqual([]);
    expect(
      (await routeOpsSnapshot(empty.db, {}, now)).newLookupStatus.state,
    ).toBe('disabled');
    expect(unavailableRouteOpsSnapshot(now).newLookupStatus.state).toBe(
      'storage-unavailable',
    );
  });
});

const DAY = 86_400_000;
