import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

/**
 * End-to-end test of the Claude Code plugin's engine: spawns the real stdio MCP
 * server against a throwaway data dir and drives it with the official client,
 * exactly as Claude Code does.
 */

const dataDir = mkdtempSync(path.join(os.tmpdir(), "amr-mcp-"));
const client = new Client({ name: "test", version: "1.0.0" });

beforeAll(async () => {
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [path.join(import.meta.dir, "stdio.ts")],
      env: { ...process.env, DATA_DIR: dataDir } as Record<string, string>,
      stderr: "ignore",
    }),
  );
}, 30_000);

afterAll(async () => {
  await client.close();
  rmSync(dataDir, { recursive: true, force: true });
});

async function call(name: string, args: Record<string, unknown> = {}) {
  const res = await client.callTool({ name, arguments: args });
  const text = (res.content as Array<{ type: string; text: string }>)[0]!.text;
  return { isError: res.isError === true, body: JSON.parse(text) };
}

const base = {
  id: "base-jane",
  template: "basic-resume",
  profile: { name: "Jane Doe", title: "Backend Engineer", email: "jane@example.com" },
  experience: [
    {
      id: "acme-2022",
      company: "Acme",
      role: "Backend Engineer",
      period: "2022 - Present",
      bullets: ["Built the billing API", "Cut p95 latency by 40%"],
    },
  ],
  skills: [{ category: "Languages", items: ["TypeScript", "Go"] }],
};

describe("stdio MCP server", () => {
  test("lists the plugin's tools, including base writes for the local owner", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const n of ["get_guide", "create_base", "update_base", "create_resume", "track_job", "job_stats"]) {
      expect(names).toContain(n);
    }
    expect(names.some((n) => n.startsWith("delete"))).toBe(false);
  });

  test("create base → tailored resume PDF → track and progress the job", async () => {
    const created = await call("create_base", { base });
    expect(created.isError).toBe(false);
    expect(created.body.id).toBe("base-jane");

    const resume = await call("create_resume", {
      base_id: "base-jane",
      meta: { company: "Globex", role: "Platform Engineer" },
      overrides: { skills_highlight: ["Go"] },
    });
    expect(resume.isError).toBe(false);
    expect(resume.body.company).toBe("Globex");
    expect(existsSync(resume.body.pdf_path)).toBe(true);
    expect(resume.body.pdf_path.startsWith(dataDir)).toBe(true);

    const job = await call("track_job", {
      company: "Globex",
      role: "Platform Engineer",
      job_url: "https://globex.example/jobs/1",
      status: "applied",
      resume_id: resume.body.id,
    });
    expect(job.body.created).toBe(true);
    expect(job.body.applied_at).toBeTruthy();

    // Same URL again updates the existing job instead of duplicating it.
    const again = await call("track_job", {
      company: "Globex",
      role: "Platform Engineer",
      job_url: "https://globex.example/jobs/1",
      location: "Berlin, DE",
    });
    expect(again.body.created).toBe(false);
    expect(again.body.id).toBe(job.body.id);

    const moved = await call("update_job", { job_id: job.body.id, status: "interviewing", status_note: "Tech screen" });
    expect(moved.body.status).toBe("interviewing");

    const detail = await call("get_job", { job_id: job.body.id });
    expect(detail.body.events.map((e: { to_status: string }) => e.to_status)).toEqual(["interviewing", "applied"]);

    const stats = await call("job_stats", { location: "Berlin" });
    expect(stats.body.total).toBe(1);
    expect(stats.body.funnel.interviewed).toBe(1);
  }, 60_000);

  test("service validation errors come back as tool errors with the envelope", async () => {
    const dup = await call("create_base", { base });
    expect(dup.isError).toBe(true);
    expect(dup.body.code).toBe("base_exists");

    const missing = await call("get_resume", { resume_id: "resume_nope" });
    expect(missing.isError).toBe(true);
    expect(missing.body.code).toBe("resume_not_found");
  });
});
