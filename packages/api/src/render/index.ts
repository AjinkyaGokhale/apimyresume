import { mapContext, serializeContext, type MergedDoc } from "../mapper/index.ts";
import type { RegisteredTemplate } from "../templates/types.ts";
import { workerPool } from "./pool.ts";
import type { RenderOutput } from "./worker.ts";

export { workerPool } from "./pool.ts";
export type { HealthStats } from "./pool.ts";
export type { RenderOutput } from "./worker.ts";

/**
 * Render a merged KB document to a PDF buffer (spec §8). Runs the field mapper,
 * serialises the context to a JSON string for sys.inputs.resume, and dispatches
 * to the worker pool. Fully in-memory — nothing is written to disk here.
 */
export async function renderToPdf(
  template: RegisteredTemplate,
  merged: MergedDoc,
): Promise<{ pdf: Uint8Array; warnings: string[] }> {
  const out = await dispatch(template, merged, "pdf");
  if (!out.pdf) throw new Error("Render produced no PDF buffer");
  return { pdf: out.pdf, warnings: out.warnings };
}

/** Render a merged document to a static SVG (used for card thumbnails). */
export async function renderToSvg(template: RegisteredTemplate, merged: MergedDoc): Promise<string> {
  const out = await dispatch(template, merged, "svg");
  if (!out.svg) throw new Error("Render produced no SVG");
  return out.svg;
}

function dispatch(
  template: RegisteredTemplate,
  merged: MergedDoc,
  format: "pdf" | "svg",
): Promise<RenderOutput> {
  const ctx = mapContext(merged, template.map);
  const resumeJson = serializeContext(ctx);
  return workerPool.render({
    templateId: template.id,
    source: template.source,
    resumeJson,
    format,
  });
}
