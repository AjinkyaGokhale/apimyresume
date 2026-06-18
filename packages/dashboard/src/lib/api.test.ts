import { describe, it, expect, afterEach, beforeEach } from "bun:test";

// api.ts reads window.* at call time; provide a minimal stub before importing.
// __BOOTSTRAP__ is defined so getApiUrl/getApiKey never touch import.meta.env.
(globalThis as unknown as { window: unknown }).window = {
  __BOOTSTRAP__: { apiKey: "", apiUrl: "http://api.test" },
  location: { origin: "http://api.test" },
};

const {
  listTemplates,
  createBase,
  getTemplates,
  primeTemplates,
  clearTemplatesCache,
  ApiError,
  ApiUnreachable,
} = await import("./api.ts");

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("api() transient-failure retry", () => {
  it("retries an idempotent GET after a network blip, then succeeds", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      if (calls === 1) throw new TypeError("Failed to fetch");
      return jsonResponse([{ id: "basic-resume" }]);
    }) as typeof fetch;

    const result = await listTemplates();
    expect(calls).toBe(2);
    expect(result).toEqual([{ id: "basic-resume" }] as never);
  });

  it("retries a GET on a 503 gateway error, then succeeds", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      if (calls === 1) return jsonResponse({ error: "unavailable" }, 503);
      return jsonResponse([]);
    }) as typeof fetch;

    await listTemplates();
    expect(calls).toBe(2);
  });

  it("does NOT retry a GET on 401 — auth failure is not transient", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return jsonResponse({ error: "Unauthorized" }, 401);
    }) as typeof fetch;

    await expect(listTemplates()).rejects.toBeInstanceOf(ApiError);
    expect(calls).toBe(1);
  });

  it("does NOT retry a mutating POST after a network failure", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;

    await expect(createBase({})).rejects.toBeInstanceOf(ApiUnreachable);
    expect(calls).toBe(1);
  });

  it("gives up and throws after exhausting GET retries", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;

    await expect(listTemplates()).rejects.toBeInstanceOf(ApiUnreachable);
    expect(calls).toBe(3); // 1 initial + 2 retries
  });
});

describe("getTemplates() session cache", () => {
  beforeEach(() => clearTemplatesCache());

  it("fetches once, then serves repeat calls from cache without re-requesting", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return jsonResponse([{ id: "basic-resume" }]);
    }) as typeof fetch;

    const a = await getTemplates();
    const b = await getTemplates();
    expect(calls).toBe(1);
    expect(b).toBe(a); // same cached array reference
  });

  it("force-refreshes when asked", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return jsonResponse([{ id: `t${calls}` }]);
    }) as typeof fetch;

    await getTemplates(); // cached above; this run starts fresh because we refetch
    await getTemplates(true);
    expect(calls).toBe(2);
  });

  it("primeTemplates() warms the cache and swallows failures", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;

    // Must not throw even though every fetch fails.
    primeTemplates();
    // Give the fire-and-forget prime time to exhaust its retries.
    await new Promise((r) => setTimeout(r, 600));
    expect(calls).toBeGreaterThanOrEqual(1);
  });
});
