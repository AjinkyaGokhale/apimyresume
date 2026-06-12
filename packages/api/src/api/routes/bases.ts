import { Hono } from "hono";
import YAML from "yaml";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { readBody } from "../body.ts";
import { baseDto } from "../dto.ts";
import { ownerOnly } from "../middleware/auth.ts";
import {
  createBase,
  deleteBase,
  getBase,
  listBases,
  regenerateChildren,
  updateBase,
  updateExperienceBullets,
} from "../../services/base.ts";
import { baseThumbnail } from "../../services/resume.ts";

/** Base resume routes (spec §3). */
export const bases = new Hono();

bases.get("/", (c) => c.json(listBases()));

bases.post("/", ownerOnly, async (c) => {
  const base = createBase(await readBody(c));
  return c.json(baseDto(base), 201);
});

bases.get("/:id", (c) => c.json(baseDto(getBase(c.req.param("id")))));

// Public (no API key) — the rendered base resume itself, used as the folder preview.
bases.get("/:id/thumbnail.svg", async (c) => {
  const svg = await baseThumbnail(c.req.param("id"));
  c.header("Content-Type", "image/svg+xml");
  c.header("Cache-Control", "public, max-age=300");
  return c.body(svg);
});

bases.patch("/:id", ownerOnly, async (c) => {
  const updated = updateBase(c.req.param("id"), await readBody(c));
  return c.json(baseDto(updated!));
});

bases.delete("/:id", ownerOnly, async (c) => {
  const cascade = c.req.query("cascade") === "true";
  await deleteBase(c.req.param("id"), { cascade });
  return c.body(null, 204);
});

/**
 * AI-optimised content read. Returns only the mutable sections (experience, skills,
 * profile summary) plus a `_instructions` block describing the exact PATCH format.
 * Designed to be dropped directly into an n8n AI Agent system prompt.
 */
bases.get("/:id/content", (c) => {
  const base = getBase(c.req.param("id"));
  const d = base.data;
  return c.json({
    id: base.id,
    name: base.name,
    _instructions: {
      update_url: `/api/v1/bases/${base.id}`,
      update_method: "PATCH",
      update_note: "Send only the sections you want to replace. Arrays are fully replaced — never appended. Preserve all existing array items you do not intend to remove.",
      bullet_url: `/api/v1/bases/${base.id}/experience/{entryId}/bullets`,
      bullet_method: "PATCH",
      bullet_note: "Send a JSON array of strings to replace bullets for one experience entry only. Use the entry's `id` field in the URL.",
      format: {
        skills: [{ category: "string", items: ["string"] }],
        experience: [{ id: "string (required — preserve as-is)", company: "string", role: "string", period: "string", bullets: ["string"] }],
      },
    },
    profile: {
      name: d.profile.name,
      title: d.profile.title,
      summary: d.profile.summary ?? null,
    },
    experience: d.experience.map((e) => ({
      id: e.id,
      company: e.company,
      role: e.role,
      period: e.period,
      bullets: e.bullets,
    })),
    skills: d.skills,
  });
});

/**
 * Replace bullets for a single experience entry by its stable `id`.
 * Safer than PATCHing the full experience array when only one job needs updating.
 * Body: string[] — the complete new bullet list for this entry.
 */
bases.patch(
  "/:id/experience/:entryId/bullets",
  ownerOnly,
  zValidator("json", z.array(z.string().min(1)).min(1)),
  async (c) => {
    const bullets = c.req.valid("json");
    const updated = updateExperienceBullets(c.req.param("id"), c.req.param("entryId"), bullets);
    return c.json(baseDto(updated));
  },
);

bases.get("/:id/export", (c) => {
  const base = getBase(c.req.param("id"));
  c.header("Content-Type", "application/yaml");
  c.header("Content-Disposition", `attachment; filename="${base.id}.yaml"`);
  return c.body(YAML.stringify(base.data));
});

bases.post("/:id/regenerate-children", ownerOnly, async (c) => {
  const results = await regenerateChildren(c.req.param("id"));
  return c.json({ regenerated: results.length, children: results });
});
