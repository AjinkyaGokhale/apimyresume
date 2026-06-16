import type { BaseRow, ResumeRow } from "../db/schema.ts";
import type { CoverLetter } from "../types/coverletter.ts";

/** Public API representation of a child resume (spec §6). */
export function resumeDto(row: ResumeRow) {
  return {
    id: row.id,
    base_id: row.baseId,
    template: row.template,
    tags: row.tags,
    company: row.company,
    role: row.role,
    overrides: row.overrides,
    pdf_url: row.pdfUrl,
    version: row.version,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

/** Public API representation of a stored cover letter (or null when absent). */
export function coverLetterDto(coverLetter: CoverLetter | null) {
  return { cover_letter: coverLetter };
}

/** Public API representation of a base resume (spec §3). */
export function baseDto(row: BaseRow) {
  return {
    id: row.id,
    name: row.name,
    template: row.template,
    template_lock: row.templateLock,
    data: row.data,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}
