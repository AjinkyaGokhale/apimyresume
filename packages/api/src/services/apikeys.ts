import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../db/index.ts";
import { apiKeys, type ApiKeyRow } from "../db/schema.ts";
import { notFound } from "../lib/errors.ts";

function sha256(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function generateRaw(): string {
  return `amr_live_${nanoid(32)}`;
}

/** Visible prefix shown in the UI — first 16 chars + ellipsis. */
function makePrefix(raw: string): string {
  return raw.slice(0, 16) + "…";
}

export interface ApiKeyPublic {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
}

export interface ApiKeyCreated extends ApiKeyPublic {
  /** Raw key — returned exactly once at creation. Never stored. */
  key: string;
}

export function listApiKeys(userId?: string): ApiKeyPublic[] {
  // userId filter is optional — single-owner deployments pass nothing and get
  // every key, matching the previous behaviour.
  const q = db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys);
  const rows = userId ? q.where(eq(apiKeys.userId, userId)).all() : q.all();
  return rows;
}

export function createApiKey(name: string, userId?: string): ApiKeyCreated {
  const raw = generateRaw();
  const id = nanoid(12);
  const row = {
    id,
    name: name.trim(),
    userId: userId ?? null,
    hash: sha256(raw),
    prefix: makePrefix(raw),
  };
  db.insert(apiKeys).values(row).run();
  return { id, name: row.name, prefix: row.prefix, createdAt: new Date().toISOString(), key: raw };
}

export function deleteApiKey(id: string): void {
  const existing = db.select({ id: apiKeys.id }).from(apiKeys).where(eq(apiKeys.id, id)).get();
  if (!existing) throw notFound(`API key '${id}' not found`);
  db.delete(apiKeys).where(eq(apiKeys.id, id)).run();
}

/** Returns true if the provided raw key matches any DB-stored key. */
export function verifyDbApiKey(provided: string): boolean {
  const hash = sha256(provided);
  const row = db.select({ id: apiKeys.id }).from(apiKeys).where(eq(apiKeys.hash, hash)).get();
  return !!row;
}
