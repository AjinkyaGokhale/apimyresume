import { nanoid } from "nanoid";
import { baseRepo, resumeRepo } from "../db/repo.ts";
import type { ResumeRow } from "../db/schema.ts";
import { badRequest, notFound } from "../lib/errors.ts";
import { log } from "../lib/log.ts";
import { parseOrThrow } from "../lib/validation.ts";
import { mergeResume } from "../pipeline/merge.ts";
import { normalizePayload } from "../pipeline/normalize.ts";
import { renderToPdf, renderToSvg } from "../render/index.ts";
import { getStorage } from "../storage/index.ts";
import { templateRegistry } from "../templates/registry.ts";
import {
  createResumeSchema,
  updateResumeSchema,
  type CreateResume,
  type Overrides,
} from "../types/overrides.ts";

/**
 * Resume service (spec §6, §7, §8). Orchestrates the full create/update/render
 * pipeline: normalize → validate → resolve base + template → merge → render →
 * store (versioned) → persist. Child resumes store only the override diff.
 */

export interface ResumeResult {
  resume: ResumeRow;
  warnings: string[];
}

/** Resolve the effective template id, honouring base template_lock (spec §6). */
/**
 * Resolve which template a child resume renders with. Children always inherit
 * the base's template — the template is part of the base structure the human
 * owner fixes, and is never tailorable per child. A requested override is
 * ignored with a warning so AI agents can't switch templates.
 */
function resolveTemplate(
  requested: string | undefined,
  baseTemplate: string,
): { template: string; warnings: string[] } {
  const warnings: string[] = [];
  if (requested && requested !== baseTemplate) {
    warnings.push("template override ignored — children inherit the base template");
  }
  return { template: baseTemplate, warnings };
}

/**
 * Render the merged document for a resume row and persist a new versioned PDF.
 * Mutates+returns the updated row. Old PDFs are retained (append-only).
 */
async function renderAndStore(row: ResumeRow): Promise<{ row: ResumeRow; warnings: string[] }> {
  const base = baseRepo.get(row.baseId);
  if (!base) throw notFound(`Base resume '${row.baseId}' not found`, "base_not_found", "base_id");

  const template = templateRegistry.require(row.template);
  const merged = mergeResume(base.data, row.overrides as Overrides);

  const { pdf, warnings } = await renderToPdf(template, merged);

  const version = row.version + 1;
  const filename = `${row.id}_v${version}`;
  const stored = await getStorage().write(filename, pdf);

  const updated = resumeRepo.update(row.id, {
    version,
    pdfPath: stored.path,
    pdfUrl: stored.url,
  });
  log.info("Resume rendered", { id: row.id, version, bytes: pdf.byteLength });
  return { row: updated!, warnings };
}

/** Create a child resume from a (possibly loose) request body. */
export async function createResume(rawBody: unknown): Promise<ResumeResult> {
  const normalized = normalizePayload(rawBody);

  // base_id presence is checked explicitly for a clear 400 (spec §16).
  if (!normalized.base_id || typeof normalized.base_id !== "string") {
    throw badRequest("base_id is required", "base_id_required", "base_id");
  }

  const payload: CreateResume = parseOrThrow(createResumeSchema, normalized);

  const base = baseRepo.get(payload.base_id);
  if (!base) {
    throw notFound(`Base resume '${payload.base_id}' not found`, "base_not_found", "base_id");
  }

  const { template, warnings: tplWarnings } = resolveTemplate(payload.template, base.template);

  const id = `resume_${nanoid(12)}`;
  const inserted = resumeRepo.insert({
    id,
    baseId: payload.base_id,
    template,
    company: payload.meta.company ?? null,
    role: payload.meta.role ?? null,
    tags: payload.tags,
    overrides: payload.overrides,
    version: 0,
  });

  const { row, warnings } = await renderAndStore(inserted);
  return { resume: row, warnings: [...tplWarnings, ...warnings] };
}

/** Update a child resume's overrides/metadata and re-render (spec §6). */
export async function updateResume(id: string, rawBody: unknown): Promise<ResumeResult> {
  const existing = resumeRepo.get(id);
  if (!existing) throw notFound(`Resume '${id}' not found`, "resume_not_found");

  const normalized = normalizePayload({ base_id: existing.baseId, ...(rawBody as object) });
  const payload = parseOrThrow(updateResumeSchema, normalized);

  const base = baseRepo.get(existing.baseId)!;
  const { template, warnings: tplWarnings } = resolveTemplate(
    payload.template ?? existing.template,
    base.template,
  );

  const updated = resumeRepo.update(id, {
    template,
    ...(payload.meta?.company !== undefined ? { company: payload.meta.company } : {}),
    ...(payload.meta?.role !== undefined ? { role: payload.meta.role } : {}),
    ...(payload.tags !== undefined ? { tags: payload.tags } : {}),
    ...(payload.overrides !== undefined ? { overrides: payload.overrides } : {}),
  })!;

  const { row, warnings } = await renderAndStore(updated);
  return { resume: row, warnings: [...tplWarnings, ...warnings] };
}

/** Re-render a resume without changing its data (spec §6). */
export async function regenerateResume(id: string): Promise<ResumeResult> {
  const existing = resumeRepo.get(id);
  if (!existing) throw notFound(`Resume '${id}' not found`, "resume_not_found");
  const { row, warnings } = await renderAndStore(existing);
  return { resume: row, warnings };
}

/** Delete a resume and its current PDF from storage (spec §6). */
export async function deleteResume(id: string): Promise<void> {
  const existing = resumeRepo.get(id);
  if (!existing) throw notFound(`Resume '${id}' not found`, "resume_not_found");
  if (existing.pdfPath) {
    await getStorage()
      .delete(existing.pdfPath)
      .catch((err) => log.warn("Failed to delete PDF during resume delete", { id, error: String(err) }));
  }
  resumeRepo.delete(id);
}

/** In-memory SVG thumbnail cache, keyed by `${id}:${version}`. */
const thumbCache = new Map<string, string>();

/** Render the resume to a static SVG thumbnail (cached per id+version). */
export async function resumeThumbnail(id: string): Promise<string> {
  const row = resumeRepo.get(id);
  if (!row) throw notFound(`Resume '${id}' not found`, "resume_not_found");

  const key = `${id}:${row.version}`;
  const cached = thumbCache.get(key);
  if (cached) return cached;

  const base = baseRepo.get(row.baseId);
  if (!base) throw notFound(`Base resume '${row.baseId}' not found`, "base_not_found");
  const template = templateRegistry.require(row.template);
  const merged = mergeResume(base.data, row.overrides as Overrides);

  const svg = await renderToSvg(template, merged);
  thumbCache.set(key, svg);
  return svg;
}

/**
 * Render a base resume itself to a static SVG thumbnail (cached per id+updatedAt).
 * Same render path as a child, just with no overrides — so a base's card preview
 * matches how its children look.
 */
export async function baseThumbnail(id: string): Promise<string> {
  const base = baseRepo.get(id);
  if (!base) throw notFound(`Base resume '${id}' not found`, "base_not_found");

  const key = `base:${id}:${base.updatedAt}`;
  const cached = thumbCache.get(key);
  if (cached) return cached;

  const template = templateRegistry.require(base.template);
  const merged = mergeResume(base.data, {} as Overrides);

  const svg = await renderToSvg(template, merged);
  thumbCache.set(key, svg);
  return svg;
}

/** The fully merged data for a resume (base + overrides), for ?expand=true. */
export function expandResume(id: string) {
  const existing = resumeRepo.get(id);
  if (!existing) throw notFound(`Resume '${id}' not found`, "resume_not_found");
  const base = baseRepo.get(existing.baseId);
  if (!base) throw notFound(`Base resume '${existing.baseId}' not found`, "base_not_found");
  return mergeResume(base.data, existing.overrides as Overrides);
}
