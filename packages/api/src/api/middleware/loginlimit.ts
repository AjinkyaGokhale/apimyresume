import type { MiddlewareHandler } from "hono";
import { config } from "../../config.ts";
import { AppError } from "../../lib/errors.ts";
import { clientIp } from "../../lib/net.ts";

/**
 * Fixed-window brute-force limiter for the owner login/setup endpoints, keyed
 * by client IP. These endpoints are public (they must be reachable before any
 * session exists) and so bypass the per-API-key rate limiter — without this an
 * attacker could guess the owner password unthrottled.
 *
 * In-memory and per-process: adequate for the single-node default install.
 */
interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

// Opportunistic cleanup so the map can't grow without bound under a flood of
// distinct source IPs.
function sweep(now: number): void {
  if (windows.size < 10_000) return;
  for (const [ip, w] of windows) {
    if (now >= w.resetAt) windows.delete(ip);
  }
}

export const loginRateLimit: MiddlewareHandler = async (c, next) => {
  const limit = config.loginMaxAttempts;
  if (limit <= 0) return next();

  const ip = clientIp(c);
  const now = Date.now();
  sweep(now);

  let w = windows.get(ip);
  if (!w || now >= w.resetAt) {
    w = { count: 0, resetAt: now + config.loginWindowMs };
    windows.set(ip, w);
  }

  w.count++;
  if (w.count > limit) {
    const retryAfter = Math.ceil((w.resetAt - now) / 1000);
    c.header("Retry-After", String(retryAfter));
    throw new AppError(429, "rate_limit_exceeded", "Too many attempts. Try again later.");
  }
  await next();
};
