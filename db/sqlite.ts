import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import type { SqlDatabase, SqlStatement } from './storage';

class Statement implements SqlStatement {
  constructor(
    readonly owner: SqliteDatabase,
    readonly sql: string,
    readonly values: SQLInputValue[] = [],
  ) {}

  bind(...values: unknown[]) {
    return new Statement(this.owner, this.sql, values as SQLInputValue[]);
  }

  async first<T>() {
    return (
      (this.owner.connection.prepare(this.sql).get(...this.values) as T) ?? null
    );
  }

  async all<T>() {
    return {
      results: this.owner.connection
        .prepare(this.sql)
        .all(...this.values) as T[],
      success: true,
    };
  }

  execute() {
    return this.owner.connection.prepare(this.sql).run(...this.values);
  }

  async run() {
    return this.execute();
  }
}

export class SqliteDatabase implements SqlDatabase {
  readonly connection: DatabaseSync;

  constructor(path: string, migrationsDirectory: string) {
    this.connection = new DatabaseSync(path);
    this.connection.exec(
      'PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA foreign_keys = ON;',
    );
    // Migrations are transactional and shared between independent connections.
    this.connection.exec('BEGIN IMMEDIATE');
    try {
      this.connection.exec(
        'CREATE TABLE IF NOT EXISTS logan_migrations (name TEXT PRIMARY KEY NOT NULL)',
      );
      for (const file of readdirSync(migrationsDirectory)
        .filter((name) => name.endsWith('.sql'))
        .sort()) {
        if (
          this.connection
            .prepare('SELECT name FROM logan_migrations WHERE name = ?')
            .get(file)
        )
          continue;
        this.connection.exec(
          readFileSync(`${migrationsDirectory}/${file}`, 'utf8'),
        );
        this.connection
          .prepare('INSERT INTO logan_migrations (name) VALUES (?)')
          .run(file);
      }
      this.connection.exec('COMMIT');
    } catch (error) {
      this.connection.exec('ROLLBACK');
      this.connection.close();
      throw error;
    }
  }

  prepare(sql: string) {
    return new Statement(this, sql);
  }

  async batch(statements: SqlStatement[]) {
    this.connection.exec('BEGIN IMMEDIATE');
    try {
      // No await inside the transaction: unrelated requests cannot interleave.
      const results = statements.map((statement) => {
        if (!(statement instanceof Statement) || statement.owner !== this)
          throw new Error('Statement belongs to another database');
        return statement.execute();
      });
      this.connection.exec('COMMIT');
      return results;
    } catch (error) {
      this.connection.exec('ROLLBACK');
      throw error;
    }
  }

  close() {
    this.connection.close();
  }
}
