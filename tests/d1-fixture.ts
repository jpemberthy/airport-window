import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

// Execute the production SQL against SQLite; don't mock the atomic predicates.
export function testDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync('drizzle')
    .filter((name) => name.endsWith('.sql'))
    .sort())
    sqlite.exec(readFileSync(`drizzle/${file}`, 'utf8'));
  function statement(sql: string, values: unknown[] = []) {
    const all = () =>
      sqlite.prepare(sql).all(...(values as (string | number | null)[]));
    return {
      bind: (...args: unknown[]) => statement(sql, args),
      first: async () => all()[0] ?? null,
      all: async () => ({ results: all(), success: true }),
      run: async () => ({ results: all(), success: true }),
    };
  }
  const db = {
    prepare: statement,
    batch: async (statements: ReturnType<typeof statement>[]) => {
      sqlite.exec('BEGIN');
      try {
        const result = await Promise.all(statements.map((s) => s.run()));
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  } as unknown as import('../db/storage').SqlDatabase;
  return { db, sqlite };
}
