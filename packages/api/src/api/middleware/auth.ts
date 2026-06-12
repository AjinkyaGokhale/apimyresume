import type { MiddlewareHandler } from "hono";
import { forbidden, unauthorized } from "../../lib/errors.ts";
import { readSessionCookie, getValidSession } from "../../lib/auth.ts";
import { verifyApiKey } from "../../lib/apikey.ts";

/** How a request authenticated — used by `ownerOnly` to gate human-only actions. */
export type AuthType = "session" | "apikey";

declare module "hono" {
  interface ContextVariableMap {
    authType: AuthType;
  }
}

/**
 * Authentication middleware (spec §18). Accepts EITHER:
 *   - a valid `amr_session` cookie (the human owner's dashboard session), or
 *   - a valid `X-API-Key` header (programmatic / n8n / Zapier clients).
 *
 * The session cookie is checked first, so a logged-in dashboard request (which
 * sends both the cookie and an API key) resolves to `session`. The chosen path
 * is recorded on the context as `authType` so routes can require the owner.
 *
 * If neither is present → 401. If either is present but invalid → 401/403
 * matching the documented envelope. Static PDF files and the health endpoint
 * are mounted outside this middleware and remain publicly accessible.
 */
export const apiKeyAuth: MiddlewareHandler = async (c, next) => {
  // 1) Session cookie path (the human owner via the dashboard)
  const sid = readSessionCookie(c.req.header("cookie"));
  if (sid && getValidSession(sid)) {
    c.set("authType", "session");
    await next();
    return;
  }
  // 2) API key path (programmatic clients — AI agents, n8n, Zapier)
  const provided = c.req.header("X-API-Key");
  if (!provided) throw unauthorized();
  if (!verifyApiKey(provided)) throw forbidden();
  c.set("authType", "apikey");
  await next();
};

/**
 * Guard for actions only the human owner may perform — creating and editing
 * base resumes (which fix the template and structure), and managing API keys.
 * API-key clients can read bases and create/tailor child resumes, but never
 * mutate the base itself. Runs after `apiKeyAuth`, so `authType` is always set.
 */
export const ownerOnly: MiddlewareHandler = async (c, next) => {
  if (c.get("authType") !== "session") {
    throw forbidden("This action requires the owner dashboard session", "owner_only");
  }
  await next();
};
