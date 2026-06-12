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
  // Thumbnails are a snapshot of the first page only, regardless of how many
  // pages the resume spans.
  return firstPageOnly(out.svg);
}

/**
 * Crop a rich Typst SVG to its first page. The `svg()` export stacks every page
 * vertically inside one root `<svg>` (viewBox height = sum of all pages); a
 * thumbnail should show only page one. We read the first `typst-page` group's
 * dimensions and shrink the root viewport to it, so the viewport clips the rest.
 *
 * Returns the input unchanged if the structure isn't recognised — defensive
 * against future changes to the `svg()` output format.
 */
export function firstPageOnly(svg: string): string {
  const page = svg.match(
    /<g class="typst-page"[^>]*\bdata-page-width="([\d.]+)"[^>]*\bdata-page-height="([\d.]+)"/,
  );
  if (!page) return svg;
  const [, w, h] = page;

  const end = svg.indexOf(">");
  if (end === -1) return svg;
  const head = svg
    .slice(0, end + 1)
    .replace(/viewBox="[^"]*"/, `viewBox="0 0 ${w} ${h}"`)
    .replace(/ width="[^"]*"/, ` width="${w}"`)
    .replace(/ height="[^"]*"/, ` height="${h}"`)
    .replace(/data-width="[^"]*"/, `data-width="${w}"`)
    .replace(/data-height="[^"]*"/, `data-height="${h}"`)
    // The root carries `overflow: visible`; force clipping so later pages that
    // sit below the first don't bleed past the cropped viewport.
    .replace(/overflow:\s*visible/, "overflow: hidden");

  return head + svg.slice(end + 1);
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
