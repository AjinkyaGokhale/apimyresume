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
    intro?: string;
    paragraphs?: string[];
    closing?: string;
    signoff?: string;
  };
  date?: string;
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
