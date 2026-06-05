import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { config } from "../config.ts";
import { log } from "./log.ts";
import { verifyDbApiKey } from "../services/apikeys.ts";

/**
 * API key management (spec §18, §20). On first start, if no API_KEY env var is
 * set and no persisted key exists, a random key is generated and written to
 * <dataDir>/.apikey, then logged once to stdout. Supports rotation.
 */

let currentKey: string | null = null;

function generate(): string {
  return `amr_live_${nanoid(32)}`;
}

/** Load the active API key, generating + persisting one on first start. */
export function loadApiKey(): string {
  if (currentKey) return currentKey;

  if (config.apiKey && config.apiKey.trim()) {
    currentKey = config.apiKey.trim();
    return currentKey;
  }

  if (existsSync(config.apiKeyFile)) {
    currentKey = readFileSync(config.apiKeyFile, "utf8").trim();
    return currentKey;
  }

  const key = generate();
  persist(key);
  currentKey = key;
  log.info(`Your API key: ${key}`);
  log.warn("Store this key — it will not be shown again");
  return key;
}

function persist(key: string): void {
  mkdirSync(path.dirname(config.apiKeyFile), { recursive: true });
  writeFileSync(config.apiKeyFile, key, { mode: 0o600 });
}

/** Rotate the API key: generate a new one, persist it, invalidate the old. */
export function rotateApiKey(): string {
  const key = generate();
  persist(key);
  currentKey = key;
  log.info("API key rotated");
  return key;
}

/** Constant-time-ish comparison of a provided key against the active legacy key. */
function verifyLegacyKey(provided: string): boolean {
  const active = loadApiKey();
  if (provided.length !== active.length) return false;
  let diff = 0;
  for (let i = 0; i < active.length; i++) diff |= active.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify a provided key against all valid keys:
 *  1. DB-stored named keys (hashed)
 *  2. Legacy single key (from env / .apikey file)
 */
export function verifyApiKey(provided: string | undefined | null): boolean {
  if (!provided) return false;
  if (verifyLegacyKey(provided)) return true;
  return verifyDbApiKey(provided);
}

export function getApiKey(): string {
  return loadApiKey();
}
