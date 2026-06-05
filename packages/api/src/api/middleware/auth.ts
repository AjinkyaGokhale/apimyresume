import type { MiddlewareHandler } from "hono";
import { forbidden, unauthorized } from "../../lib/errors.ts";
import { verifyApiKey } from "../../lib/apikey.ts";

/**
 * API key authentication (spec §18). Requires a valid X-API-Key header.
 *   - missing header → 401 "API key required"
 *   - invalid key    → 403 "Invalid api key"
 * Static PDF files and the health endpoint are mounted outside this middleware
 * and remain publicly accessible.
 */
export const apiKeyAuth: MiddlewareHandler = async (c, next) => {
  const provided = c.req.header("X-API-Key");
  if (!provided) throw unauthorized();
  if (!verifyApiKey(provided)) throw forbidden();
  await next();
};
