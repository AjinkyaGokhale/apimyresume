import { config } from "./config.ts";
import { log } from "./lib/log.ts";
import { loadApiKey } from "./lib/apikey.ts";
import { purgeExpiredSessions } from "./lib/auth.ts";
import { migrate } from "./db/migrate.ts";
import { templateRegistry } from "./templates/registry.ts";
import { workerPool } from "./render/index.ts";
import { getStorage } from "./storage/index.ts";
import { createApp } from "./api/app.ts";

/**
 * API service entry point. Boots every subsystem in dependency order, then
 * serves the Hono app (spec §1, §20).
 */
function boot() {
  log.info("Starting APIMyResume", { env: config.nodeEnv, port: config.port });

  loadApiKey(); // generate + persist on first start, then log once
  migrate(); // create tables + FTS index
  purgeExpiredSessions(); // drop stale dashboard sessions
  getStorage(); // instantiate storage driver once
  templateRegistry.load(); // scan /templates
  templateRegistry.startWatching(); // hot-reload in development
  workerPool.init(); // spin up NodeCompiler instances

  const app = createApp();

  const server = Bun.serve({
    port: config.port,
    // Generous idle timeout for slow renders behind the queue.
    idleTimeout: 60,
    // Hard cap on request body size — rejects oversized uploads at the server
    // before they reach a handler. readBody() returns a friendly 413 envelope
    // for the common case; this backstops streamed/chunked bodies.
    maxRequestBodySize: config.maxBodyBytes,
    fetch: app.fetch,
  });
  log.info(`API listening on http://localhost:${server.port}`);
  return server;
}

boot();
