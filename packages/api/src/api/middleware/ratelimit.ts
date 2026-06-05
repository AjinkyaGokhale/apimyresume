import type { MiddlewareHandler } from "hono";
import { config } from "../../config.ts";
import { AppError } from "../../lib/errors.ts";

/**
 * Fixed-window per-key rate limiter (spec §19). A single API key may send up to
 * RATE_LIMIT_PER_MINUTE requests per minute; beyond that → 429 with Retry-After.
 * In-memory and per-process — adequate for a single-node default install.
 */
interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();
const WINDOW_MS = 60_000;

export const rateLimit: MiddlewareHandler = async (c, next) => {
  const limit = config.rateLimitPerMinute;
  if (limit <= 0) return next();

  const key = c.req.header("X-API-Key") ?? "anonymous";
  const now = Date.now();
  let w = windows.get(key);
  if (!w || now >= w.resetAt) {
    w = { count: 0, resetAt: now + WINDOW_MS };
    windows.set(key, w);
  }

  w.count++;
  if (w.count > limit) {
    const retryAfter = Math.ceil((w.resetAt - now) / 1000);
    c.header("Retry-After", String(retryAfter));
    throw new AppError(429, "rate_limit_exceeded", "Rate limit exceeded");
  }
  await next();
};
