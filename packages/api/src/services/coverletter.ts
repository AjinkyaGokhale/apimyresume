import { baseRepo, resumeRepo } from "../db/repo.ts";
import type { ResumeRow } from "../db/schema.ts";
import { AppError, notFound } from "../lib/errors.ts";
import { log } from "../lib/log.ts";
import { parseOrThrow } from "../lib/validation.ts";
import { mergeResume } from "../pipeline/merge.ts";
import { renderCoverLetterToPdf } from "../render/index.ts";
import { templateRegistry } from "../templates/registry.ts";
import type { RegisteredTemplate } from "../templates/types.ts";
import { coverLetterSchema, type CoverLetter } from "../types/coverletter.ts";
import type { Overrides } from "../types/overrides.ts";

/**
 * Cover letter service. A cover letter is a sub-resource of a child resume: the
 * author identity comes from the resume's merged profile, the recipient + body
 * are stored per resume (resumes.cover_letter). PDFs are rendered on demand and
 * not persisted — letters are cheap to render and change with every body edit.
 */

/** Load the resume row or throw a 404. */
function requireResume(id: string): ResumeRow {
  const row = resumeRepo.get(id);
  if (!row) throw notFound(`Resume '${id}' not found`, "resume_not_found");
  return row;
}

/**
 * Resolve the resume's template and assert it ships a cover-letter variant.
 * Returns a 422 cover_letter_unsupported when the template can't render a letter.
 */
function requireCoverLetterTemplate(row: ResumeRow): RegisteredTemplate {
  const template = templateRegistry.require(row.template);
  if (!template.hasCoverLetter) {
    throw new AppError(
      422,
      "cover_letter_unsupported",
      `Template '${template.id}' does not provide a cover letter`,
      { field: "template" },
    );
  }
  return template;
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
  const coverLetter = parseOrThrow(coverLetterSchema, rawBody ?? {});
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

/** Render the stored cover letter to a PDF (no persistence). */
export async function renderStoredCoverLetter(id: string): Promise<{ pdf: Uint8Array; warnings: string[] }> {
  const row = requireResume(id);
  const template = requireCoverLetterTemplate(row);
  const stored = row.coverLetter as CoverLetter | null;
  if (!stored) {
    throw notFound(`Resume '${id}' has no cover letter`, "cover_letter_not_found");
  }
  return renderFor(row, template, stored);
}

/** Render supplied (unsaved) cover letter data to a PDF — live preview path. */
export async function previewCoverLetter(
  id: string,
  rawBody: unknown,
): Promise<{ pdf: Uint8Array; warnings: string[] }> {
  const row = requireResume(id);
  const template = requireCoverLetterTemplate(row);
  const coverLetter = parseOrThrow(coverLetterSchema, rawBody ?? {});
  return renderFor(row, template, coverLetter);
}

/** Merge resume identity + cover letter content into a context and render. */
async function renderFor(
  row: ResumeRow,
  template: RegisteredTemplate,
  coverLetter: CoverLetter,
): Promise<{ pdf: Uint8Array; warnings: string[] }> {
  const base = baseRepo.get(row.baseId);
  if (!base) throw notFound(`Base resume '${row.baseId}' not found`, "base_not_found", "base_id");

  const merged = mergeResume(base.data, row.overrides as Overrides);
  const ctx = buildCoverLetterContext(merged.profile, row, coverLetter);
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
  row: ResumeRow,
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

  return {
    author: profile.name ?? "",
    location: profile.location ?? "",
    date: coverLetter.date ?? today(),
    contacts,
    addressee: {
      ...coverLetter.addressee,
      institution: coverLetter.addressee.institution ?? row.company ?? "",
    },
    body: coverLetter.body,
  };
}
