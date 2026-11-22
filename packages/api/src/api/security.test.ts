import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Black-box security-boundary regression tests. Spawns the real server against a
 * throwaway data dir and asserts the auth/authorization contract end-to-end:
 *
 *   - every /api/v1/* route requires auth (401 without credentials);
 *   - owner-only routes reject API keys with 403 (api-keys management, base
 *     mutations, key rotation);
 *   - API keys CAN read bases/resumes and tailor children;
 *   - oversized request bodies are rejected (413);
 *   - the documented public routes stay reachable.
 *
 * These lock the findings from the endpoint security audit so a future refactor
 * can't silently reopen them.
 */

const PORT = 3900 + Math.floor(Math.random() * 80);
const BASE = `http://localhost:${PORT}/api/v1`;
const PASSWORD = "supersecret123";

let proc: Bun.Subprocess;
let dataDir: string;
let sessionCookie: string;
let apiKey: string;

/** Extract the amr_session cookie value from a Set-Cookie header. */
function sessionFrom(res: Response): string {
  const sc = res.headers.get("set-cookie") ?? "";
  const m = sc.match(/amr_session=[^;]+/);
  if (!m) throw new Error(`no session cookie in response: ${sc}`);
  return m[0];
}

const status = (res: Response) => res.status;

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "amr-sec-"));
  proc = Bun.spawn(["bun", "run", "src/index.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, LOG_LEVEL: "error" },
    stdout: "ignore",
    stderr: "ignore",
  });

  // Wait for the server to accept connections.
  const deadline = Date.now() + 20_000;
  for (;;) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error("server did not start in time");
    await Bun.sleep(200);
  }

  // Create the owner + session, then mint an API key via the session.
  const setup = await fetch(`${BASE}/auth/setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "owner", password: PASSWORD }),
  });
  expect(setup.status).toBe(201);
  sessionCookie = sessionFrom(setup);

  const mk = await fetch(`${BASE}/api-keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: sessionCookie },
    body: JSON.stringify({ name: "agent" }),
  });
  expect(mk.status).toBe(201);
  apiKey = ((await mk.json()) as { key: string }).key;
  expect(apiKey).toMatch(/^amr_live_/);
}, 30_000);

afterAll(() => {
  proc?.kill();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

const noAuth = (path: string, init: RequestInit = {}) => fetch(`${BASE}${path}`, init);
const withKey = (path: string, init: RequestInit = {}) =>
  fetch(`${BASE}${path}`, { ...init, headers: { ...(init.headers ?? {}), "X-API-Key": apiKey } });
const withSession = (path: string, init: RequestInit = {}) =>
  fetch(`${BASE}${path}`, { ...init, headers: { ...(init.headers ?? {}), cookie: sessionCookie } });

describe("unauthenticated access is rejected (401)", () => {
  for (const path of ["/bases", "/resumes", "/api-keys"]) {
    test(`GET ${path} → 401`, async () => {
      expect(status(await noAuth(path))).toBe(401);
    });
  }
});

describe("public routes stay reachable", () => {
  for (const path of ["/health", "/schema", "/auth/state"]) {
    test(`GET ${path} → 200`, async () => {
      expect(status(await noAuth(path))).toBe(200);
    });
  }
});

describe("API keys cannot manage API keys (owner-only → 403)", () => {
  test("GET /api-keys → 403", async () => {
    expect(status(await withKey("/api-keys"))).toBe(403);
  });
  test("POST /api-keys → 403", async () => {
    expect(
      status(
        await withKey("/api-keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "evil" }),
        }),
      ),
    ).toBe(403);
  });
  test("DELETE /api-keys/:id → 403", async () => {
    expect(status(await withKey("/api-keys/anything", { method: "DELETE" }))).toBe(403);
  });
});

describe("API keys cannot mutate bases or rotate the master key (owner-only → 403)", () => {
  test("POST /bases → 403", async () => {
    expect(
      status(
        await withKey("/bases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "x", template: "basic-resume" }),
        }),
      ),
    ).toBe(403);
  });
  test("PATCH /bases/:id → 403", async () => {
    expect(
      status(
        await withKey("/bases/anything", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skills: [] }),
        }),
      ),
    ).toBe(403);
  });
  test("DELETE /bases/:id → 403", async () => {
    expect(status(await withKey("/bases/anything", { method: "DELETE" }))).toBe(403);
  });
  test("POST /bases/:id/regenerate-children → 403", async () => {
    expect(status(await withKey("/bases/anything/regenerate-children", { method: "POST" }))).toBe(403);
  });
  test("POST /auth/rotate-key → 403", async () => {
    expect(status(await withKey("/auth/rotate-key", { method: "POST" }))).toBe(403);
  });

  test("PUT /bases/:id/cover-letter → 403", async () => {
    expect(
      status(
        await withKey("/bases/anything/cover-letter", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body: { intro: "x" } }),
        }),
      ),
    ).toBe(403);
  });

  test("DELETE /bases/:id/cover-letter → 403", async () => {
    expect(status(await withKey("/bases/anything/cover-letter", { method: "DELETE" }))).toBe(403);
  });
});

describe("the owner session retains full access", () => {
  test("GET /api-keys → 200", async () => {
    expect(status(await withSession("/api-keys"))).toBe(200);
  });
  test("POST /auth/rotate-key → 200", async () => {
    const res = await withSession("/auth/rotate-key", { method: "POST" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { api_key: string }).api_key).toMatch(/^amr_live_/);
  });
});

describe("API keys can read bases/resumes (read + tailor surface)", () => {
  test("GET /bases → 200", async () => {
    expect(status(await withKey("/bases"))).toBe(200);
  });
  test("GET /resumes → 200", async () => {
    expect(status(await withKey("/resumes"))).toBe(200);
  });
});

describe("oversized request bodies are rejected (413)", () => {
  test("POST /resumes with a >1MB body → 413", async () => {
    const body = JSON.stringify({ base_id: "x", company: "a".repeat(1_300_000) });
    const res = await withKey("/resumes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    expect(res.status).toBe(413);
  });
});

describe("non-numeric pagination params are tolerated", () => {
  test("GET /resumes?page=abc&limit=xyz → 200 with default pagination", async () => {
    const res = await withKey("/resumes?page=abc&limit=xyz");
    expect(res.status).toBe(200);
    const { pagination } = (await res.json()) as { pagination: { page: number; limit: number } };
    expect(pagination.page).toBe(1);
    expect(pagination.limit).toBe(20);
  });
});

describe("job tracker: agents create/update, only the owner deletes", () => {
  const json = (body: unknown, method = "POST"): RequestInit => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const job = { company: "Acme", role: "Backend Engineer", job_url: "https://acme.test/jobs/1", location: "Berlin" };
  let jobId: string;

  test("GET /jobs without auth → 401", async () => {
    expect(status(await noAuth("/jobs"))).toBe(401);
  });

  test("API key POST /jobs → 201, same job_url again → 200 with the same id", async () => {
    const first = await withKey("/jobs", json(job));
    expect(first.status).toBe(201);
    jobId = ((await first.json()) as { id: string }).id;

    const again = await withKey("/jobs", json({ ...job, notes: "re-posted" }));
    expect(again.status).toBe(200);
    const body = (await again.json()) as { id: string; notes: string };
    expect(body.id).toBe(jobId);
    expect(body.notes).toBe("re-posted");
  });

  test("PATCH status records history and stamps applied_at", async () => {
    expect(status(await withKey(`/jobs/${jobId}`, json({ status: "applied" }, "PATCH")))).toBe(200);
    const res = await withKey(`/jobs/${jobId}`);
    const body = (await res.json()) as { applied_at: string | null; events: Array<{ to_status: string }> };
    expect(body.applied_at).not.toBeNull();
    expect(body.events.map((e) => e.to_status)).toEqual(["applied", "saved"]);
  });

  test("invalid body → 422", async () => {
    expect(status(await withKey("/jobs", json({ ...job, job_url: "javascript:alert(1)" })))).toBe(422);
    expect(status(await withKey("/jobs", json({ ...job, status: "hired" })))).toBe(422);
  });

  test("unknown sort column falls back to the default → 200", async () => {
    expect(status(await withKey("/jobs?sort=;drop&order=sideways"))).toBe(200);
  });

  test("GET /jobs/stats counts the filtered jobs", async () => {
    const res = await withKey("/jobs/stats?location=berlin");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { total: number; by_status: Record<string, number> };
    expect(body.total).toBe(1);
    expect(body.by_status.applied).toBe(1);
  });

  test("API key DELETE /jobs/:id → 403, owner session → 204", async () => {
    expect(status(await withKey(`/jobs/${jobId}`, { method: "DELETE" }))).toBe(403);
    expect(status(await withSession(`/jobs/${jobId}`, { method: "DELETE" }))).toBe(204);
  });
});
