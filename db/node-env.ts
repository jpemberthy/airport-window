import { resolve, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { SqliteDatabase } from './sqlite';
import { airportCacheKey } from '../lib/airport';
let database: SqliteDatabase | undefined;
export const env = {
  get DB() {
    if (database) return database;
    const path = resolve(
      process.env.AIRPORT_DATABASE_PATH ?? 'data/airport.sqlite',
    );
    mkdirSync(dirname(path), { recursive: true });
    const opened = new SqliteDatabase(
      path,
      resolve(process.env.AIRPORT_MIGRATIONS_PATH ?? 'drizzle'),
    );
    // An installation owns one airport and one paid-data ledger. Do not reuse a
    // different airport's volume or silently reset it when changing packs.
    opened.connection.exec(
      'CREATE TABLE IF NOT EXISTS airport_instance (id INTEGER PRIMARY KEY CHECK(id = 1), airport TEXT NOT NULL)',
    );
    opened.connection
      .prepare(
        'INSERT OR IGNORE INTO airport_instance (id, airport) VALUES (1, ?)',
      )
      .run(airportCacheKey);
    const instance = opened.connection
      .prepare('SELECT airport FROM airport_instance WHERE id = 1')
      .get() as { airport: string };
    if (instance.airport !== airportCacheKey) {
      opened.close();
      throw new Error(
        'This database belongs to another airport pack. Use a separate volume; do not reset a paid ledger.',
      );
    }
    database = opened;
    return database;
  },
};
