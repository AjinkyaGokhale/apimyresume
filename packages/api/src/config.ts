import os from "node:os";
import path from "node:path";

/**
 * Central configuration, derived entirely from environment variables.
 * No config file is required for a basic install (see spec §20).
 *
 * Bun automatically loads `.env`, so `process.env` is already populated here.
 */

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function str(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw === undefined || raw.trim() === "" ? fallback : raw;
}

/** Resolve relative to repo root (two levels up from packages/api/src/). */
const REPO_ROOT = path.resolve(import.meta.dir, "../../..");

function abs(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(REPO_ROOT, p);
}

const DATA_DIR = abs(str("DATA_DIR", "./data"));

/** Default render worker count: one less than CPU count, but at least 1. */
function defaultWorkers(): number {
  return Math.max(os.cpus().length - 1, 1);
}

export const config = {
  nodeEnv: str("NODE_ENV", "development"),
  isDev: str("NODE_ENV", "development") !== "production",

  port: int("PORT", 3000),

  // API_KEY may be undefined here; on first start the auth layer generates one
  // and persists it to <dataDir>/.apikey.
  apiKey: process.env.API_KEY,

  dataDir: DATA_DIR,
  dbPath: path.join(DATA_DIR, "apimyresume.db"),
  pdfDir: path.join(DATA_DIR, "pdfs"),
  apiKeyFile: path.join(DATA_DIR, ".apikey"),

  storageDriver: str("STORAGE_DRIVER", "local") as "local" | "s3",
  s3: {
    bucket: process.env.S3_BUCKET,
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },

  templatesDir: abs(str("TEMPLATES_DIR", "./templates")),
  typstCachePath: abs(str("TYPST_PACKAGE_CACHE_PATH", path.join(DATA_DIR, ".typst-cache"))),
  fontPaths: str("TYPST_FONT_PATHS", "./fonts")
    .split(":")
    .map((p) => p.trim())
    .filter(Boolean)
    .map(abs),

  renderWorkers: int("RENDER_WORKERS", defaultWorkers()),
  renderTimeoutMs: int("RENDER_TIMEOUT_MS", 30_000),

  rateLimitPerMinute: int("RATE_LIMIT_PER_MINUTE", 0),

  dashboardDir: abs(str("DASHBOARD_DIR", "packages/dashboard/build")),
} as const;

export type Config = typeof config;
