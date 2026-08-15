import { DatabaseSync } from "node:sqlite";

export const THEUS_TEST_SCHEMA = `
CREATE TABLE tasks (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'medium',
  due_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE notes (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE events (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  all_day INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE admin_login_limits (
  subject TEXT PRIMARY KEY NOT NULL,
  window_started_at INTEGER NOT NULL,
  failures INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE admin_audit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  subject TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE admin_sessions (
  nonce TEXT PRIMARY KEY NOT NULL,
  subject TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

export function createMemoryD1(schema = THEUS_TEST_SCHEMA) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(schema);
  const stats = { prepareCalls: 0 };

  class PreparedStatement {
    constructor(query, values = []) {
      this.query = query;
      this.values = values;
    }

    bind(...values) {
      return new PreparedStatement(this.query, values);
    }

    async first(column) {
      const row = sqlite.prepare(this.query).get(...this.values);
      if (!row) return null;
      return column ? row[column] ?? null : row;
    }

    async run() {
      const result = sqlite.prepare(this.query).run(...this.values);
      return d1Result([], result);
    }

    async all() {
      const rows = sqlite.prepare(this.query).all(...this.values);
      return d1Result(rows);
    }

    async raw() {
      return sqlite.prepare(this.query).all(...this.values).map((row) => Object.values(row));
    }
  }

  const database = {
    prepare(query) {
      stats.prepareCalls += 1;
      return new PreparedStatement(query);
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    async exec(query) {
      sqlite.exec(query);
      return { count: 0, duration: 0 };
    },
    async dump() {
      return new ArrayBuffer(0);
    },
  };

  return { database, sqlite, stats };
}

function d1Result(results, execution = {}) {
  return {
    results,
    success: true,
    meta: {
      changes: Number(execution.changes ?? 0),
      last_row_id: Number(execution.lastInsertRowid ?? 0),
    },
  };
}
