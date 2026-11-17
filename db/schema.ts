import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const trafficFeeds = sqliteTable('traffic_feeds', {
  key: text('key').primaryKey(),
  payload: text('payload'),
  snapshotAt: integer('snapshot_at').notNull().default(0),
  nextAttemptAt: integer('next_attempt_at').notNull().default(0),
  lease: text('lease'),
  leaseUntil: integer('lease_until').notNull().default(0),
  failures: integer('failures').notNull().default(0),
  error: text('error'),
});

export const routeCache = sqliteTable('route_cache', {
  key: text('key').primaryKey(),
  payload: text('payload'),
  expiresAt: integer('expires_at').notNull().default(0),
  lease: text('lease'),
  leaseUntil: integer('lease_until').notNull().default(0),
});

// Retain only normalized evidence needed to establish a conservative usual
// route. The provider's raw response is never stored here.
export const routeObservations = sqliteTable(
  'route_observations',
  {
    flightLegId: text('flight_leg_id').primaryKey(),
    callsign: text('callsign').notNull(),
    flightNumber: text('flight_number').notNull(),
    originIcao: text('origin_icao').notNull(),
    destinationIcao: text('destination_icao').notNull(),
    verifiedDate: text('verified_date').notNull(),
    firstReceivedAt: integer('first_received_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [
    index('route_observations_callsign_expiry').on(t.callsign, t.expiresAt),
    index('route_observations_expiry').on(t.expiresAt),
  ],
);

export const routeProviderState = sqliteTable('route_provider_state', {
  key: text('key').primaryKey(),
  nextAttemptAt: integer('next_attempt_at').notNull().default(0),
  failures: integer('failures').notNull().default(0),
  reason: text('reason'),
  status: integer('status'),
  updatedAt: integer('updated_at').notNull().default(0),
});

// Unknown outcomes keep their maximum reserved charge, including process crashes.
// No aircraft identity or provider response is retained in this accounting table.
export const routeCredits = sqliteTable(
  'route_credits',
  {
    id: text('id').primaryKey(),
    createdAt: integer('created_at').notNull(),
    credits: integer('credits').notNull(),
    reserved: integer('reserved').notNull(),
    settled: integer('settled').notNull().default(0),
  },
  (t) => [index('credits_time').on(t.createdAt)],
);

export const routeMetrics = sqliteTable('route_metrics', {
  day: text('day').primaryKey(),
  requests: integer('requests').notNull().default(0),
  cacheHits: integer('cache_hits').notNull().default(0),
  covered: integer('covered').notNull().default(0),
  denied: integer('denied').notNull().default(0),
  errors: integer('errors').notNull().default(0),
  providerCalls: integer('provider_calls').notNull().default(0),
  latencyMs: integer('latency_ms').notNull().default(0),
  exactCacheHits: integer('exact_cache_hits').notNull().default(0),
  learnedHits: integer('learned_hits').notNull().default(0),
  providerSuccesses: integer('provider_successes').notNull().default(0),
  providerMisses: integer('provider_misses').notNull().default(0),
  pacingDenials: integer('pacing_denials').notNull().default(0),
  dailyDenials: integer('daily_denials').notNull().default(0),
  periodDenials: integer('period_denials').notNull().default(0),
  rateDenials: integer('rate_denials').notNull().default(0),
  upstream429s: integer('upstream_429s').notNull().default(0),
  otherFailures: integer('other_failures').notNull().default(0),
});
