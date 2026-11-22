import { z } from "zod";

/**
 * Job tracker schemas. Jobs are written by AI agents (API key) and the owner
 * (dashboard). Unknown keys are rejected (`.strict()`) so a typo in an agent's
 * payload surfaces as a 422 instead of being silently dropped.
 */

export const JOB_STATUSES = [
  "saved",
  "applied",
  "screening",
  "interviewing",
  "offer",
  "accepted",
  "rejected",
  "withdrawn",
  "ghosted",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const WORK_MODES = ["remote", "hybrid", "onsite"] as const;

/** Sortable columns and filterable date columns (whitelists — never raw SQL). */
export const JOB_SORT_FIELDS = [
  "applied_at",
  "created_at",
  "updated_at",
  "posted_at",
  "company",
  "status",
  "match_score",
] as const;
export const JOB_DATE_FIELDS = ["applied_at", "created_at", "posted_at", "updated_at"] as const;

/** YYYY-MM-DD or a full ISO datetime. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/, "ISO date (YYYY-MM-DD)")
  .refine((v) => !Number.isNaN(Date.parse(v)), "valid date");

const text = (max: number) => z.string().trim().min(1).max(max);

const jobFields = {
  company: text(200),
  role: text(200),
  job_url: z
    .string()
    .trim()
    .max(2048)
    .url()
    .refine((v) => /^https?:\/\//i.test(v), "http(s) URL"),
  location: text(200).nullable(),
  work_mode: z.enum(WORK_MODES).nullable(),
  status: z.enum(JOB_STATUSES),
  source: text(100).nullable(),
  salary_min: z.number().int().nonnegative().nullable(),
  salary_max: z.number().int().nonnegative().nullable(),
  salary_currency: z
    .string()
    .regex(/^[A-Za-z]{3}$/, "ISO 4217 code")
    .transform((v) => v.toUpperCase())
    .nullable(),
  match_score: z.number().int().min(0).max(100).nullable(),
  posted_at: isoDate.nullable(),
  applied_at: isoDate.nullable(),
  resume_id: text(100).nullable(),
  tags: z.array(text(50)).max(20),
  notes: z.string().max(10_000).nullable(),
};

const salaryRange = (v: { salary_min?: number | null; salary_max?: number | null }) =>
  v.salary_min == null || v.salary_max == null || v.salary_min <= v.salary_max;
const salaryIssue = { message: "salary_min must be <= salary_max", path: ["salary_min"] };

/** POST /jobs — company + role required, everything else optional. */
export const jobCreateSchema = z
  .object({
    ...jobFields,
    job_url: jobFields.job_url.optional(),
    location: jobFields.location.optional(),
    work_mode: jobFields.work_mode.optional(),
    status: jobFields.status.optional(),
    source: jobFields.source.optional(),
    salary_min: jobFields.salary_min.optional(),
    salary_max: jobFields.salary_max.optional(),
    salary_currency: jobFields.salary_currency.optional(),
    match_score: jobFields.match_score.optional(),
    posted_at: jobFields.posted_at.optional(),
    applied_at: jobFields.applied_at.optional(),
    resume_id: jobFields.resume_id.optional(),
    tags: jobFields.tags.optional(),
    notes: jobFields.notes.optional(),
    status_note: z.string().max(1000).optional(),
  })
  .strict()
  .refine(salaryRange, salaryIssue);
export type JobCreateInput = z.infer<typeof jobCreateSchema>;

/** PATCH /jobs/:id — every field optional; `status_note` annotates a status change. */
export const jobPatchSchema = z
  .object(jobFields)
  .partial()
  .extend({ status_note: z.string().max(1000).optional() })
  .strict()
  .refine(salaryRange, salaryIssue);
export type JobPatchInput = z.infer<typeof jobPatchSchema>;
