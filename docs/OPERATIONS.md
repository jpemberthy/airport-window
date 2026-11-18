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

LoganWatch's Boston setup uses Flightradar24 to enrich an already observed aircraft with flight number and origin/destination details when a match is available. The free ADS-B feeds still supply positions and callsigns, and the app infers airline labels locally. FR24 does not make every route knowable. Its [API subscription is separate from a regular Flightradar24 app subscription](https://fr24api.flightradar24.com/docs/getting-started).

The default app never needs or uses a paid key. An API token by itself does not enable requests. To opt in, read your provider's current terms for public display and caching, establish your own account/budget, and put server-only values in ignored `.env`:

- `FR24_DATA_ENABLED=true`
- `FR24_API_TOKEN` from your own account
- `FR24_DISPLAY_CACHE_APPROVED=true` only if you have the applicable permission
- `FR24_BILLING_PERIOD_START` and `FR24_BILLING_PERIOD_END`: explicit UTC ISO timestamps matching your actual subscription period
- `FR24_CREDIT_ALLOWANCE`, `FR24_DAILY_CREDIT_LIMIT`, and `FR24_PACING_BURST_CREDITS`: positive integer limits; burst must not exceed the daily limit

Retained `FR24_OWNER_EXPERIMENT` is an explicit operator opt-in, not provider approval. `FR24_PRIVATE_EXPERIMENT` applies only in development on loopback. Both are false by default. Use no `NEXT_PUBLIC_` prefix for secrets. Each independent installation needs its own coordinated allowance; local counters cannot cap other consumers of the same token. Billing windows expire closed and do not renew automatically.

Exact route data is cached for at most two hours; misses and learned-route responses have shorter limits. Shared leases, period/day budgets and airport-local pacing constrain lookups. Exhaustion stops enrichment while positions continue. Hosting costs are separate from flight-data credits.

`AIRPORT_OPS_DASHBOARD_ENABLED` remains false. If you enable the operations page, protect both `/ops/routes` and `/api/ops/routes` with authentication at your own reverse proxy; no authentication system is bundled. The optional HTTP maintenance endpoint remains disabled without `ROUTE_MAINTENANCE_TOKEN`; the bundled cleanup scheduler does not need it.

### Agent checklist for this airport

1. Confirm the selected pack's ICAO, time zone and feed coverage. The included FR24 adapter already uses that airport for route matching and summary queries, and its time zone for pacing. Changing airports does not require replacing Boston constants in provider code.
2. Check the operator's API access and current [endpoint documentation](https://fr24api.flightradar24.com/docs/endpoints/overview), [credit costs](https://fr24api.flightradar24.com/docs/credit-overview) and [storage rules](https://fr24api.flightradar24.com/docs/storage-rules/). The adapter uses `live/flight-positions/full` and `flight-summary/full`. Confirm access and the applicable display/cache permissions; do not assume that purchasing a subscription grants every intended use.
3. Agree on the billing-period timestamps, total credit allowance, daily limit and burst limit with the operator before enabling requests. Use their own server-side token and persistent database. Keep experiment flags off for an ordinary deployment; don't use them to bypass missing permission. Never copy LoganWatch's token or ledger.
4. Configure the values listed above in ignored `.env`, then recreate the container with the same project name and port (`docker compose up -d --force-recreate`, including the installation's existing `-p`/`AIRPORT_PORT` settings). For native production, restart the Node process. Do not print the token or place it in the airport pack.
5. Within the approved budget, choose a fresh aircraft from `/api/traffic` and make a bounded check through `/api/route?hex=<aircraft-id>&callsign=<callsign>`. This can spend credits. Check that any returned route matches the aircraft and selected airport. A missing, paced or unavailable result is valid; don't repeatedly retry until something appears or weaken matching. Confirm the UI labels an inferred usual route differently from an exact match. Paid routes should fail independently while free positions continue.
6. Tell the operator what matched, what did not, their configured limits, and when their billing window expires. Recheck current provider costs before future budget changes; the code's limits are not a guarantee about charges elsewhere on the same account.

## Optional tower radio

The Boston reference pack contains a LiveATC Boston Logan tower stream and its [official player page](https://www.liveatc.net/hlisten.php?mount=kbos1_twr&icao=kbos). AEP deliberately has no tower configured. Radio availability and embedding permission must be established for each airport; the generated ambience works without radio.

### Agent checklist for this airport

1. Identify the airport by ICAO and check an appropriate provider's own listing. Confirm whether the channel is tower, ground, approach or a combined feed. Don't guess a URL by editing Boston's stream name, and don't assume an airport's radio is available online.
2. Establish that the operator can use the stream as intended. Obtain a public HTTPS audio URL that the browser can play directly and the provider's HTTPS player page. A webpage URL is not an audio stream. This kit has no authenticated-radio proxy; never put tokens, signed private links or credentials in a pack.
3. Add `tower` to this airport's pack only after verification. The following URLs are placeholders, not a working feed:

   ```ts
   tower: {
     streamUrl: 'https://radio.example.invalid/your-airport-stream',
     playerUrl: 'https://radio.example.invalid/your-airport-player',
     label: 'Provider · Your Airport Tower',
   },
   ```

4. Rebuild, then click **Play tower** in a browser. Test on phone and desktop, including playback restrictions from the eventual deployment domain. Listen long enough to verify the airport/channel, allowing for normal quiet gaps. Check start/stop, volume, simultaneous ambience, and the provider-page link when the stream fails. Browser playback and any applicable cross-origin restrictions must be tested, not inferred from an HTTP 200.
5. Record the source, channel, permission basis and date checked in the pack's documentation. If the source is unavailable or unsuitable, omit `tower`; the controls will stay hidden. Never substitute Boston's feed for another airport, synthesize controller speech, or present a recording as live radio.

## Troubleshooting

- **No positions:** check both public providers from the host using `npm run check:pack -- --live` in the source checkout. Providers may reject a hosting network. Existing backoff prevents tight retry loops. A quiet airport, receiver gap and provider outage are different possibilities.
- **No weather:** confirm the configured METAR station has recent reports. The UI neutralizes unavailable weather instead of presenting made-up observations.
- **No route:** expected by default. Even with enrichment enabled, matching can legitimately fail; the UI leaves unknown routes absent.
- **No map/tower button:** expected when the airport pack omits those optional features.
- **Different-airport database error:** select the matching pack or use a separate installation; don't reset a paid ledger.
- **Artwork missing:** run `npm run check:pack`, verify case-sensitive public paths, rebuild, and clear the browser cache.

All upstream services have their own terms, availability and limits. The code license grants no rights to third-party feeds or radio streams.
