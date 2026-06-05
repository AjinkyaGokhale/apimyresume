import { Hono } from "hono";
import { rotateApiKey } from "../../lib/apikey.ts";
import { workerPool } from "../../render/index.ts";
import { buildSchemaDocument } from "../../services/schema.ts";

/** Health, schema discovery and key rotation (spec §9, §17, §18). */
export const misc = new Hono();

// Public status report — returns 200 even when degraded (spec §19).
misc.get("/health", (c) => c.json({ ...workerPool.health(), uptime: process.uptime() }));

misc.get("/schema", (c) => c.json(buildSchemaDocument()));

misc.post("/auth/rotate-key", (c) => c.json({ api_key: rotateApiKey() }));
