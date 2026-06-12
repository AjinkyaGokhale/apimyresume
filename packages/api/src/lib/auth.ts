import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { nanoid } from "nanoid";
import { config } from "../config.ts";
import { db } from "../db/index.ts";
import { sessions, users, type SessionRow, type UserRow } from "../db/schema.ts";

/**
 * Owner / session auth (single-owner, session-cookie). Passwords are hashed
 * with Node's scrypt; sessions are random 32-byte IDs stored in the `sessions`
 * table and held in an httpOnly cookie by the dashboard.
 */

export const SESSION_COOKIE = "amr_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// scrypt parameters — N=2^14, r=8, p=1. Tuned for ~25ms on a modern x86 server
// and stays well under Node's default scrypt memory cap (~32MB).
const SCRYPT_N = 1 << 14;
const SCRYPT_KEY_LEN = 64;
const SALT_LEN = 16;
const SCRYPT_MAXMEM = 32 * 1024 * 1024; // 32MB explicit

// --- Password hashing (scrypt via node:crypto) ---

function hashPasswordSync(plain: string): string {
  const salt = randomBytes(SALT_LEN);
  const derived = scryptSync(plain.normalize("NFKC"), salt, SCRYPT_KEY_LEN, {
    N: SCRYPT_N,
    r: 8,
    p: 1,
    maxmem: SCRYPT_MAXMEM,
  });
  // Format: scrypt$N$r$p$saltHex$hashHex (6 dollar-separated fields)
  return `scrypt$${SCRYPT_N}$8$1$${salt.toString("hex")}$${derived.toString("hex")}`;
}

function verifyPasswordSync(plain: string, encoded: string): boolean {
  // Encoded: "scrypt$N$r$p$saltHex$hashHex" — 6 dollar-separated fields.
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const saltHex = parts[4];
  const hashHex = parts[5];
  if (!Number.isFinite(N) || !saltHex || !hashHex) return false;
  let expected: Buffer;
  let salt: Buffer;
  try {
    expected = Buffer.from(hashHex, "hex");
    salt = Buffer.from(saltHex, "hex");
  } catch {
    return false;
  }
  let derived: Buffer;
  try {
    derived = scryptSync(plain.normalize("NFKC"), salt, expected.length, {
      N,
      r,
      p,
      maxmem: SCRYPT_MAXMEM,
    });
  } catch {
    return false;
  }
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

export async function hashPassword(plain: string): Promise<string> {
  return hashPasswordSync(plain);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return verifyPasswordSync(plain, hash);
}

// --- Users ---

export function findUserByUsername(username: string): UserRow | undefined {
  return db.select().from(users).where(eq(users.username, username)).get();
}

export function getUser(id: string): UserRow | undefined {
  return db.select().from(users).where(eq(users.id, id)).get();
}

export function getOwner(): UserRow | undefined {
  // Single-owner: any user row is the owner.
  return db.select().from(users).limit(1).get();
}

export function hasOwner(): boolean {
  return Boolean(getOwner());
}

export async function createOwner(username: string, password: string): Promise<UserRow> {
  const id = nanoid(12);
  const passwordHash = await hashPassword(password);
  return db
    .insert(users)
    .values({ id, username, passwordHash })
    .returning()
    .get();
}

// --- Sessions ---

export function createSession(userId: string): SessionRow {
  const id = nanoid(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  return db
    .insert(sessions)
    .values({ id, userId, expiresAt })
    .returning()
    .get();
}

export function getValidSession(id: string): SessionRow | undefined {
  if (!id) return undefined;
  const row = db.select().from(sessions).where(eq(sessions.id, id)).get();
  if (!row) return undefined;
  if (new Date(row.expiresAt).getTime() < Date.now()) {
    db.delete(sessions).where(eq(sessions.id, id)).run();
    return undefined;
  }
  return row;
}

export function deleteSession(id: string): void {
  if (!id) return;
  db.delete(sessions).where(eq(sessions.id, id)).run();
}

/** Best-effort cleanup of expired sessions; safe to ignore failures. */
export function purgeExpiredSessions(): void {
  try {
    db.delete(sessions).where(lt(sessions.expiresAt, new Date().toISOString())).run();
  } catch {
    /* table may not exist on a brand-new DB before migrate() runs */
  }
}

// --- Cookie helpers ---

export function sessionCookie(value: string, opts: { secure: boolean }): string {
  const parts = [
    `${SESSION_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(opts: { secure: boolean }): string {
  const parts = [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

export function readSessionCookie(header: string | null | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === SESSION_COOKIE) return rest.join("=") || null;
  }
  return null;
}

/** True if the request is served over HTTPS (proxied or direct). */
export function isSecureRequest(url: string, xfp?: string | null): boolean {
  if (url.startsWith("https://")) return true;
  // A TLS-terminating reverse proxy forwards plain HTTP to the app but sets
  // `X-Forwarded-Proto: https`. Only honour it when we're configured to trust
  // the proxy — otherwise a directly-exposed instance could be tricked into
  // marking insecure cookies as Secure.
  if (!config.trustProxy || !xfp) return false;
  return xfp.split(",")[0]?.trim().toLowerCase() === "https";
}
