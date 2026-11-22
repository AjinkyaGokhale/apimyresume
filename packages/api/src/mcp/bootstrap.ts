import os from "node:os";
import path from "node:path";

/**
 * Side-effect module for the stdio MCP server. MUST be the first import of
 * `stdio.ts`: ES modules evaluate in import order, so this runs before
 * `config.ts` reads the environment.
 *
 * 1. stdout carries the JSON-RPC stream, so every console line goes to stderr.
 * 2. Inside a Claude Code plugin, default the data and asset paths to the
 *    plugin's persistent data dir and its bundled templates. Explicit env vars
 *    still win.
 */

const toStderr = (...args: unknown[]) => console.error(...args);
console.log = toStderr;
console.info = toStderr;
console.debug = toStderr;

function setDefault(name: string, value: string | undefined): void {
  if (value && !process.env[name]?.trim()) process.env[name] = value;
}

const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
const pluginData = process.env.CLAUDE_PLUGIN_DATA;

if (pluginRoot) {
  setDefault("DATA_DIR", pluginData ?? path.join(os.homedir(), ".apimyresume"));
  setDefault("TEMPLATES_DIR", path.join(pluginRoot, "templates"));
  setDefault("TYPST_FONT_PATHS", path.join(pluginRoot, "fonts"));
  setDefault("NODE_ENV", "production");
}
// One compiler is plenty for a single local user and keeps memory low.
setDefault("RENDER_WORKERS", "1");
