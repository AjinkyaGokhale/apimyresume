import type { Context } from "hono";
import { getConnInfo } from "hono/bun";
import { config } from "../config.ts";

/**
 * Resolve the originating client IP for a request.
 *
 * Behind a trusted reverse proxy (the recommended custom-domain deployment),
 * the real client address is in `X-Forwarded-For` — the socket address is the
 * proxy. When `TRUST_PROXY` is off we ignore that header (a directly-exposed
 * instance must not let clients spoof their IP) and use the socket address.
 *
 * Falls back to `"unknown"` if neither is available, so callers always get a
 * usable bucket key (all such requests share one window — fail closed).
 */
export function clientIp(c: Context): string {
  if (config.trustProxy) {
    const xff = c.req.header("x-forwarded-for");
    // First entry is the original client; later entries are proxy hops.
    const first = xff?.split(",")[0]?.trim();
    if (first) return first;
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}
