import { airport } from './airport';
import type { SqlDatabase } from '../db/storage';

const DAY_MS = 86400_000;
const OBSERVATION_RETENTION_MS = 30 * DAY_MS;
const CONFLICT_WINDOW_MS = 7 * DAY_MS;
const AIRPORT_TIME_ZONE = airport.timeZone;

export interface RouteBudget {
  start: number;
  end: number;
  credits: number;
  dailyCredits: number;
  cacheMs: number;
  negativeCacheMs: number;
  usualCacheMs: number;
  burstCredits: number;
}

export type RouteBudgetDenial =
  | 'paced'
  | 'daily-budget'
  | 'period-budget'
  | 'rate-limited';

export type RouteReservation =
  | { ok: true; id: string }
  | { ok: false; reason: RouteBudgetDenial };

export interface RouteUsage {
  periodSpent: number;
  daySpent: number;
  recentCalls: number;
}

export interface RoutePacing {
  dayStart: number;
  dayEnd: number;
  eveningEnd: number;
  morningStart: number;
  dailyTarget: number;
  pacedAllowance: number;
  block: 'evening' | 'overnight' | 'daytime';
}

export interface LearnedRouteEvidence {
  originIcao: string;
  destinationIcao: string;
  evidenceExpiresAt: number;
}

export interface RouteProviderState {
  nextAttemptAt: number;
  failures: number;
  reason: 'rate-limited' | 'unavailable' | null;
  status: number | null;
  updatedAt: number;
}

const integer = (value: string | undefined, fallback: number) => {
  const parsed = Number(value ?? fallback);
  return Number.isSafeInteger(parsed) ? parsed : NaN;
};

export function routeBudget(
  env: Record<string, string | undefined>,
  now = Date.now(),
  requestUrl?: string,
): RouteBudget | null {
  let localExperiment = false;
  if (
    env.NODE_ENV === 'development' &&
    env.FR24_PRIVATE_EXPERIMENT === 'true' &&
    requestUrl
  ) {
    try {
      const url = new URL(requestUrl);
      localExperiment =
        ['http:', 'https:'].includes(url.protocol) &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    } catch {
      /* Invalid origins fail closed. */
    }
  }
  if (
    env.FR24_DATA_ENABLED !== 'true' ||
    (env.FR24_DISPLAY_CACHE_APPROVED !== 'true' &&
      env.FR24_OWNER_EXPERIMENT !== 'true' &&
      !localExperiment) ||
    !env.FR24_API_TOKEN
  )
    return null;
  const start = Date.parse(env.FR24_BILLING_PERIOD_START ?? '');
  const end = Date.parse(env.FR24_BILLING_PERIOD_END ?? '');
  const credits = integer(env.FR24_CREDIT_ALLOWANCE, 30_000);
  const days = Math.ceil((end - start) / DAY_MS);
  const dailyCredits = integer(
    env.FR24_DAILY_CREDIT_LIMIT,
    Math.floor(credits / days),
  );
  const cacheSeconds = integer(env.FR24_CACHE_TTL_SECONDS, 7200);
  const negativeCacheSeconds = integer(
    env.FR24_NEGATIVE_CACHE_TTL_SECONDS,
    300,
  );
  const usualCacheSeconds = integer(env.FR24_USUAL_CACHE_TTL_SECONDS, 300);
  // Small development/pilot budgets must remain valid without a burst override.
  // Explicit overrides are still validated against the daily ceiling below.
  const burstCredits = integer(
    env.FR24_PACING_BURST_CREDITS,
    Math.min(180, dailyCredits),
  );
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    now < start ||
    now >= end ||
    days < 1 ||
    days > 32 ||
    !Number.isSafeInteger(credits) ||
    credits < 1 ||
    credits > 90_000 ||
    !Number.isSafeInteger(dailyCredits) ||
    dailyCredits < 1 ||
    dailyCredits > credits ||
    !Number.isSafeInteger(cacheSeconds) ||
    cacheSeconds < 1 ||
    cacheSeconds > 7200 ||
    !Number.isSafeInteger(negativeCacheSeconds) ||
    negativeCacheSeconds < 1 ||
    negativeCacheSeconds > 1800 ||
    !Number.isSafeInteger(usualCacheSeconds) ||
    usualCacheSeconds < 1 ||
    usualCacheSeconds > 1800 ||
    !Number.isSafeInteger(burstCredits) ||
    burstCredits < 1 ||
    burstCredits > dailyCredits
  )
    return null;
  return {
    start,
    end,
    credits,
    dailyCredits,
    cacheMs: cacheSeconds * 1000,
    negativeCacheMs: negativeCacheSeconds * 1000,
    usualCacheMs: usualCacheSeconds * 1000,
    burstCredits,
  };
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const bostonFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: AIRPORT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function airportParts(time: number): LocalParts {
  const parts = Object.fromEntries(
    bostonFormatter
      .formatToParts(new Date(time))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

const localSerial = (parts: LocalParts) =>
  Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

// Starting from the naive UTC value selects the first occurrence of a repeated
// fall-back hour, which makes the 01:00 cutoff conservative.
function airportWallTime(parts: LocalParts): number {
  const target = localSerial(parts);
  let guess = target;
  for (let attempt = 0; attempt < 4; attempt++) {
    const adjustment = target - localSerial(airportParts(guess));
    guess += adjustment;
    if (!adjustment) break;
  }
  return guess;
}

export function airportRoutePacing(
  budget: RouteBudget,
  usageBeforeToday: number,
  now: number,
): RoutePacing {
  const dayStart = Math.floor(now / DAY_MS) * DAY_MS;
  const dayEnd = dayStart + DAY_MS;
  const localDate = airportParts(dayStart);
  const following = new Date(
    Date.UTC(localDate.year, localDate.month - 1, localDate.day + 1),
  );
  const wallDate = {
    year: following.getUTCFullYear(),
    month: following.getUTCMonth() + 1,
    day: following.getUTCDate(),
  };
  const eveningEnd = airportWallTime({
    ...wallDate,
    hour: 1,
    minute: 0,
    second: 0,
  });
  const morningStart = airportWallTime({
    ...wallDate,
    hour: 8,
    minute: 0,
    second: 0,
  });
  // Freeze the sustainable target for the whole UTC accounting day. Using
  // `now` here would let a non-midnight billing expiry change the divisor in
  // the middle of a day.
  const daysRemaining = Math.max(
    1,
    Math.ceil((budget.end - dayStart) / DAY_MS),
  );
  const remainingAtDayStart = Math.max(0, budget.credits - usageBeforeToday);
  const dailyTarget = Math.max(
    0,
    Math.min(
      budget.dailyCredits,
      Math.floor(remainingAtDayStart / daysRemaining),
    ),
  );
  const eveningTarget = Math.floor(dailyTarget * 0.3);
  let allowance: number;
  let block: RoutePacing['block'];
  if (now < eveningEnd) {
    block = 'evening';
    const burst = Math.min(budget.burstCredits, eveningTarget);
    const progress = Math.max(
      0,
      Math.min(1, (now - dayStart) / (eveningEnd - dayStart)),
    );
    allowance = burst + (eveningTarget - burst) * progress;
  } else if (now < morningStart) {
    block = 'overnight';
    allowance = eveningTarget;
  } else {
    block = 'daytime';
    const daytimeTarget = dailyTarget - eveningTarget;
    const burst = Math.min(budget.burstCredits, daytimeTarget);
    const opening = eveningTarget + burst;
    const progress = Math.max(
      0,
      Math.min(1, (now - morningStart) / (dayEnd - morningStart)),
    );
    allowance = opening + (dailyTarget - opening) * progress;
  }
  return {
    dayStart,
    dayEnd,
    eveningEnd,
    morningStart,
    dailyTarget,
    pacedAllowance: Math.max(0, Math.min(dailyTarget, Math.floor(allowance))),
    block,
  };
}

export class RouteStore {
  constructor(private db: SqlDatabase) {}

  async cached(key: string, now: number) {
    const row = await this.db
      .prepare(
        'SELECT payload, expires_at FROM route_cache WHERE key = ? AND expires_at > ?',
      )
      .bind(key, now)
      .first<{ payload: string | null; expires_at: number }>();
    return row
      ? {
          route: row.payload ? JSON.parse(row.payload) : null,
          expiresAt: row.expires_at,
        }
      : null;
  }

  async lease(key: string, now: number): Promise<string | null> {
    const token = crypto.randomUUID();
    const row = await this.db
      .prepare(`INSERT INTO route_cache (key, lease, lease_until) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET lease = excluded.lease, lease_until = excluded.lease_until, payload = NULL
      WHERE route_cache.lease_until <= ? AND route_cache.expires_at <= ? RETURNING lease`)
      .bind(key, token, now + 30_000, now, now)
      .first<{ lease: string }>();
    return row?.lease === token ? token : null;
  }

  async usage(budget: RouteBudget, now: number): Promise<RouteUsage> {
    const dayStart = Math.floor(now / DAY_MS) * DAY_MS;
    const row = await this.db
      .prepare(`SELECT
      COALESCE(SUM(CASE WHEN created_at >= ? AND created_at < ? THEN credits ELSE 0 END), 0) period_spent,
      COALESCE(SUM(CASE WHEN created_at >= ? AND created_at < ? THEN credits ELSE 0 END), 0) day_spent,
      COALESCE(SUM(CASE WHEN created_at > ? AND created_at <= ? THEN 1 ELSE 0 END), 0) recent_calls
      FROM route_credits WHERE created_at >= ? AND created_at < ?`)
      .bind(
        budget.start,
        budget.end,
        dayStart,
        dayStart + DAY_MS,
        now - 60_000,
        now,
        Math.min(budget.start, now - 60_000),
        budget.end,
      )
      .first<{
        period_spent: number;
        day_spent: number;
        recent_calls: number;
      }>();
    return {
      periodSpent: Number(row?.period_spent ?? 0),
      daySpent: Number(row?.day_spent ?? 0),
      recentCalls: Number(row?.recent_calls ?? 0),
    };
  }

  async pacing(budget: RouteBudget, now: number) {
    const usage = await this.usage(budget, now);
    return {
      usage,
      pacing: airportRoutePacing(
        budget,
        usage.periodSpent - usage.daySpent,
        now,
      ),
    };
  }

  async reserve(
    key: string,
    lease: string,
    maximum: number,
    budget: RouteBudget,
    now: number,
  ): Promise<RouteReservation> {
    if (now < budget.start || now >= budget.end || maximum < 1)
      return { ok: false, reason: 'period-budget' };
    const { pacing } = await this.pacing(budget, now);
    const id = crypto.randomUUID();
    const row = await this.db
      .prepare(`INSERT INTO route_credits (id, created_at, credits, reserved)
      SELECT ?, ?, ?, ? WHERE
      EXISTS (SELECT 1 FROM route_cache WHERE key = ? AND lease = ? AND lease_until > ?) AND
      COALESCE((SELECT SUM(credits) FROM route_credits WHERE created_at >= ? AND created_at < ?), 0) + ? <= ? AND
      COALESCE((SELECT SUM(credits) FROM route_credits WHERE created_at >= ? AND created_at < ?), 0) + ? <= ? AND
      COALESCE((SELECT SUM(credits) FROM route_credits WHERE created_at >= ? AND created_at < ?), 0) + ? <= ? AND
      (SELECT COUNT(*) FROM route_credits WHERE created_at > ? AND created_at <= ?) < 10 RETURNING id`)
      .bind(
        id,
        now,
        maximum,
        maximum,
        key,
        lease,
        now,
        budget.start,
        budget.end,
        maximum,
        budget.credits,
        pacing.dayStart,
        pacing.dayEnd,
        maximum,
        budget.dailyCredits,
        pacing.dayStart,
        pacing.dayEnd,
        maximum,
        pacing.pacedAllowance,
        now - 60_000,
        now,
      )
      .first<{ id: string }>();
    if (row?.id) return { ok: true, id: row.id };
    const current = await this.usage(budget, now);
    const currentPacing = airportRoutePacing(
      budget,
      current.periodSpent - current.daySpent,
      now,
    );
    if (current.periodSpent + maximum > budget.credits)
      return { ok: false, reason: 'period-budget' };
    if (current.daySpent + maximum > budget.dailyCredits)
      return { ok: false, reason: 'daily-budget' };
    if (current.daySpent + maximum > currentPacing.pacedAllowance)
      return { ok: false, reason: 'paced' };
    return { ok: false, reason: 'rate-limited' };
  }

  async settle(id: string, actual: number) {
    await this.db
      .prepare(
        'UPDATE route_credits SET credits = ?, settled = 1 WHERE id = ? AND settled = 0 AND ? >= 1 AND ? <= reserved',
      )
      .bind(actual, id, actual, actual)
      .run();
  }

  async finish(key: string, lease: string, route: unknown, expiresAt: number) {
    await this.db
      .prepare(
        'UPDATE route_cache SET payload = ?, expires_at = ?, lease = NULL, lease_until = 0 WHERE key = ? AND lease = ?',
      )
      .bind(route ? JSON.stringify(route) : null, expiresAt, key, lease)
      .run();
  }

  async release(key: string, lease: string) {
    await this.db
      .prepare(
        'UPDATE route_cache SET lease = NULL, lease_until = 0 WHERE key = ? AND lease = ?',
      )
      .bind(key, lease)
      .run();
  }

  async recordObservation(
    observation: {
      flightLegId: string;
      callsign: string;
      flightNumber: string;
      originIcao: string;
      destinationIcao: string;
    },
    now: number,
  ) {
    await this.db
      .prepare(`INSERT INTO route_observations
      (flight_leg_id, callsign, flight_number, origin_icao, destination_icao, verified_date, first_received_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(flight_leg_id) DO NOTHING`)
      .bind(
        observation.flightLegId,
        observation.callsign,
        observation.flightNumber,
        observation.originIcao,
        observation.destinationIcao,
        new Date(now).toISOString().slice(0, 10),
        now,
        now + OBSERVATION_RETENTION_MS,
      )
      .run();
  }

  async learnedRoute(
    callsign: string,
    now: number,
  ): Promise<LearnedRouteEvidence | null> {
    const row = await this.db
      .prepare(`SELECT o.origin_icao, o.destination_icao, MIN(o.expires_at) evidence_expires_at
      FROM route_observations o
      WHERE o.callsign = ? AND o.expires_at > ?
      GROUP BY o.callsign, o.origin_icao, o.destination_icao
      HAVING COUNT(DISTINCT o.verified_date) >= 2 AND NOT EXISTS (
        SELECT 1 FROM route_observations conflict
        WHERE conflict.callsign = o.callsign AND conflict.expires_at > ?
        AND conflict.first_received_at >= ?
        AND (conflict.origin_icao <> o.origin_icao OR conflict.destination_icao <> o.destination_icao)
      )
      ORDER BY MAX(o.first_received_at) DESC LIMIT 1`)
      .bind(callsign, now, now, now - CONFLICT_WINDOW_MS)
      .first<{
        origin_icao: string;
        destination_icao: string;
        evidence_expires_at: number;
      }>();
    return row
      ? {
          originIcao: row.origin_icao,
          destinationIcao: row.destination_icao,
          evidenceExpiresAt: row.evidence_expires_at,
        }
      : null;
  }

  async providerState(key: string): Promise<RouteProviderState | null> {
    const row = await this.db
      .prepare(`SELECT next_attempt_at, failures, reason, status, updated_at
      FROM route_provider_state WHERE key = ?`)
      .bind(key)
      .first<{
        next_attempt_at: number;
        failures: number;
        reason: 'rate-limited' | 'unavailable' | null;
        status: number | null;
        updated_at: number;
      }>();
    return row
      ? {
          nextAttemptAt: row.next_attempt_at,
          failures: row.failures,
          reason: row.reason,
          status: row.status,
          updatedAt: row.updated_at,
        }
      : null;
  }

  async providerFailed(
    key: string,
    state: Omit<RouteProviderState, 'updatedAt'>,
    updatedAt: number,
  ) {
    await this.db
      .prepare(`INSERT INTO route_provider_state
      (key, next_attempt_at, failures, reason, status, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET next_attempt_at = excluded.next_attempt_at,
      failures = excluded.failures, reason = excluded.reason, status = excluded.status,
      updated_at = excluded.updated_at WHERE route_provider_state.updated_at <= excluded.updated_at`)
      .bind(
        key,
        state.nextAttemptAt,
        state.failures,
        state.reason,
        state.status,
        updatedAt,
      )
      .run();
  }

  async providerSucceeded(key: string, updatedAt: number) {
    await this.db
      .prepare(`INSERT INTO route_provider_state
      (key, next_attempt_at, failures, reason, status, updated_at) VALUES (?, 0, 0, NULL, NULL, ?)
      ON CONFLICT(key) DO UPDATE SET next_attempt_at = 0, failures = 0,
      reason = NULL, status = NULL, updated_at = excluded.updated_at
      WHERE route_provider_state.updated_at <= excluded.updated_at`)
      .bind(key, updatedAt)
      .run();
  }

  async metric(
    now: number,
    counts: {
      requests?: number;
      cacheHits?: number;
      covered?: number;
      denied?: number;
      errors?: number;
      providerCalls?: number;
      latencyMs?: number;
      exactCacheHits?: number;
      learnedHits?: number;
      providerSuccesses?: number;
      providerMisses?: number;
      pacingDenials?: number;
      dailyDenials?: number;
      periodDenials?: number;
      rateDenials?: number;
      upstream429s?: number;
      otherFailures?: number;
    },
  ) {
    await this.db
      .prepare(`INSERT INTO route_metrics
      (day, requests, cache_hits, covered, denied, errors, provider_calls, latency_ms,
      exact_cache_hits, learned_hits, provider_successes, provider_misses,
      pacing_denials, daily_denials, period_denials, rate_denials, upstream_429s, other_failures)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(day) DO UPDATE SET requests = requests + excluded.requests,
      cache_hits = cache_hits + excluded.cache_hits, covered = covered + excluded.covered,
      denied = denied + excluded.denied, errors = errors + excluded.errors,
      provider_calls = provider_calls + excluded.provider_calls,
      latency_ms = latency_ms + excluded.latency_ms,
      exact_cache_hits = exact_cache_hits + excluded.exact_cache_hits,
      learned_hits = learned_hits + excluded.learned_hits,
      provider_successes = provider_successes + excluded.provider_successes,
      provider_misses = provider_misses + excluded.provider_misses,
      pacing_denials = pacing_denials + excluded.pacing_denials,
      daily_denials = daily_denials + excluded.daily_denials,
      period_denials = period_denials + excluded.period_denials,
      rate_denials = rate_denials + excluded.rate_denials,
      upstream_429s = upstream_429s + excluded.upstream_429s,
      other_failures = other_failures + excluded.other_failures`)
      .bind(
        new Date(now).toISOString().slice(0, 10),
        counts.requests ?? 0,
        counts.cacheHits ?? 0,
        counts.covered ?? 0,
        counts.denied ?? 0,
        counts.errors ?? 0,
        counts.providerCalls ?? 0,
        counts.latencyMs ?? 0,
        counts.exactCacheHits ?? 0,
        counts.learnedHits ?? 0,
        counts.providerSuccesses ?? 0,
        counts.providerMisses ?? 0,
        counts.pacingDenials ?? 0,
        counts.dailyDenials ?? 0,
        counts.periodDenials ?? 0,
        counts.rateDenials ?? 0,
        counts.upstream429s ?? 0,
        counts.otherFailures ?? 0,
      )
      .run();
  }

  async prune(now: number) {
    await this.db.batch([
      this.db
        .prepare(
          'DELETE FROM route_cache WHERE expires_at <= ? AND lease_until <= ?',
        )
        .bind(now, now),
      this.db
        .prepare('DELETE FROM route_observations WHERE expires_at <= ?')
        .bind(now),
      this.db
        .prepare('DELETE FROM route_credits WHERE created_at < ?')
        .bind(now - 65 * DAY_MS),
      this.db
        .prepare('DELETE FROM route_metrics WHERE day < ?')
        .bind(new Date(now - 65 * DAY_MS).toISOString().slice(0, 10)),
    ]);
  }
}
