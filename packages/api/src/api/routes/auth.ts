import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { badRequest, conflict, unauthorized } from "../../lib/errors.ts";
import {
  createOwner,
  createSession,
  deleteOtherSessions,
  deleteSession,
  DUMMY_PASSWORD_HASH,
  findUserByUsername,
  getUser,
  getValidSession,
  hasOwner,
  isSecureRequest,
  readSessionCookie,
  sessionCookie,
  clearSessionCookie,
  updateUserPassword,
  verifyPassword,
} from "../../lib/auth.ts";

/**
 * Owner authentication (setup, login, logout, me, state).
 *  - GET  /auth/state  — public. Tells the dashboard whether to show /setup or /login.
 *  - POST /auth/setup  — public. 409 if an owner already exists. Creates the owner + session.
 *  - POST /auth/login  — public. Sets the session cookie.
 *  - POST /auth/logout — public. Clears the session cookie.
 *  - GET  /auth/me     — session-only. Returns the current owner.
 *
 * Sessions are httpOnly cookies. Programmatic clients continue to use X-API-Key
 * against /api/v1/* — see middleware/auth.ts.
 */
export const authRouter = new Hono();

const credsSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(40, "Username must be at most 40 characters")
    .regex(/^[a-zA-Z0-9_.-]+$/, "Username may only contain letters, digits, _ . -"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1, "Current password is required").max(200),
  new_password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

function setSessionCookie(c: Context, sid: string): void {
  c.header(
    "Set-Cookie",
    sessionCookie(sid, {
      secure: isSecureRequest(c.req.url, c.req.header("x-forwarded-proto")),
    }),
  );
}

function clearCookie(c: Context): void {
  c.header(
    "Set-Cookie",
    clearSessionCookie({
      secure: isSecureRequest(c.req.url, c.req.header("x-forwarded-proto")),
    }),
  );
}

authRouter.get("/state", (c) => {
  const sid = readSessionCookie(c.req.header("cookie"));
  const authenticated = Boolean(sid && getValidSession(sid));
  return c.json({ needs_setup: !hasOwner(), authenticated });
});

authRouter.post("/setup", zValidator("json", credsSchema), async (c) => {
  if (hasOwner()) throw conflict("Owner account already exists", "owner_exists");

  const { username, password } = c.req.valid("json");
  const user = await createOwner(username, password);
  const session = createSession(user.id);

  setSessionCookie(c, session.id);
  return c.json({ username: user.username }, 201);
});

authRouter.post("/login", zValidator("json", credsSchema), async (c) => {
  if (!hasOwner()) throw conflict("Owner has not been set up yet", "needs_setup");
  const { username, password } = c.req.valid("json");
  const user = findUserByUsername(username);
  // Always run a scrypt verification — against the real hash if the user exists,
  // otherwise a dummy — so the response time doesn't reveal whether the username
  // is valid (user enumeration). The result for the dummy is always false.
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !ok) {
    throw unauthorized("Invalid username or password", "invalid_credentials");
  }
  const session = createSession(user.id);
  setSessionCookie(c, session.id);
  return c.json({ username: user.username });
});

authRouter.post("/logout", (c) => {
  const sid = readSessionCookie(c.req.header("cookie"));
  deleteSession(sid ?? "");
  clearCookie(c);
  return c.body(null, 204);
});

authRouter.get("/me", (c) => {
  const sid = readSessionCookie(c.req.header("cookie"));
  const session = sid ? getValidSession(sid) : undefined;
  if (!session) throw unauthorized("Not signed in", "not_authenticated");
  const user = getUser(session.userId);
  if (!user) throw unauthorized("Not signed in", "not_authenticated");
  return c.json({ username: user.username });
});

// POST /auth/change-password — session-only. Changes the signed-in owner's
// password after verifying the current one. Other sessions are revoked; the
// caller's own session stays valid so the dashboard isn't logged out.
authRouter.post("/change-password", zValidator("json", changePasswordSchema), async (c) => {
  const sid = readSessionCookie(c.req.header("cookie"));
  const session = sid ? getValidSession(sid) : undefined;
  if (!session) throw unauthorized("Not signed in", "not_authenticated");
  const user = getUser(session.userId);
  if (!user) throw unauthorized("Not signed in", "not_authenticated");

  const { current_password, new_password } = c.req.valid("json");
  if (!(await verifyPassword(current_password, user.passwordHash))) {
    throw unauthorized("Current password is incorrect", "invalid_credentials");
  }
  if (await verifyPassword(new_password, user.passwordHash)) {
    throw badRequest("New password must be different from the current one", "password_unchanged");
  }

  await updateUserPassword(user.id, new_password);
  deleteOtherSessions(user.id, session.id);
  return c.body(null, 204);
});
