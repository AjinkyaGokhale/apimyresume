export interface Addressee {
  name: string;
  institution?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  zip?: string;
}

export interface CoverLetter {
  addressee: Addressee;
  body: {
    subject?: string;
    intro?: string;
    paragraphs?: string[];
    closing?: string;
    signoff?: string;
    enclosures?: string[];
  };
  date?: string;
  lang?: "en" | "de";
  /** Letter-design id; absent = the resume template's letter or shared default. */
  template?: string;
}

export interface ResumeDto {
  id: string;
  base_id: string;
  template: string;
  tags: string[];
  company: string | null;
  role: string | null;
  overrides?: Record<string, unknown>;
  pdf_url: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  /** Present on the single-resume detail response (GET /resumes/:id). */
  has_cover_letter?: boolean;
  cover_letter?: CoverLetter | null;
}

export interface BaseDto {
  id: string;
  name: string;
  template: string;
  child_count: number;
  updated_at: string;
}

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  has_next: boolean;
}

export interface CompanyCount {
  company: string;
  count: number;
}

/** A single tile in the overview stats bar. */
export interface Stat {
  label: string;
  value: string | number;
  /** Optional change indicator shown next to the value. */
  delta?: string;
  dir?: "up" | "down" | "none";
  /** Render the delta as plain caret text (no arrow icon, no badge background). */
  plain?: boolean;
}

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

export interface JobDto {
  id: string;
  company: string;
  role: string;
  job_url: string | null;
  location: string | null;
  work_mode: string | null;
  status: JobStatus;
  source: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  match_score: number | null;
  posted_at: string | null;
  applied_at: string | null;
  resume_id: string | null;
  tags: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
  /** Present on the single-job detail response (GET /jobs/:id). */
  events?: JobEventDto[];
}

export interface JobEventDto {
  id: string;
  from_status: JobStatus | null;
  to_status: JobStatus;
  note: string | null;
  actor: "apikey" | "session";
  created_at: string;
}

/** Filters shared by GET /jobs and GET /jobs/stats (all optional). */
export interface JobFilters {
  status?: string[];
  company?: string;
  location?: string;
  work_mode?: string;
  source?: string;
  tag?: string;
  q?: string;
  from?: string;
  to?: string;
  date_field?: "applied_at" | "created_at" | "posted_at" | "updated_at";
  sort?: string;
  order?: "asc" | "desc";
  page?: number;
  limit?: number;
}

export interface KeyCount {
  key: string;
  count: number;
}

export interface JobStats {
  total: number;
  by_status: Record<JobStatus, number>;
  applied_total: number;
  /** Jobs that ever reached each funnel stage (from status history). */
  funnel: { applied: number; responded: number; interviewed: number; offered: number };
  rates: { response_rate: number; interview_rate: number; offer_rate: number };
  avg_days_to_response: number | null;
  applied_last_7d: number;
  applied_last_30d: number;
  timeline: Array<{ period: string; applied: number; responses: number }>;
  by_location: KeyCount[];
  by_work_mode: KeyCount[];
  by_source: KeyCount[];
  by_company: KeyCount[];
  facets: { locations: string[]; companies: string[]; sources: string[]; tags: string[] };
}
