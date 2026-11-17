'use client';

import { airport } from '@/lib/airport';

import { useCallback, useEffect, useState } from 'react';
import type {
  RouteOpsLookupState,
  RouteOpsMetricDay,
  RouteOpsSnapshot,
} from '@/lib/route-ops';

const statusLabels: Record<RouteOpsLookupState, string> = {
  available: 'Available',
  paced: 'Paced',
  'daily-budget': 'Daily blocked',
  'period-budget': 'Period blocked',
  'rate-limited': 'Locally rate-limited',
  'provider-cooldown': 'Provider cooldown',
  disabled: 'Disabled',
  'storage-unavailable': 'Storage unavailable',
};

const dateTime = new Intl.DateTimeFormat('en-US', {
  timeZone: airport.timeZone,
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  timeZoneName: 'short',
});

const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

function time(value: number | null) {
  return value === null ? '—' : dateTime.format(value);
}

function duration(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function metricCells(day: RouteOpsMetricDay) {
  return [
    day.requests,
    day.exactCacheHits,
    day.learnedHits,
    day.providerMatches,
    day.validMisses,
    `${day.coveragePercent.toFixed(1)}%`,
    day.providerCalls,
    `${integer.format(day.meanLatencyMs)} ms`,
    day.pacingDenials,
    day.dailyDenials,
    day.periodDenials,
    day.rateDenials,
    day.upstream429s,
    day.otherFailures,
  ];
}

const metricHeaders = [
  'Requests',
  'Exact cache',
  'Usual',
  'Provider matches',
  'Valid misses',
  'Coverage',
  'Calls',
  'Mean latency',
  'Paced',
  'Daily',
  'Period',
  'Local limit',
  '429s',
  'Failures',
];

export function RouteOpsDashboard() {
  const [snapshot, setSnapshot] = useState<RouteOpsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await fetch('/api/ops/routes', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const body = (await response.json()) as RouteOpsSnapshot;
      if (!response.ok && response.status !== 503)
        throw new Error('The operations snapshot could not be loaded.');
      setSnapshot(body);
      setError(
        response.ok ? null : 'Route storage is temporarily unavailable.',
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'The operations snapshot could not be loaded.',
      );
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const initialRefresh = setTimeout(() => void refresh(), 0);
    let timer: ReturnType<typeof setInterval> | null = null;
    let initialized = false;
    const updatePolling = () => {
      if (timer) clearInterval(timer);
      timer = null;
      if (document.visibilityState === 'visible') {
        timer = setInterval(() => void refresh(), 30_000);
        if (initialized) void refresh();
      }
      initialized = true;
    };
    updatePolling();
    document.addEventListener('visibilitychange', updatePolling);
    return () => {
      clearTimeout(initialRefresh);
      document.removeEventListener('visibilitychange', updatePolling);
      if (timer) clearInterval(timer);
    };
  }, [refresh]);

  return (
    <main className="route-ops">
      <header className="ops-header">
        <div>
          <p className="ops-kicker">Private operations</p>
          <h1>Route reliability</h1>
          <p>
            Exact cache, learned evidence, and provider health for{' '}
            {airport.brand.title}.
          </p>
        </div>
        <div className="ops-refresh">
          <span>
            {snapshot
              ? `Updated ${time(snapshot.generatedAt)}`
              : 'Waiting for first snapshot'}
          </span>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
          >
            {refreshing ? 'Refreshing…' : 'Refresh now'}
          </button>
        </div>
      </header>

      {error ? <div className="ops-alert">{error}</div> : null}
      {!snapshot ? (
        <section className="ops-loading" aria-live="polite">
          Loading route operations…
        </section>
      ) : (
        <>
          <section
            className={`lookup-state state-${snapshot.newLookupStatus.state}`}
          >
            <div>
              <span>New exact lookup</span>
              <strong>{statusLabels[snapshot.newLookupStatus.state]}</strong>
            </div>
            <p>{snapshot.newLookupStatus.detail}</p>
            <dl>
              <div>
                <dt>{airport.city} block</dt>
                <dd>{snapshot.newLookupStatus.bostonBlock ?? '—'}</dd>
              </div>
              <div>
                <dt>Next boundary</dt>
                <dd>{time(snapshot.newLookupStatus.nextBoundaryAt)}</dd>
              </div>
            </dl>
          </section>

          <section className="ops-summary" aria-label="Route cache summary">
            {[
              ['Exact routes', snapshot.cache.positiveExact],
              ['Negative misses', snapshot.cache.validNegative],
              ['Active leases', snapshot.cache.activeLeases],
              ['Malformed', snapshot.cache.malformed],
              ['Qualified usual', snapshot.learned.qualified],
              ['Warming', snapshot.learned.warming],
              ['Conflicts', snapshot.learned.conflictSuppressed],
            ].map(([label, value]) => (
              <article key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </section>

          <section className="ops-panel">
            <div className="panel-heading">
              <div>
                <p>Current cache</p>
                <h2>Active exact routes</h2>
              </div>
              <span>{snapshot.cache.exactEntries.length} live</span>
            </div>
            {snapshot.cache.exactEntries.length ? (
              <div className="ops-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Callsign</th>
                      <th>Route</th>
                      <th>Direction</th>
                      <th>State</th>
                      <th>Verified</th>
                      <th>Remaining</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.cache.exactEntries.map((entry, index) => (
                      <tr key={`${entry.callsign}-${entry.expiresAt}-${index}`}>
                        <td className="ops-callsign">{entry.callsign}</td>
                        <td>
                          {entry.originIcao} → {entry.destinationIcao}
                        </td>
                        <td>{entry.direction}</td>
                        <td>{entry.state}</td>
                        <td>{time(entry.verifiedAt)}</td>
                        <td>
                          {duration(entry.expiresAt - snapshot.generatedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="ops-empty">No unexpired exact routes are cached.</p>
            )}
            {snapshot.cache.negativeEntries.length ? (
              <details className="negative-cache">
                <summary>
                  {snapshot.cache.negativeEntries.length} valid negative misses
                </summary>
                <ul>
                  {snapshot.cache.negativeEntries.map((entry, index) => (
                    <li key={`${entry.callsign}-${entry.expiresAt}-${index}`}>
                      <strong>{entry.callsign}</strong>
                      <span>
                        {entry.direction} · {entry.state}
                      </span>
                      <span>expires {time(entry.expiresAt)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            {snapshot.cache.leaseEntries.length ? (
              <details className="negative-cache">
                <summary>
                  {snapshot.cache.leaseEntries.length} active lookup leases
                </summary>
                <ul>
                  {snapshot.cache.leaseEntries.map((entry, index) => (
                    <li key={`${entry.callsign}-${entry.expiresAt}-${index}`}>
                      <strong>{entry.callsign}</strong>
                      <span>
                        {entry.direction} · {entry.state}
                      </span>
                      <span>releases {time(entry.expiresAt)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </section>

          <section className="ops-grid">
            <article className="ops-panel">
              <div className="panel-heading">
                <div>
                  <p>Learned evidence</p>
                  <h2>Usual routes</h2>
                </div>
                <span>{snapshot.learned.observations} observations</span>
              </div>
              {snapshot.learned.entries.length ? (
                <ul className="route-list">
                  {snapshot.learned.entries.map((entry, index) => (
                    <li
                      key={`${entry.callsign}-${entry.originIcao}-${entry.destinationIcao}-${index}`}
                    >
                      <div>
                        <strong>{entry.callsign}</strong>
                        <span>
                          {entry.originIcao} → {entry.destinationIcao}
                        </span>
                      </div>
                      <div>
                        <span
                          className={`evidence-status evidence-${entry.status}`}
                        >
                          {entry.status}
                        </span>
                        <small>
                          {entry.utcDates} UTC{' '}
                          {entry.utcDates === 1 ? 'date' : 'dates'} · retains to{' '}
                          {time(entry.expiresAt)}
                        </small>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ops-empty">
                  No learned evidence has been retained yet.
                </p>
              )}
            </article>

            <article className="ops-panel">
              <div className="panel-heading">
                <div>
                  <p>Provider health</p>
                  <h2>Traffic + FR24</h2>
                </div>
                <span>
                  {snapshot.traffic.activeProvider ?? 'No active feed'}
                </span>
              </div>
              <dl className="health-list">
                <div>
                  <dt>FR24 state</dt>
                  <dd>
                    {snapshot.provider.coolingDown ? 'Cooling down' : 'Ready'}
                  </dd>
                </div>
                <div>
                  <dt>FR24 failures</dt>
                  <dd>{snapshot.provider.failures}</dd>
                </div>
                <div>
                  <dt>Next FR24 attempt</dt>
                  <dd>{time(snapshot.provider.nextAttemptAt)}</dd>
                </div>
              </dl>
              {snapshot.traffic.feeds.length ? (
                <ul className="feed-list">
                  {snapshot.traffic.feeds.map((feed) => (
                    <li key={feed.provider}>
                      <div>
                        <strong>{feed.provider}</strong>
                        <span>
                          {feed.hasSnapshot ? 'snapshot cached' : 'no snapshot'}
                        </span>
                      </div>
                      <div>
                        <span>
                          {feed.ageMs === null
                            ? '—'
                            : `${duration(feed.ageMs)} old`}
                        </span>
                        <small>
                          {feed.coolingDown
                            ? `cooldown to ${time(feed.nextAttemptAt)}`
                            : (feed.error ?? `${feed.failures} failures`)}
                        </small>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ops-empty">No traffic-cache rows are present.</p>
              )}
            </article>
          </section>

          <section className="ops-panel">
            <div className="panel-heading">
              <div>
                <p>UTC day</p>
                <h2>Today’s route outcomes</h2>
              </div>
              <span>{snapshot.today.day}</span>
            </div>
            <div className="metric-grid">
              {metricHeaders.map((label, index) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{metricCells(snapshot.today)[index]}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="ops-panel">
            <div className="panel-heading">
              <div>
                <p>Retained aggregates</p>
                <h2>14-day history</h2>
              </div>
            </div>
            {snapshot.history.length ? (
              <div className="ops-table-wrap history-table">
                <table>
                  <thead>
                    <tr>
                      <th>UTC day</th>
                      {metricHeaders.map((header) => (
                        <th key={header}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.history.map((day) => (
                      <tr key={day.day}>
                        <td>{day.day}</td>
                        {metricCells(day).map((value, index) => (
                          <td key={`${day.day}-${metricHeaders[index]}`}>
                            {value}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="ops-empty">
                No daily route metrics have been recorded.
              </p>
            )}
          </section>
        </>
      )}
    </main>
  );
}
