import { sqlite } from "./index.ts";
import { log } from "../lib/log.ts";

/**
 * Idempotent schema bootstrap (spec §12, §20: "Drizzle migrations run
 * automatically on API startup"). Creates the core tables plus a SQLite FTS5
 * index over resume company/role/tags that powers dashboard search (spec §14).
 *
 * Safe to call on every startup — every statement is IF NOT EXISTS / CREATE
 * TRIGGER IF NOT EXISTS.
 */
export function migrate(): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS bases (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      template      TEXT NOT NULL,
      template_lock INTEGER NOT NULL DEFAULT 0,
      data          TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS resumes (
      id         TEXT PRIMARY KEY,
      base_id    TEXT NOT NULL REFERENCES bases(id),
      template   TEXT NOT NULL,
      company    TEXT,
      role       TEXT,
      tags       TEXT NOT NULL DEFAULT '[]',
      overrides  TEXT NOT NULL DEFAULT '{}',
      version    INTEGER NOT NULL DEFAULT 0,
      pdf_path   TEXT,
      pdf_url    TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE INDEX IF NOT EXISTS resumes_base_idx ON resumes(base_id);
    CREATE INDEX IF NOT EXISTS resumes_company_idx ON resumes(company);

    -- Full-text search index (spec §14). content='' makes it an external-content
    -- FTS table kept in sync by the triggers below; rowid maps to resumes.rowid.
    CREATE VIRTUAL TABLE IF NOT EXISTS resumes_fts USING fts5(
      company, role, tags,
      content=''
    );

    CREATE TRIGGER IF NOT EXISTS resumes_ai AFTER INSERT ON resumes BEGIN
      INSERT INTO resumes_fts(rowid, company, role, tags)
      VALUES (new.rowid, coalesce(new.company,''), coalesce(new.role,''), coalesce(new.tags,'[]'));
    END;

    CREATE TRIGGER IF NOT EXISTS resumes_ad AFTER DELETE ON resumes BEGIN
      INSERT INTO resumes_fts(resumes_fts, rowid, company, role, tags)
      VALUES ('delete', old.rowid, coalesce(old.company,''), coalesce(old.role,''), coalesce(old.tags,'[]'));
    END;

    CREATE TRIGGER IF NOT EXISTS resumes_au AFTER UPDATE ON resumes BEGIN
      INSERT INTO resumes_fts(resumes_fts, rowid, company, role, tags)
      VALUES ('delete', old.rowid, coalesce(old.company,''), coalesce(old.role,''), coalesce(old.tags,'[]'));
      INSERT INTO resumes_fts(rowid, company, role, tags)
      VALUES (new.rowid, coalesce(new.company,''), coalesce(new.role,''), coalesce(new.tags,'[]'));
    END;
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      user_id    TEXT REFERENCES users(id) ON DELETE CASCADE,
      hash       TEXT NOT NULL UNIQUE,
      prefix     TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);

  // Upgrade path: databases created before owner auth have api_keys without
  // user_id, and CREATE TABLE IF NOT EXISTS above is a no-op for them.
  const apiKeyCols = sqlite
    .query("PRAGMA table_info(api_keys)")
    .all() as Array<{ name: string }>;
  if (!apiKeyCols.some((c) => c.name === "user_id")) {
    sqlite.exec("ALTER TABLE api_keys ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;");
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);

  log.info("Database schema ready", { db: sqlite.filename });
}

// Allow `bun run src/db/migrate.ts` to run migrations standalone.
if (import.meta.main) {
  migrate();
}
