import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { KB } from "../types/kb.ts";
import type { Overrides } from "../types/overrides.ts";
import type { CoverLetter } from "../types/coverletter.ts";

/**
 * Drizzle schema (spec §12). SQLite is the only stateful dependency for a
 * default install. JSON-shaped columns use text with a `{ mode: "json" }`
 * codec so the rest of the app works with typed objects.
 */

/** A base resume — the immutable canonical KB document. */
export const bases = sqliteTable("bases", {
  id: text("id").primaryKey(),
  /** Denormalised from profile.name for cheap list summaries. */
  name: text("name").notNull(),
  template: text("template").notNull(),
  templateLock: integer("template_lock", { mode: "boolean" }).notNull().default(false),
  /** Full canonical KB document. */
  data: text("data", { mode: "json" }).$type<KB>().notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
});

/** A child resume — stores only the override diff, never the merged result. */
export const resumes = sqliteTable(
  "resumes",
  {
    id: text("id").primaryKey(),
    baseId: text("base_id")
      .notNull()
      .references(() => bases.id),
    /** Effective template id (override or inherited from base). */
    template: text("template").notNull(),
    company: text("company"),
    role: text("role"),
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
    /** Diff-only override payload (normalised canonical shape). */
    overrides: text("overrides", { mode: "json" }).$type<Overrides>().notNull().default({}),
    /** Optional cover letter (addressee + body) for this child resume. */
    coverLetter: text("cover_letter", { mode: "json" }).$type<CoverLetter>(),
    /** Current PDF version counter; render N produces `<id>_vN.pdf`. */
    version: integer("version").notNull().default(0),
    pdfPath: text("pdf_path"),
    pdfUrl: text("pdf_url"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => ({
    baseIdx: index("resumes_base_idx").on(t.baseId),
    companyIdx: index("resumes_company_idx").on(t.company),
  }),
);

/** A named, hashed API key for machine/integration access. */
export const apiKeys = sqliteTable("api_keys", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Owning user. Nullable so legacy/env-only keys remain valid. */
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  /** SHA-256 hex digest of the raw key — never store plaintext. */
  hash: text("hash").notNull().unique(),
  /** First 16 chars of the raw key for safe display (e.g. "amr_live_AbCdEf…"). */
  prefix: text("prefix").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
});

/** The single owner account for a self-hosted instance. */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  /** scrypt hash (Bun.password) — never store plaintext. */
  passwordHash: text("password_hash").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
});

/** Browser session for the dashboard (httpOnly cookie holds the id). */
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
});

export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type NewApiKeyRow = typeof apiKeys.$inferInsert;
export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type SessionRow = typeof sessions.$inferSelect;
export type NewSessionRow = typeof sessions.$inferInsert;

export type BaseRow = typeof bases.$inferSelect;
export type NewBaseRow = typeof bases.$inferInsert;
export type ResumeRow = typeof resumes.$inferSelect;
export type NewResumeRow = typeof resumes.$inferInsert;
