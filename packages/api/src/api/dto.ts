import type { BaseRow, JobEventRow, JobRow, ResumeRow } from "../db/schema.ts";
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

/** Public API representation of a tracked job. */
export function jobDto(row: JobRow) {
  return {
    id: row.id,
    company: row.company,
    role: row.role,
    job_url: row.jobUrl,
    location: row.location,
    work_mode: row.workMode,
    status: row.status,
    source: row.source,
    salary_min: row.salaryMin,
    salary_max: row.salaryMax,
    salary_currency: row.salaryCurrency,
    match_score: row.matchScore,
    posted_at: row.postedAt,
    applied_at: row.appliedAt,
    resume_id: row.resumeId,
    tags: row.tags,
    notes: row.notes,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

/** Public API representation of one job status change. */
export function jobEventDto(row: JobEventRow) {
  return {
    id: row.id,
    from_status: row.fromStatus,
    to_status: row.toStatus,
    note: row.note,
    actor: row.actor,
    created_at: row.createdAt,
  };
}
