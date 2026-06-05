import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { config } from "../config.ts";
import * as schema from "./schema.ts";

/**
 * SQLite database client (spec §12). The DB file lives at
 * <dataDir>/apimyresume.db and is created on first start. WAL mode is enabled
 * for better read/write concurrency under the worker pool.
 */

mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const sqlite = new Database(config.dbPath, { create: true });
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA foreign_keys = ON;");

export const db = drizzle(sqlite, { schema });

export { schema };
export type DB = typeof db;
