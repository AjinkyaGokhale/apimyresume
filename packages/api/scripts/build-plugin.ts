/**
 * Build the Claude Code plugin in `<repo>/plugin`: bundle the stdio MCP server
 * into one file and copy the shipped templates next to it. A git-installed
 * plugin only receives the `plugin/` directory, so both outputs are committed.
 *
 *   bun run build:plugin
 */
import { cpSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const apiDir = path.resolve(import.meta.dir, "..");
const repoRoot = path.resolve(apiDir, "../..");
const pluginDir = path.join(repoRoot, "plugin");
const TYPST = "@myriaddreamin/typst-ts-node-compiler";

// The native compiler is installed by Claude Code from plugin/package.json, so
// its version must match the one the server was built and tested against.
const apiPkg = await Bun.file(path.join(apiDir, "package.json")).json();
const pluginPkg = await Bun.file(path.join(pluginDir, "package.json")).json();
if (apiPkg.dependencies[TYPST] !== pluginPkg.dependencies[TYPST]) {
  throw new Error(`${TYPST} differs: api ${apiPkg.dependencies[TYPST]} vs plugin ${pluginPkg.dependencies[TYPST]}`);
}

// 1. Server bundle. Everything is inlined except the native compiler.
const outDir = path.join(pluginDir, "server");
rmSync(outDir, { recursive: true, force: true });
const result = await Bun.build({
  entrypoints: [path.join(apiDir, "src/mcp/stdio.ts")],
  outdir: outDir,
  naming: "server.js",
  target: "bun",
  external: [TYPST],
});
if (!result.success) {
  for (const msg of result.logs) console.error(msg);
  process.exit(1);
}

// 2. Templates: files git would ship (tracked or new, never ignored), so
//    local-only vendor copies stay out.
const tplOut = path.join(pluginDir, "templates");
rmSync(tplOut, { recursive: true, force: true });
const tracked = Bun.spawnSync(["git", "ls-files", "--cached", "--others", "--exclude-standard", "templates"], { cwd: repoRoot }).stdout.toString();
const files = tracked.split("\n").filter(Boolean);
for (const rel of files) {
  const dest = path.join(pluginDir, rel);
  mkdirSync(path.dirname(dest), { recursive: true });
  cpSync(path.join(repoRoot, rel), dest);
}

const kb = (result.outputs[0]!.size / 1024).toFixed(0);
console.log(`plugin/server/server.js (${kb} KB), ${files.length} template files`);
