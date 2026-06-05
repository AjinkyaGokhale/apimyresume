import path from "node:path";
import { Hono } from "hono";
import { notFound } from "../../lib/errors.ts";
import { templateRegistry } from "../../templates/registry.ts";

/** Template registry routes (spec §4). */
export const templates = new Hono();

templates.get("/", (c) => c.json(templateRegistry.summaries()));

templates.get("/:id/map", (c) => {
  const tpl = templateRegistry.require(c.req.param("id"));
  return c.json(tpl.map);
});

// Public (no API key) — thumbnails are embedded in the dashboard/onboarding UI.
templates.get("/:id/thumbnail", async (c) => {
  const tpl = templateRegistry.require(c.req.param("id"));
  const file = Bun.file(path.join(tpl.dir, "thumbnail.png"));
  if (!(await file.exists())) {
    throw notFound(`Thumbnail for template '${tpl.id}' not found`, "thumbnail_not_found");
  }
  c.header("Content-Type", "image/png");
  return c.body(await file.arrayBuffer());
});
