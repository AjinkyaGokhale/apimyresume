import { baseRepo, resumeRepo } from "../db/repo.ts";
import type { BaseRow, ResumeRow } from "../db/schema.ts";
import { notFound } from "../lib/errors.ts";
import { log } from "../lib/log.ts";
import { parseOrThrow } from "../lib/validation.ts";
import { deepMerge, mergeResume } from "../pipeline/merge.ts";
import { renderCoverLetterToPdf } from "../render/index.ts";
import { templateRegistry } from "../templates/registry.ts";
import type { RegisteredTemplate } from "../templates/types.ts";
import { coverLetterInputSchema, type CoverLetter } from "../types/coverletter.ts";
import type { Overrides } from "../types/overrides.ts";

/**
 * Cover letter service. A cover letter is a sub-resource of a child resume: the
 * author identity comes from the resume's merged profile, the recipient + body
 * are stored per resume (resumes.cover_letter). PDFs are rendered on demand and
 * not persisted — letters are cheap to render and change with every body edit.
 */

/**
 * Merge a base default cover letter with a child's override diff. Objects merge
 * key-by-key (child wins); arrays and scalars replace wholesale. Both sides are
 * partial — an absent field on the child inherits the base value.
 */
export function mergeCoverLetter(base: CoverLetter, child: CoverLetter): CoverLetter {
  return deepMerge(structuredClone(base), child);
}

/** Load the resume row or throw a 404. */
function requireResume(id: string): ResumeRow {
  const row = resumeRepo.get(id);
  if (!row) throw notFound(`Resume '${id}' not found`, "resume_not_found");
  return row;
}

/** Resolve the resume's template. Every template can render a cover letter. */
function requireCoverLetterTemplate(row: ResumeRow): RegisteredTemplate {
  return templateRegistry.require(row.template);
}

/** The stored cover letter for a resume, or null. */
export function getCoverLetter(id: string): CoverLetter | null {
  const row = requireResume(id);
  return (row.coverLetter as CoverLetter | null) ?? null;
}

/** Validate and persist (replace) the cover letter for a resume. */
export function setCoverLetter(id: string, rawBody: unknown): CoverLetter {
  const row = requireResume(id);
  // Reject early when the resume's template can't render a cover letter, so a
  // caller never stores a letter that could never produce a PDF.
  requireCoverLetterTemplate(row);
  const coverLetter = parseOrThrow(coverLetterInputSchema, rawBody ?? {});
  const updated = resumeRepo.update(id, { coverLetter });
  log.info("Cover letter saved", { id });
  return updated!.coverLetter as CoverLetter;
}

/** Remove the stored cover letter from a resume. */
export function deleteCoverLetter(id: string): void {
  requireResume(id);
  resumeRepo.update(id, { coverLetter: null });
  log.info("Cover letter deleted", { id });
}

/** Render the effective (base default + stored child diff) cover letter. */
export async function renderStoredCoverLetter(
  id: string,
): Promise<{ pdf: Uint8Array; warnings: string[] }> {
  const row = requireResume(id);
  const template = requireCoverLetterTemplate(row);
  const base = baseRepo.get(row.baseId);
  if (!base) throw notFound(`Base resume '${row.baseId}' not found`, "base_not_found", "base_id");

  const childCL = (row.coverLetter as CoverLetter | null) ?? null;
  const baseCL = (base.coverLetter as CoverLetter | null) ?? null;
  // A child with no own letter still renders if its base defines one.
  if (!childCL && !baseCL) {
    throw notFound(`Resume '${id}' has no cover letter`, "cover_letter_not_found");
  }
  const effective = mergeCoverLetter(baseCL ?? {}, childCL ?? {});
  return renderWith(base, template, row.company ?? undefined, effective);
}

/** Render a supplied (unsaved) child diff merged over the base — live preview. */
export async function previewCoverLetter(
  id: string,
  rawBody: unknown,
): Promise<{ pdf: Uint8Array; warnings: string[] }> {
  const row = requireResume(id);
  const template = requireCoverLetterTemplate(row);
  const base = baseRepo.get(row.baseId);
  if (!base) throw notFound(`Base resume '${row.baseId}' not found`, "base_not_found", "base_id");

  const childCL = parseOrThrow(coverLetterInputSchema, rawBody ?? {});
  const effective = mergeCoverLetter((base.coverLetter as CoverLetter | null) ?? {}, childCL);
  return renderWith(base, template, row.company ?? undefined, effective);
}

/** Merge resume identity + an effective cover letter into a context and render. */
async function renderWith(
  base: BaseRow,
  template: RegisteredTemplate,
  company: string | undefined,
  coverLetter: CoverLetter,
): Promise<{ pdf: Uint8Array; warnings: string[] }> {
  const merged = mergeResume(base.data, {} as Overrides);
  const ctx = buildCoverLetterContext(merged.profile, company, coverLetter);
  return renderCoverLetterToPdf(template, JSON.stringify(ctx));
}

/** Today's date as a pre-formatted "Month D, YYYY" string (Typst can't parse dates). */
function today(): string {
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", day: "numeric" }).format(
    new Date(),
  );
}

/** Build a {value, href} contact from a link, prefixing https:// when bare. */
function linkContact(value: string): { value: string; href: string } {
  const href = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return { value, href };
}

/** Profile (the person's fixed identity) shape we read from the merged document. */
interface MergedProfile {
  name?: string;
  location?: string;
  email?: string;
  phone?: string;
  links?: Record<string, string>;
}

/**
 * Compose the cover-letter render context: author identity from the resume
 * profile, recipient + body from the cover letter. addressee.institution falls
 * back to the resume's company; date falls back to today.
 */
export function buildCoverLetterContext(
  profile: MergedProfile,
  company: string | undefined,
  coverLetter: CoverLetter,
) {
  const contacts: Array<{ value: string; href: string }> = [];
  if (profile.email) contacts.push({ value: profile.email, href: `mailto:${profile.email}` });

  // Known links first (stable order), then any extra catch-all links.
  const links = profile.links ?? {};
  for (const key of ["github", "linkedin", "portfolio"]) {
    if (links[key]) contacts.push(linkContact(links[key]!));
  }
  for (const [key, value] of Object.entries(links)) {
    if (!["github", "linkedin", "portfolio"].includes(key) && value) contacts.push(linkContact(value));
  }

  const addressee = coverLetter.addressee ?? {};
  return {
    author: profile.name ?? "",
    location: profile.location ?? "",
    date: coverLetter.date ?? today(),
    contacts,
    addressee: {
      ...addressee,
      institution: addressee.institution ?? company ?? "",
    },
    body: coverLetter.body ?? {},
  };
}

// --- Base-level cover letter (the inherited default) -------------------------

/** Load the base row or throw a 404. */
function requireBase(baseId: string): BaseRow {
  const base = baseRepo.get(baseId);
  if (!base) throw notFound(`Base resume '${baseId}' not found`, "base_not_found");
  return base;
}

/** The base's default cover letter, or null. */
export function getBaseCoverLetter(baseId: string): CoverLetter | null {
  return (requireBase(baseId).coverLetter as CoverLetter | null) ?? null;
}

/** Validate and persist (replace) the base's default cover letter. */
export function setBaseCoverLetter(baseId: string, rawBody: unknown): CoverLetter {
  requireBase(baseId);
  const coverLetter = parseOrThrow(coverLetterInputSchema, rawBody ?? {});
  const updated = baseRepo.update(baseId, { coverLetter });
  log.info("Base cover letter saved", { baseId });
  return updated!.coverLetter as CoverLetter;
}

/** Remove the base's default cover letter. Children keep their own diffs. */
export function deleteBaseCoverLetter(baseId: string): void {
  requireBase(baseId);
  baseRepo.update(baseId, { coverLetter: null });
  log.info("Base cover letter deleted", { baseId });
}

/** Render the base default (merged with a supplied diff) using the base profile. */
export async function previewBaseCoverLetter(
  baseId: string,
  rawBody: unknown,
): Promise<{ pdf: Uint8Array; warnings: string[] }> {
  const base = requireBase(baseId);
  const template = templateRegistry.require(base.template);
  const override = parseOrThrow(coverLetterInputSchema, rawBody ?? {});
  const effective = mergeCoverLetter((base.coverLetter as CoverLetter | null) ?? {}, override);
  return renderWith(base, template, undefined, effective);
}
