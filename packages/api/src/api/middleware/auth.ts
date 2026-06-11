import type { MiddlewareHandler } from "hono";
import { forbidden, unauthorized } from "../../lib/errors.ts";
import { readSessionCookie, getValidSession } from "../../lib/auth.ts";
import { verifyApiKey } from "../../lib/apikey.ts";

/**
 * Authentication middleware (spec §18). Accepts EITHER:
 *   - a valid `X-API-Key` header (programmatic / n8n / Zapier clients), or
 *   - a valid `amr_session` cookie (dashboard browser sessions).
 *
 * If neither is present → 401. If either is present but invalid → 401/403
 * matching the documented envelope. Static PDF files and the health endpoint
 * are mounted outside this middleware and remain publicly accessible.
 */
export const apiKeyAuth: MiddlewareHandler = async (c, next) => {
  // 1) Session cookie path (dashboard)
  const sid = readSessionCookie(c.req.header("cookie"));
  if (sid && getValidSession(sid)) {
    await next();
    return;
  }
  // 2) API key path (programmatic clients)
  const provided = c.req.header("X-API-Key");
  if (!provided) throw unauthorized();
  if (!verifyApiKey(provided)) throw forbidden();
  await next();
};
