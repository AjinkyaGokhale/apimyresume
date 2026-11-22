import "./bootstrap.ts"; // must stay first: stdout guard + plugin env defaults
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "../config.ts";
import { migrate } from "../db/migrate.ts";
import { log } from "../lib/log.ts";
import { workerPool } from "../render/index.ts";
import { getStorage } from "../storage/index.ts";
import { templateRegistry } from "../templates/registry.ts";
import { registerTools } from "./tools.ts";

/**
 * Local MCP server over stdio — the engine behind the Claude Code plugin. Runs
 * the whole app in-process (SQLite, Typst renderer) with no HTTP server and no
 * API key: the process belongs to the local user, who is the owner, so base
 * resumes are writable.
 */
async function main() {
  migrate();
  getStorage();
  templateRegistry.load();
  workerPool.init();

  const server = new McpServer({ name: "apimyresume", version: "1.4.0" });
  registerTools(server, { canWriteBases: true });
  await server.connect(new StdioServerTransport());
  log.info("MCP server ready (stdio)", { dataDir: config.dataDir });
}

main().catch((err) => {
  log.error("MCP server failed to start", { error: String(err) });
  process.exit(1);
});
