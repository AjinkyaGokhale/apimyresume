import path, { join } from "node:path";
import { readFileSync } from "node:fs";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { secureHeaders } from "hono/secure-headers";
import { ZodError } from "zod";
import { config } from "../config.ts";
import { isSecureRequest } from "../lib/auth.ts";
import { AppError } from "../lib/errors.ts";
import { log } from "../lib/log.ts";
import { apiKeyAuth } from "./middleware/auth.ts";
import { rateLimit } from "./middleware/ratelimit.ts";
import { loginRateLimit } from "./middleware/loginlimit.ts";
import { bases } from "./routes/bases.ts";
import { resumes } from "./routes/resumes.ts";
import { templates } from "./routes/templates.ts";
import { misc } from "./routes/misc.ts";
import { apiKeysRouter } from "./routes/apikeys.ts";
import { authRouter } from "./routes/auth.ts";

/**
 * Hono application (spec §1, §18, §19). Wires the v1 API behind API-key auth
 * (or session-cookie auth for the dashboard) and per-key rate limiting, serves
 * PDFs publicly, and maps every thrown error to the consistent envelope.
 */

/** Paths reachable without auth (spec §18). */
function isPublic(method: string, p: string): boolean {
  if (p.startsWith("/pdfs/")) return true;
  if (p === "/api/v1/auth/state") return true;
  // Login / setup / logout endpoints are POST and must be reachable without
  // an existing session — otherwise no one could ever authenticate.
  if (p === "/api/v1/auth/setup" && method === "POST") return true;
  if (p === "/api/v1/auth/login" && method === "POST") return true;
  if (p === "/api/v1/auth/logout" && method === "POST") return true;
  if (method !== "GET") return false;
  if (p === "/api/v1/health" || p === "/api/v1/schema") return true;
  if (/^\/api\/v1\/templates\/[^/]+\/thumbnail$/.test(p)) return true;
  // Rendered resume thumbnail (SVG) — embedded as <img> in the dashboard.
  if (/^\/api\/v1\/resumes\/[^/]+\/thumbnail\.svg$/.test(p)) return true;
  // Rendered base-resume thumbnail (SVG) — folder preview in the dashboard.
  if (/^\/api\/v1\/bases\/[^/]+\/thumbnail\.svg$/.test(p)) return true;
  return false;
}

export function createApp() {
  const app = new Hono();

  // --- Baseline security headers (safe behind a proxy or direct). HSTS is only
  // emitted on HTTPS so plain-HTTP local installs aren't pinned to TLS. ---
  app.use("*", (c, next) =>
    secureHeaders({
      strictTransportSecurity: isSecureRequest(c.req.url, c.req.header("x-forwarded-proto"))
        ? "max-age=31536000; includeSubDomains"
        : false,
      // The dashboard is a same-origin SPA; deny framing to prevent clickjacking.
      xFrameOptions: "DENY",
    })(c, next),
  );

  // --- CORS. The bundled dashboard is same-origin and needs no entry; this is
  // for external browser clients only (configure via ALLOWED_ORIGINS). ---
  app.use("*", cors({
    origin: config.allowedOrigins,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "X-API-Key", "Authorization"],
    credentials: true,
  }));

  // --- Public static PDF serving (spec §18: no auth for PDF files). ---
  app.get("/pdfs/:file", async (c) => {
    const file = c.req.param("file");
    // Guard against path traversal — only a bare filename is allowed.
    if (file.includes("/") || file.includes("..")) return c.notFound();
    const f = Bun.file(path.join(config.pdfDir, file));
    if (!(await f.exists())) return c.notFound();
    c.header("Content-Type", "application/pdf");
    return c.body(await f.arrayBuffer());
  });

  // --- Brute-force throttle on the public owner login/setup endpoints. These
  // bypass the per-key limiter below, so they get their own IP-based limiter. ---
  app.use("/api/v1/auth/login", loginRateLimit);
  app.use("/api/v1/auth/setup", loginRateLimit);

  // --- Auth + rate limit for everything except public paths. ---
  app.use("/api/v1/*", async (c, next) => {
    if (isPublic(c.req.method, c.req.path)) {
      await next();
      return;
    }
    await apiKeyAuth(c, async () => {
      await rateLimit(c, next);
    });
  });

  const v1 = new Hono();
  v1.route("/", misc);
  v1.route("/auth", authRouter);
  v1.route("/templates", templates);
  v1.route("/bases", bases);
  v1.route("/resumes", resumes);
  v1.route("/api-keys", apiKeysRouter);
  app.route("/api/v1", v1);

  // --- Dashboard static file serving ---
  app.use("/_app/*", serveStatic({ root: config.dashboardDir }));
  app.use("/favicon*", serveStatic({ root: config.dashboardDir }));
  // Static assets copied verbatim from the dashboard's `static/` dir (logo, etc.).
  app.use("/logo/*", serveStatic({ root: config.dashboardDir }));

  // SPA fallback: serve index.html with bootstrapped config for all non-API routes
  app.get("*", async (c) => {
    const p = c.req.path;
    if (p.startsWith("/api/") || p.startsWith("/pdfs/")) return c.notFound();

    let html: string;
    try {
      html = readFileSync(join(config.dashboardDir, "index.html"), "utf-8");
    } catch {
      return c.text("Dashboard not built. Run `bun run build` in the dashboard directory.", 503);
    }

    const bootstrap = `<script>window.__BOOTSTRAP__=${JSON.stringify({ apiKey: "", apiUrl: "" })}</script>`;
    const injected = html.replace("</head>", `${bootstrap}</head>`);
    return c.html(injected);
  });

  // --- Central error handler → consistent envelope (spec §19). ---
  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json(err.toEnvelope(), err.status);
    }
    if (err instanceof ZodError) {
      const errors = err.issues.map((i) => ({
        field: i.path.join(".") || "(root)",
        expected: i.code,
      }));
      return c.json({ error: "Validation failed", code: "validation_error", errors }, 422);
    }
    log.error("Unhandled error", { error: String(err), stack: (err as Error).stack });
    return c.json({ error: "Internal server error", code: "internal_error" }, 500);
  });

  app.notFound((c) => c.json({ error: "Not found", code: "not_found" }, 404));

  return app;
}
