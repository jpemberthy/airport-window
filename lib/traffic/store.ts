import type { TrafficSnapshot } from '../types';
import type { SqlDatabase } from '../../db/storage';

export interface TrafficCacheEntry {
  snapshot: TrafficSnapshot | null;
  nextAttemptAt: number;
  leaseUntil: number;
  failures: number;
  error: string | null;
}

export interface TrafficStore {
  read(key: string): Promise<TrafficCacheEntry | null>;
  acquire(
    key: string,
    now: number,
    duration: number,
  ): Promise<{
    lease: string;
    failures: number;
  } | null>;
  finish(
    key: string,
    lease: string,
    result: {
      snapshot?: TrafficSnapshot;
      nextAttemptAt: number;
      failures: number;
      error: string | null;
    },
  ): Promise<void>;
}

// A single shared compare-and-lease governs all visitors, regions and restarts.
// Keep cooldown metadata even after removing expired position payloads.
export class D1TrafficStore implements TrafficStore {
  constructor(private db: SqlDatabase) {}

  async read(key: string): Promise<TrafficCacheEntry | null> {
    const row = await this.db
      .prepare(`SELECT payload, next_attempt_at,
      lease_until, failures, error FROM traffic_feeds WHERE key = ?`)
      .bind(key)
      .first<{
        payload: string | null;
        next_attempt_at: number;
        lease_until: number;
        failures: number;
        error: string | null;
      }>();
    return row
      ? {
          snapshot: row.payload ? JSON.parse(row.payload) : null,
          nextAttemptAt: row.next_attempt_at,
          leaseUntil: row.lease_until,
          failures: row.failures,
          error: row.error,
        }
      : null;
  }

  async acquire(key: string, now: number, duration: number) {
    const lease = crypto.randomUUID();
    return this.db
      .prepare(`INSERT INTO traffic_feeds (key, lease, lease_until)
      VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE
      SET lease = excluded.lease, lease_until = excluded.lease_until
      WHERE traffic_feeds.next_attempt_at <= ? AND traffic_feeds.lease_until <= ?
      RETURNING lease, failures`)
      .bind(key, lease, now + duration, now, now)
      .first<{ lease: string; failures: number }>();
  }

  async finish(
    key: string,
    lease: string,
    result: {
      snapshot?: TrafficSnapshot;
      nextAttemptAt: number;
      failures: number;
      error: string | null;
    },
  ) {
    const payload = result.snapshot ? JSON.stringify(result.snapshot) : null;
    await this.db
      .prepare(`UPDATE traffic_feeds SET
      payload = COALESCE(?, payload), snapshot_at = COALESCE(?, snapshot_at),
      next_attempt_at = ?, failures = ?, error = ?, lease = NULL, lease_until = 0
      WHERE key = ? AND lease = ?`)
      .bind(
        payload,
        result.snapshot?.receivedAt ?? null,
        result.nextAttemptAt,
        result.failures,
        result.error,
        key,
        lease,
      )
      .run();
  }

  async prune(now: number) {
    await this.db
      .prepare(`UPDATE traffic_feeds SET payload = NULL
      WHERE payload IS NOT NULL AND snapshot_at <= ?`)
      .bind(now - 60_000)
      .run();
  }
}
