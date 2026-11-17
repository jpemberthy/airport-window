import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
const path = resolve(
  process.env.AIRPORT_DATABASE_PATH ?? 'data/airport.sqlite',
);
const action = process.argv[2];
if (!['init', 'prune'].includes(action))
  throw new Error('Expected init or prune');
if (action === 'prune' && !existsSync(path))
  throw new Error('Database missing; refusing to create an empty ledger');
mkdirSync(dirname(path), { recursive: true });
const db = new DatabaseSync(path);
db.exec(
  'PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;',
);
db.exec('BEGIN IMMEDIATE');
try {
  if (action === 'init') {
    db.exec(
      'CREATE TABLE IF NOT EXISTS logan_migrations (name TEXT PRIMARY KEY NOT NULL)',
    );
    const directory = resolve(process.env.AIRPORT_MIGRATIONS_PATH ?? 'drizzle');
    for (const name of readdirSync(directory)
      .filter((n) => n.endsWith('.sql'))
      .sort()) {
      if (
        db.prepare('SELECT name FROM logan_migrations WHERE name = ?').get(name)
      )
        continue;
      db.exec(readFileSync(`${directory}/${name}`, 'utf8'));
      db.prepare('INSERT INTO logan_migrations (name) VALUES (?)').run(name);
    }
  } else {
    const now = Date.now();
    db.prepare(
      'DELETE FROM route_cache WHERE expires_at <= ? AND lease_until <= ?',
    ).run(now, now);
    db.prepare(
      'UPDATE traffic_feeds SET payload = NULL WHERE payload IS NOT NULL AND snapshot_at <= ?',
    ).run(now - 60000);
    db.prepare('DELETE FROM route_observations WHERE expires_at <= ?').run(now);
    db.prepare('DELETE FROM route_credits WHERE created_at < ?').run(
      now - 65 * 86400000,
    );
    db.prepare('DELETE FROM route_metrics WHERE day < ?').run(
      new Date(now - 65 * 86400000).toISOString().slice(0, 10),
    );
  }
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
} finally {
  db.close();
}
