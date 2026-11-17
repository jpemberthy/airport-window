import { airport } from './airport';
import type { SqlDatabase } from '../db/storage';
import {
  airportRoutePacing,
  routeBudget,
  RouteStore,
  type RouteBudget,
} from './route-budget';

const DAY_MS = 86_400_000;
const CONFLICT_WINDOW_MS = 7 * DAY_MS;
const SUMMARY_RESERVATION = 15;

export type RouteOpsLookupState =
  | 'disabled'
  | 'storage-unavailable'
  | 'provider-cooldown'
  | 'period-budget'
  | 'daily-budget'
  | 'paced'
  | 'rate-limited'
  | 'available';

export interface RouteOpsMetricDay {
  day: string;
  requests: number;
  exactCacheHits: number;
  learnedHits: number;
  providerMatches: number;
  validMisses: number;
  covered: number;
  coveragePercent: number;
  providerCalls: number;
  meanLatencyMs: number;
  pacingDenials: number;
  dailyDenials: number;
  periodDenials: number;
  rateDenials: number;
  upstream429s: number;
  otherFailures: number;
}

export interface RouteOpsSnapshot {
  generatedAt: number;
  newLookupStatus: {
    state: RouteOpsLookupState;
    detail: string;
    nextBoundaryAt: number | null;
    bostonBlock: 'evening' | 'overnight' | 'daytime' | null;
  };
  cache: {
    positiveExact: number;
    validNegative: number;
    activeLeases: number;
    malformed: number;
    exactEntries: Array<{
      callsign: string;
      originIcao: string;
      destinationIcao: string;
      direction: 'arrival' | 'departure' | 'unknown';
      state: 'air' | 'ground';
      verifiedAt: number | null;
      expiresAt: number;
    }>;
    leaseEntries: Array<{
      callsign: string;
      direction: 'arrival' | 'departure' | 'unknown';
      state: 'air' | 'ground';
      expiresAt: number;
    }>;
    negativeEntries: Array<{
      callsign: string;
      direction: 'arrival' | 'departure' | 'unknown';
      state: 'air' | 'ground';
      expiresAt: number;
    }>;
  };
  learned: {
    observations: number;
    callsigns: number;
    qualified: number;
    warming: number;
    conflictSuppressed: number;
    entries: Array<{
      callsign: string;
      originIcao: string;
      destinationIcao: string;
      status: 'qualified' | 'warming' | 'conflict-suppressed';
      utcDates: number;
      expiresAt: number;
    }>;
  };
  provider: {
    coolingDown: boolean;
    reason: 'rate-limited' | 'unavailable' | null;
    httpStatus: number | null;
    failures: number;
    nextAttemptAt: number | null;
  };
  traffic: {
    activeProvider: string | null;
    feeds: Array<{
      provider: string;
      hasSnapshot: boolean;
      snapshotAt: number | null;
      ageMs: number | null;
      failures: number;
      coolingDown: boolean;
      nextAttemptAt: number | null;
      error: string | null;
    }>;
  };
  today: RouteOpsMetricDay;
  history: RouteOpsMetricDay[];
}

export function unavailableRouteOpsSnapshot(
  now = Date.now(),
): RouteOpsSnapshot {
  const day = new Date(now).toISOString().slice(0, 10);
  return {
    generatedAt: now,
    newLookupStatus: {
      state: 'storage-unavailable',
      detail: 'The route database is unavailable.',
      nextBoundaryAt: null,
      bostonBlock: null,
    },
    cache: {
      positiveExact: 0,
      validNegative: 0,
      activeLeases: 0,
      malformed: 0,
      exactEntries: [],
      leaseEntries: [],
      negativeEntries: [],
    },
    learned: {
      observations: 0,
      callsigns: 0,
      qualified: 0,
      warming: 0,
      conflictSuppressed: 0,
      entries: [],
    },
    provider: {
      coolingDown: false,
      reason: null,
      httpStatus: null,
      failures: 0,
      nextAttemptAt: null,
    },
    traffic: { activeProvider: null, feeds: [] },
    today: metricDay({}, day),
    history: [],
  };
}

interface CacheRow {
  key: string;
  payload: string | null;
  expires_at: number;
  lease_until: number;
}

interface ObservationRow {
  callsign: string;
  origin_icao: string;
  destination_icao: string;
  utc_dates: number;
  expires_at: number;
  has_conflict: number;
}

interface MetricRow {
  day: string;
  requests: number;
  covered: number;
  provider_calls: number;
  latency_ms: number;
  exact_cache_hits: number;
  learned_hits: number;
  provider_successes: number;
  provider_misses: number;
  pacing_denials: number;
  daily_denials: number;
  period_denials: number;
  rate_denials: number;
  upstream_429s: number;
  other_failures: number;
}

const integer = (value: unknown) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

const metricDay = (row: Partial<MetricRow>, day: string): RouteOpsMetricDay => {
  const requests = integer(row.requests);
  const covered = integer(row.covered);
  const providerCalls = integer(row.provider_calls);
  return {
    day,
    requests,
    exactCacheHits: integer(row.exact_cache_hits),
    learnedHits: integer(row.learned_hits),
    providerMatches: integer(row.provider_successes),
    validMisses: integer(row.provider_misses),
    covered,
    coveragePercent: requests ? (covered / requests) * 100 : 0,
    providerCalls,
    meanLatencyMs: providerCalls ? integer(row.latency_ms) / providerCalls : 0,
    pacingDenials: integer(row.pacing_denials),
    dailyDenials: integer(row.daily_denials),
    periodDenials: integer(row.period_denials),
    rateDenials: integer(row.rate_denials),
    upstream429s: integer(row.upstream_429s),
    otherFailures: integer(row.other_failures),
  };
};

function cacheKeyParts(key: string) {
  const parts = key.split(':');
  if (parts.length !== 4) return null;
  const callsign = parts[1];
  const direction = parts[2];
  const state = parts[3];
  if (
    !callsign ||
    !/^[A-Z0-9]{3,8}$/.test(callsign) ||
    !['arrival', 'departure', 'unknown'].includes(direction) ||
    !['air', 'ground'].includes(state)
  )
    return null;
  return {
    callsign,
    direction: direction as 'arrival' | 'departure' | 'unknown',
    state: state as 'air' | 'ground',
  };
}

function normalizedExact(payload: string, expiresAt: number) {
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const route = value as Record<string, unknown>;
  const origin = route.origin as Record<string, unknown> | undefined;
  const destination = route.destination as Record<string, unknown> | undefined;
  if (
    route.verification !== 'exact' ||
    typeof route.callsign !== 'string' ||
    !/^[A-Z0-9]{3,8}$/.test(route.callsign) ||
    typeof origin?.icao !== 'string' ||
    !/^[A-Z]{4}$/.test(origin.icao) ||
    typeof destination?.icao !== 'string' ||
    !/^[A-Z]{4}$/.test(destination.icao) ||
    (origin.icao !== airport.icao && destination.icao !== airport.icao)
  )
    return null;
  const checkedAt = Number(route.checkedAt);
  return {
    callsign: route.callsign,
    originIcao: origin.icao,
    destinationIcao: destination.icao,
    verifiedAt: Number.isFinite(checkedAt) ? checkedAt : null,
    expiresAt,
  };
}

function routeFeatureConfigured(env: Record<string, string | undefined>) {
  return (
    env.FR24_DATA_ENABLED === 'true' &&
    (env.FR24_DISPLAY_CACHE_APPROVED === 'true' ||
      env.FR24_OWNER_EXPERIMENT === 'true') &&
    Boolean(env.FR24_API_TOKEN)
  );
}

function pacedAvailabilityAt(
  budget: RouteBudget,
  spentBeforeToday: number,
  daySpent: number,
  now: number,
) {
  const initial = airportRoutePacing(budget, spentBeforeToday, now);
  const needed = daySpent + SUMMARY_RESERVATION;
  const intervals: Array<[number, number]> = [];
  if (now < initial.eveningEnd) intervals.push([now + 1, initial.eveningEnd]);
  if (now < initial.morningStart)
    intervals.push([
      Math.max(now + 1, initial.morningStart),
      initial.morningStart,
    ]);
  intervals.push([Math.max(now + 1, initial.morningStart), initial.dayEnd - 1]);
  for (const [rawStart, rawEnd] of intervals) {
    const start = Math.min(rawStart, rawEnd);
    const end = rawEnd;
    if (end < now || end < start) continue;
    if (
      airportRoutePacing(budget, spentBeforeToday, end).pacedAllowance < needed
    )
      continue;
    let low = start;
    let high = end;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (
        airportRoutePacing(budget, spentBeforeToday, middle).pacedAllowance >=
        needed
      )
        high = middle;
      else low = middle + 1;
    }
    return low;
  }
  return initial.dayEnd;
}

async function lookupStatus(
  db: SqlDatabase,
  env: Record<string, string | undefined>,
  now: number,
): Promise<RouteOpsSnapshot['newLookupStatus']> {
  if (!routeFeatureConfigured(env))
    return {
      state: 'disabled',
      detail: 'Exact route lookups are disabled.',
      nextBoundaryAt: null,
      bostonBlock: null,
    };

  const parsedEnd = Date.parse(env.FR24_BILLING_PERIOD_END ?? '');
  const budget = routeBudget(env, now);
  if (!budget) {
    const periodEnded = Number.isFinite(parsedEnd) && now >= parsedEnd;
    return {
      state: periodEnded ? 'period-budget' : 'disabled',
      detail: periodEnded
        ? 'The billing period ended; manual renewal is required.'
        : 'Exact route lookup settings are invalid or inactive.',
      nextBoundaryAt: null,
      bostonBlock: null,
    };
  }

  const store = new RouteStore(db);
  const provider = await store.providerState('fr24');
  const { usage, pacing } = await store.pacing(budget, now);
  const base = { bostonBlock: pacing.block };
  if (provider && provider.nextAttemptAt > now)
    return {
      ...base,
      state: 'provider-cooldown',
      detail:
        provider.reason === 'rate-limited'
          ? 'FR24 is rate-limiting new lookups.'
          : 'FR24 is temporarily cooling down after a failure.',
      nextBoundaryAt: provider.nextAttemptAt,
    };
  if (usage.periodSpent + SUMMARY_RESERVATION > budget.credits)
    return {
      ...base,
      state: 'period-budget',
      detail: 'The billing-period limit blocks new lookups.',
      nextBoundaryAt: null,
    };
  if (usage.daySpent + SUMMARY_RESERVATION > budget.dailyCredits)
    return {
      ...base,
      state: 'daily-budget',
      detail: 'The UTC-day limit blocks new lookups.',
      nextBoundaryAt: pacing.dayEnd,
    };
  if (usage.daySpent + SUMMARY_RESERVATION > pacing.pacedAllowance)
    return {
      ...base,
      state: 'paced',
      detail:
        pacing.block === 'overnight'
          ? `New allowance resumes at 8 a.m. ${airport.city} time.`
          : 'The paced allowance is increasing through this block.',
      nextBoundaryAt: pacedAvailabilityAt(
        budget,
        usage.periodSpent - usage.daySpent,
        usage.daySpent,
        now,
      ),
    };
  if (usage.recentCalls >= 10) {
    const oldest = await db
      .prepare(
        'SELECT MIN(created_at) created_at FROM route_credits WHERE created_at > ? AND created_at <= ?',
      )
      .bind(now - 60_000, now)
      .first<{ created_at: number | null }>();
    return {
      ...base,
      state: 'rate-limited',
      detail: 'The local rolling request limit is full.',
      nextBoundaryAt: oldest?.created_at
        ? Number(oldest.created_at) + 60_001
        : now + 60_000,
    };
  }
  return {
    ...base,
    state: 'available',
    detail: 'A new Summary lookup can be reserved now.',
    nextBoundaryAt: null,
  };
}

export async function routeOpsSnapshot(
  db: SqlDatabase,
  env: Record<string, string | undefined>,
  now = Date.now(),
): Promise<RouteOpsSnapshot> {
  const cacheRows = (
    await db
      .prepare(
        'SELECT key, payload, expires_at, lease_until FROM route_cache WHERE expires_at > ? OR lease_until > ? ORDER BY expires_at ASC',
      )
      .bind(now, now)
      .all<CacheRow>()
  ).results;
  const exactEntries: RouteOpsSnapshot['cache']['exactEntries'] = [];
  const leaseEntries: RouteOpsSnapshot['cache']['leaseEntries'] = [];
  const negativeEntries: RouteOpsSnapshot['cache']['negativeEntries'] = [];
  let malformed = 0;
  let activeLeases = 0;
  for (const row of cacheRows) {
    const key = cacheKeyParts(row.key);
    if (row.lease_until > now) {
      activeLeases += 1;
      if (key) leaseEntries.push({ ...key, expiresAt: row.lease_until });
    }
    if (row.expires_at <= now) continue;
    if (!key) {
      malformed += 1;
      continue;
    }
    if (row.payload === null) {
      negativeEntries.push({ ...key, expiresAt: row.expires_at });
      continue;
    }
    const route = normalizedExact(row.payload, row.expires_at);
    if (!route || route.callsign !== key.callsign) {
      malformed += 1;
      continue;
    }
    exactEntries.push({ ...route, direction: key.direction, state: key.state });
  }

  const observationRows = (
    await db
      .prepare(`SELECT o.callsign, o.origin_icao, o.destination_icao,
      COUNT(DISTINCT o.verified_date) utc_dates, MIN(o.expires_at) expires_at,
      CASE WHEN EXISTS (
        SELECT 1 FROM route_observations conflict
        WHERE conflict.callsign = o.callsign AND conflict.expires_at > ?
        AND conflict.first_received_at >= ?
        AND (conflict.origin_icao <> o.origin_icao OR conflict.destination_icao <> o.destination_icao)
      ) THEN 1 ELSE 0 END has_conflict
      FROM route_observations o WHERE o.expires_at > ?
      GROUP BY o.callsign, o.origin_icao, o.destination_icao
      ORDER BY o.callsign, MAX(o.first_received_at) DESC`)
      .bind(now, now - CONFLICT_WINDOW_MS, now)
      .all<ObservationRow>()
  ).results;
  const observationCounts = await db
    .prepare(`SELECT COUNT(*) observations, COUNT(DISTINCT callsign) callsigns
    FROM route_observations WHERE expires_at > ?`)
    .bind(now)
    .first<{ observations: number; callsigns: number }>();
  const learnedEntries = observationRows.map((row) => ({
    callsign: row.callsign,
    originIcao: row.origin_icao,
    destinationIcao: row.destination_icao,
    status: (row.has_conflict
      ? 'conflict-suppressed'
      : row.utc_dates >= 2
        ? 'qualified'
        : 'warming') as 'qualified' | 'warming' | 'conflict-suppressed',
    utcDates: Number(row.utc_dates),
    expiresAt: Number(row.expires_at),
  }));

  const providerRow = await db
    .prepare(`SELECT next_attempt_at, failures, reason, status
    FROM route_provider_state WHERE key = ?`)
    .bind('fr24')
    .first<{
      next_attempt_at: number;
      failures: number;
      reason: 'rate-limited' | 'unavailable' | null;
      status: number | null;
    }>();

  const trafficRows = (
    await db
      .prepare(`SELECT key, payload IS NOT NULL has_snapshot, snapshot_at,
      next_attempt_at, failures, error FROM traffic_feeds ORDER BY snapshot_at DESC`)
      .all<{
        key: string;
        has_snapshot: number;
        snapshot_at: number;
        next_attempt_at: number;
        failures: number;
        error: string | null;
      }>()
  ).results;
  const trafficFeeds = trafficRows.map((row) => {
    const snapshotAt = row.snapshot_at > 0 ? Number(row.snapshot_at) : null;
    const nextAttemptAt =
      row.next_attempt_at > now ? Number(row.next_attempt_at) : null;
    return {
      provider: row.key.split(':').at(-1) ?? row.key,
      hasSnapshot: Boolean(row.has_snapshot),
      snapshotAt,
      ageMs: snapshotAt === null ? null : Math.max(0, now - snapshotAt),
      failures: Number(row.failures),
      coolingDown: nextAttemptAt !== null && Boolean(row.error),
      nextAttemptAt,
      error: row.error,
    };
  });
  const activeFeed =
    trafficFeeds.find(
      (feed) =>
        feed.hasSnapshot && !feed.error && (feed.ageMs ?? Infinity) < 60_000,
    ) ?? trafficFeeds.find((feed) => feed.hasSnapshot);

  const historyStart = new Date(now - 13 * DAY_MS).toISOString().slice(0, 10);
  const metricRows = (
    await db
      .prepare(`SELECT day, requests, covered, provider_calls, latency_ms,
      exact_cache_hits, learned_hits, provider_successes, provider_misses,
      pacing_denials, daily_denials, period_denials, rate_denials,
      upstream_429s, other_failures FROM route_metrics
      WHERE day >= ? ORDER BY day DESC LIMIT 14`)
      .bind(historyStart)
      .all<MetricRow>()
  ).results;
  const todayKey = new Date(now).toISOString().slice(0, 10);
  const todayRow = metricRows.find((row) => row.day === todayKey);

  return {
    generatedAt: now,
    newLookupStatus: await lookupStatus(db, env, now),
    cache: {
      positiveExact: exactEntries.length,
      validNegative: negativeEntries.length,
      activeLeases,
      malformed,
      exactEntries,
      leaseEntries,
      negativeEntries,
    },
    learned: {
      observations: Number(observationCounts?.observations ?? 0),
      callsigns: Number(observationCounts?.callsigns ?? 0),
      qualified: learnedEntries.filter((entry) => entry.status === 'qualified')
        .length,
      warming: learnedEntries.filter((entry) => entry.status === 'warming')
        .length,
      conflictSuppressed: learnedEntries.filter(
        (entry) => entry.status === 'conflict-suppressed',
      ).length,
      entries: learnedEntries,
    },
    provider: {
      coolingDown: Boolean(providerRow && providerRow.next_attempt_at > now),
      reason: providerRow?.reason ?? null,
      httpStatus: providerRow?.status ?? null,
      failures: Number(providerRow?.failures ?? 0),
      nextAttemptAt:
        providerRow && providerRow.next_attempt_at > now
          ? Number(providerRow.next_attempt_at)
          : null,
    },
    traffic: {
      activeProvider: activeFeed?.provider ?? null,
      feeds: trafficFeeds,
    },
    today: metricDay(todayRow ?? {}, todayKey),
    history: metricRows.map((row) => metricDay(row, row.day)),
  };
}
