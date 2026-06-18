import { baseRepo } from "../db/repo.ts";
import { badRequest } from "../lib/errors.ts";
import { log } from "../lib/log.ts";
import { type MergedDoc } from "../mapper/index.ts";
import { mergeResume } from "../pipeline/merge.ts";
import { normalizePayload } from "../pipeline/normalize.ts";
import { renderToPdf } from "../render/index.ts";
import { templateRegistry } from "../templates/registry.ts";
import type { Overrides } from "../types/overrides.ts";

/**
 * Preview service — renders a document to PDF without persisting anything.
 * Two request shapes are accepted:
 *   - child resume `{ base_id, template?, overrides?, ... }` → merged on top of the
 *     stored base via the SAME pipeline as createResume, so the preview is
 *     byte-identical to what saving would produce;
 *   - full base document `{ template, profile, experience, ... }` → rendered as-is
 *     (used by the base-create live preview).
 */
export async function previewFromData(data: unknown): Promise<{ pdf: Uint8Array; warnings: string[] }> {
  const doc = (data ?? {}) as Record<string, unknown>;
  if (typeof doc.base_id === "string" && doc.base_id.trim()) {
    return previewChild(doc);
  }
  return previewFullDocument(doc);
}

/** Child preview: merge overrides onto the stored base, then render (no persist). */
async function previewChild(doc: Record<string, unknown>): Promise<{ pdf: Uint8Array; warnings: string[] }> {
  const normalized = normalizePayload(doc) as Record<string, unknown>;
  const baseId = String(normalized.base_id);
  const base = baseRepo.get(baseId);
  if (!base) {
    throw badRequest(`Base resume '${baseId}' not found`, "base_not_found", "base_id");
  }

  // Children always inherit the base template (same rule as createResume's
  // resolveTemplate) — a requested override is ignored.
  const templateId = base.template;
  const template = templateRegistry.get(templateId);
  if (!template) {
    throw badRequest(`template '${templateId}' not found`, "template_not_found", "template");
  }

  const overrides = (normalized.overrides ?? {}) as Overrides;
  const merged = mergeResume(base.data, overrides);

  try {
    const { pdf, warnings } = await renderToPdf(template, merged);
    log.debug("Child preview rendered", { base: baseId, template: templateId, bytes: pdf.byteLength });
    return { pdf, warnings };
  } catch (err) {
    log.error("Child preview render failed", { error: String(err) });
    throw badRequest(`Failed to render preview: ${err}`, "render_failed");
  }
}

/**
 * Build a render-ready MergedDoc from arbitrary KB-shaped data, applying the
 * same lenient defaults the live editor relies on (no schema validation, so a
 * half-typed document still previews). Every section a template can render must
 * be carried through here — anything omitted silently never reaches the mapper.
 */
/** Content section ids whose YAML block order defines the render order. */
const SECTION_KEYS = [
  "experience",
  "education",
  "skills",
  "projects",
  "certifications",
  "extracurriculars",
  "languages",
  "awards",
  "custom",
] as const;

export function buildPreviewDoc(doc: Record<string, unknown>, templateId: string): MergedDoc {
  const profileData = (doc.profile || {}) as Record<string, string>;

  // The order the section blocks appear in the (unvalidated) YAML defines the
  // render order — key order is preserved here since this path skips Zod. An
  // explicit `section_order` the author typed wins over the inferred order. The
  // mapper reconciles this against the template order (header stays pinned).
  const sectionOrder = Array.isArray(doc.section_order)
    ? (doc.section_order as string[])
    : Object.keys(doc).filter((k) => (SECTION_KEYS as readonly string[]).includes(k));

  return {
    id: (doc.id as string) || "preview",
    template: templateId,
    template_lock: false,
    profile: {
      name: profileData.name || "",
      title: profileData.title || "",
      email: profileData.email || "",
      phone: profileData.phone,
      location: profileData.location,
      summary: profileData.summary,
      links: (profileData.links as unknown as Record<string, string>) || (doc.links as Record<string, string>) || {},
    },
    experience: (doc.experience as MergedDoc["experience"]) || [],
    education: (doc.education as MergedDoc["education"]) || [],
    skills: (doc.skills as MergedDoc["skills"]) || [],
    projects: (doc.projects as MergedDoc["projects"]) || [],
    certifications: (doc.certifications as MergedDoc["certifications"]) || [],
    extracurriculars: (doc.extracurriculars as MergedDoc["extracurriculars"]) || [],
    awards: (doc.awards as MergedDoc["awards"]) || [],
    languages: (doc.languages as MergedDoc["languages"]) || [],
    custom: (doc.custom as MergedDoc["custom"]) || [],
    ...(sectionOrder.length ? { section_order: sectionOrder } : {}),
  };
}

/** Full-document preview (base-create): render arbitrary KB-shaped data directly. */
async function previewFullDocument(doc: Record<string, unknown>): Promise<{ pdf: Uint8Array; warnings: string[] }> {
  const templateId = doc.template as string;
  if (!templateId) {
    throw badRequest("template is required", "template_required", "template");
  }

  const template = templateRegistry.get(templateId);
  if (!template) {
    throw badRequest(`template '${templateId}' not found`, "template_not_found", "template");
  }

  const merged = buildPreviewDoc(doc, templateId);

  try {
    const { pdf, warnings } = await renderToPdf(template, merged);
    log.debug("Preview rendered", { template: templateId, bytes: pdf.byteLength });
    return { pdf, warnings };
  } catch (err) {
    log.error("Preview render failed", { error: String(err) });
    throw badRequest(`Failed to render preview: ${err}`, "render_failed");
  }
}
