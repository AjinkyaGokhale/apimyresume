import { baseRepo, resumeRepo } from "../db/repo.ts";
import { conflict, notFound } from "../lib/errors.ts";
import { parseOrThrow } from "../lib/validation.ts";
import { createBaseSchema, kbSchema, updateBaseSchema, type KB } from "../types/kb.ts";
import { deleteResume, regenerateResume } from "./resume.ts";

/**
 * Base resume service (spec §3). Bases are the canonical KB documents. They are
 * immutable from the perspective of child resumes — updating a base never
 * mutates or auto-re-renders existing children.
 */

/** Create a base resume. Rejects a duplicate id with 409. */
export function createBase(rawBody: unknown) {
  const kb: KB = parseOrThrow(createBaseSchema, rawBody);
  if (baseRepo.get(kb.id)) {
    throw conflict(`Base resume '${kb.id}' already exists`, "base_exists");
  }
  return baseRepo.insert({
    id: kb.id,
    name: kb.name || kb.profile.name, // use explicit name if provided, else fall back to profile name
    template: kb.template,
    templateLock: kb.template_lock,
    data: kb,
  });
}

export function getBase(id: string) {
  const base = baseRepo.get(id);
  if (!base) throw notFound(`Base resume '${id}' not found`, "base_not_found");
  return base;
}

export function listBases() {
  return baseRepo.list().map((b) => ({
    id: b.id,
    name: b.name,
    template: b.template,
    child_count: b.childCount,
    updated_at: b.updatedAt,
  }));
}

/**
 * Replace the bullets of a single experience entry by its stable id.
 * All other experience entries and all other sections are left untouched.
 */
export function updateExperienceBullets(baseId: string, entryId: string, bullets: string[]) {
  const existing = getBase(baseId);
  const entry = existing.data.experience.find((e) => e.id === entryId);
  if (!entry) throw notFound(`Experience entry '${entryId}' not found in base '${baseId}'`);

  const updatedExperience = existing.data.experience.map((e) =>
    e.id === entryId ? { ...e, bullets } : e,
  );
  const mergedData = { ...existing.data, experience: updatedExperience };

  return baseRepo.update(baseId, {
    name: mergedData.profile.name,
    template: mergedData.template,
    templateLock: mergedData.template_lock,
    data: mergedData,
  });
}

/** Patch a base's KB data. Children are untouched (spec §3). */
export function updateBase(id: string, rawBody: unknown) {
  const existing = getBase(id);
  const patch = parseOrThrow(updateBaseSchema, rawBody);

  // Merge the patch into the stored KB, then re-validate the whole document.
  const mergedData = kbSchema.parse({ ...existing.data, ...patch, id: existing.id });

  return baseRepo.update(id, {
    name: mergedData.profile.name,
    template: mergedData.template,
    templateLock: mergedData.template_lock,
    data: mergedData,
  });
}

/**
 * Delete a base. By default rejected with 409 if it still has child resumes
 * (spec §3). With `cascade`, every child resume (and its PDF) is deleted first,
 * then the base itself.
 */
export async function deleteBase(id: string, opts: { cascade?: boolean } = {}) {
  getBase(id); // 404 if absent
  const children = resumeRepo.childrenOf(id);
  if (children.length > 0 && !opts.cascade) {
    throw conflict("Cannot delete base with existing child resumes", "base_has_children");
  }
  for (const child of children) {
    await deleteResume(child.id); // removes the child's PDF from storage + its row
  }
  baseRepo.delete(id);
}

/**
 * Cascade re-render: dispatch a render job for every child resume using the
 * updated base + each child's stored overrides. Old PDFs are retained (§3).
 */
export async function regenerateChildren(id: string) {
  getBase(id); // 404 if absent
  const children = resumeRepo.childrenOf(id);
  const results = [];
  for (const child of children) {
    const { resume } = await regenerateResume(child.id);
    results.push({ id: resume.id, pdf_url: resume.pdfUrl, version: resume.version });
  }
  return results;
}
