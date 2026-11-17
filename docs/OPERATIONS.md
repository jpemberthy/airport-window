# Operating your own instance

This is an unmaintained source release. Each operator owns hosting, costs, backups, provider permissions and software updates. No request is routed through LoganWatch.

## Runtime and persistence

Docker Compose builds a standalone Node server. It binds `127.0.0.1:3000` on the host and persists SQLite in the project-specific `airport-data` volume. Startup applies additive migrations; a background process prunes expired provider payloads every minute even without visitors. Restarting or rebuilding doesn't reset the database. The container runs as the unprivileged `node` user. `/api/health` verifies database access and reports the airport ICAO without provider calls.

For native Node, `npm start` provides the same initialization and cleanup. `AIRPORT_DATABASE_PATH` defaults to `data/airport.sqlite`; `AIRPORT_MIGRATIONS_PATH` defaults to `drizzle`. In production, use an absolute persistent path outside release directories. `.env` is optional and ignored by Git. `npm run dev` initializes storage on first use; `npm run db:prune` is available manually during development.

Use one Node process/container with its own SQLite volume. Do not scale replicas onto independent copies of a paid credit ledger. Each database is bound to its airport configuration; use a new installation/volume when switching airports.

## Internet access and backups

Bring your own domain and HTTPS reverse proxy, forwarding to the loopback port. Docker's internal `HOST=0.0.0.0` makes it reachable through the published port, not directly public on the host. Change the Compose port binding deliberately if exposing it to a LAN. Do not enable development mode on an Internet-facing host.

For a simple consistent backup, stop the container, copy the **entire volume** (including any SQLite WAL files), then restart. Preserve ownership on restore. Test a restoration before relying on a backup. Do not run `docker compose down --volumes` unless intentionally destroying that installation's data.

## Optional paid route enrichment

The default app never needs or uses a paid key. An API token by itself does not enable requests. To opt in, read your provider's current terms for public display and caching, establish your own account/budget, and put server-only values in ignored `.env`:

- `FR24_DATA_ENABLED=true`
- `FR24_API_TOKEN` from your own account
- `FR24_DISPLAY_CACHE_APPROVED=true` only if you have the applicable permission
- `FR24_BILLING_PERIOD_START` and `FR24_BILLING_PERIOD_END`: explicit UTC ISO timestamps matching your actual subscription period
- `FR24_CREDIT_ALLOWANCE`, `FR24_DAILY_CREDIT_LIMIT`, and `FR24_PACING_BURST_CREDITS`: positive integer limits; burst must not exceed the daily limit

Retained `FR24_OWNER_EXPERIMENT` is an explicit operator opt-in, not provider approval. `FR24_PRIVATE_EXPERIMENT` applies only in development on loopback. Both are false by default. Use no `NEXT_PUBLIC_` prefix for secrets. Each independent installation needs its own coordinated allowance; local counters cannot cap other consumers of the same token. Billing windows expire closed and do not renew automatically.

Exact route data is cached for at most two hours; misses and learned-route responses have shorter limits. Shared leases, period/day budgets and airport-local pacing constrain lookups. Exhaustion stops enrichment while positions continue. Hosting costs are separate from flight-data credits.

`AIRPORT_OPS_DASHBOARD_ENABLED` remains false. If you enable the operations page, protect both `/ops/routes` and `/api/ops/routes` with authentication at your own reverse proxy; no authentication system is bundled. The optional HTTP maintenance endpoint remains disabled without `ROUTE_MAINTENANCE_TOKEN`; the bundled cleanup scheduler does not need it.

## Troubleshooting

- **No positions:** check both public providers from the host using `npm run check:pack -- --live` in the source checkout. Providers may reject a hosting network. Existing backoff prevents tight retry loops. A quiet airport, receiver gap and provider outage are different possibilities.
- **No weather:** confirm the configured METAR station has recent reports. The UI neutralizes unavailable weather instead of presenting made-up observations.
- **No route:** expected by default. Even with enrichment enabled, matching can legitimately fail; the UI leaves unknown routes absent.
- **No map/tower button:** expected when the airport pack omits those optional features.
- **Different-airport database error:** select the matching pack or use a separate installation; don't reset a paid ledger.
- **Artwork missing:** run `npm run check:pack`, verify case-sensitive public paths, rebuild, and clear the browser cache.

All upstream services have their own terms, availability and limits. The code license grants no rights to third-party feeds or radio streams.
