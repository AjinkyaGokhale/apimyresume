import { nanoid } from "nanoid";
import { inArray, sql } from "drizzle-orm";
import { db } from "../db/index.ts";
import { jobEventRepo, jobRepo, jobWhere, resumeRepo, type JobFilter, type JobListFilter } from "../db/repo.ts";
import { jobEvents, jobs, type JobRow, type NewJobRow } from "../db/schema.ts";
import { notFound, unprocessable } from "../lib/errors.ts";
import { log } from "../lib/log.ts";
import { parseOrThrow } from "../lib/validation.ts";
import {
  JOB_DATE_FIELDS,
  JOB_SORT_FIELDS,
  JOB_STATUSES,
  jobCreateSchema,
  jobPatchSchema,
  type JobPatchInput,
} from "../types/jobs.ts";

/**
 * Job tracker service. Jobs are created/updated by AI agents (API key) and the
 * owner (dashboard). Every status change is recorded in job_events so the
 * dashboard can show a history and compute funnel metrics from stages a job
 * actually passed through, not just where it ended up.
 */

type Actor = "apikey" | "session";

const today = () => new Date().toISOString().slice(0, 10);

/** Load the job row or throw a 404. */
function requireJob(id: string): JobRow {
  const row = jobRepo.get(id);
  if (!row) throw notFound(`Job '${id}' not found`, "job_not_found");
  return row;
}

/** 422 when a job references a resume that does not exist. */
function assertResume(resumeId: string | null | undefined): void {
  if (resumeId && !resumeRepo.get(resumeId)) {
    throw unprocessable(`Resume '${resumeId}' not found`, [
      { field: "resume_id", received: resumeId, expected: "existing resume id" },
    ]);
  }
}

/** Map validated snake_case input to a camelCase row patch (undefined = unchanged). */
function toRowPatch(input: JobPatchInput): Partial<NewJobRow> {
  const patch: Partial<NewJobRow> = {};
  if (input.company !== undefined) patch.company = input.company;
  if (input.role !== undefined) patch.role = input.role;
  if (input.job_url !== undefined) patch.jobUrl = input.job_url;
  if (input.location !== undefined) patch.location = input.location;
  if (input.work_mode !== undefined) patch.workMode = input.work_mode;
  if (input.status !== undefined) patch.status = input.status;
  if (input.source !== undefined) patch.source = input.source;
  if (input.salary_min !== undefined) patch.salaryMin = input.salary_min;
  if (input.salary_max !== undefined) patch.salaryMax = input.salary_max;
  if (input.salary_currency !== undefined) patch.salaryCurrency = input.salary_currency;
  if (input.match_score !== undefined) patch.matchScore = input.match_score;
  if (input.posted_at !== undefined) patch.postedAt = input.posted_at;
  if (input.applied_at !== undefined) patch.appliedAt = input.applied_at;
  if (input.resume_id !== undefined) patch.resumeId = input.resume_id;
  if (input.tags !== undefined) patch.tags = input.tags;
  if (input.notes !== undefined) patch.notes = input.notes;
  return patch;
}

/** Apply a validated patch to an existing job, recording a status-change event. */
function applyPatch(existing: JobRow, input: JobPatchInput, actor: Actor): JobRow {
  const patch = toRowPatch(input);
  const statusChanged = input.status !== undefined && input.status !== existing.status;
  // First move to "applied" stamps the application date unless one was given.
  if (input.status === "applied" && !existing.appliedAt && input.applied_at === undefined) {
    patch.appliedAt = today();
  }
  const job = jobRepo.update(existing.id, patch)!;
  if (statusChanged) {
    jobEventRepo.insert({
      id: `jevt_${nanoid(12)}`,
      jobId: existing.id,
      fromStatus: existing.status,
      toStatus: input.status!,
      note: input.status_note ?? null,
      actor,
    });
  }
  return job;
}

/**
 * Create a job, or — when `job_url` matches an existing job — merge the given
 * fields into it. Agents can therefore re-POST the same posting safely.
 */
export function createOrUpsertJob(rawBody: unknown, actor: Actor): { job: JobRow; created: boolean } {
  const input = parseOrThrow(jobCreateSchema, rawBody ?? {});
  assertResume(input.resume_id);

  const result = db.transaction(() => {
    const existing = input.job_url ? jobRepo.getByUrl(input.job_url) : undefined;
    if (existing) return { job: applyPatch(existing, input, actor), created: false };

    const status = input.status ?? "saved";
    const id = `job_${nanoid(12)}`;
    const job = jobRepo.insert({
      ...toRowPatch(input),
      id,
      company: input.company,
      role: input.role,
      status,
      appliedAt: input.applied_at ?? (status === "applied" ? today() : null),
    });
    jobEventRepo.insert({
      id: `jevt_${nanoid(12)}`,
      jobId: id,
      fromStatus: null,
      toStatus: status,
      note: input.status_note ?? null,
      actor,
    });
    return { job, created: true };
  });
  log.info("Job saved", { id: result.job.id, created: result.created });
  return result;
}

/** Validate and apply a partial update. */
export function updateJob(id: string, rawBody: unknown, actor: Actor): JobRow {
  const existing = requireJob(id);
  const input = parseOrThrow(jobPatchSchema, rawBody ?? {});
  assertResume(input.resume_id);
  if (input.job_url && input.job_url !== existing.jobUrl) {
    const clash = jobRepo.getByUrl(input.job_url);
    if (clash) {
      throw unprocessable(`Another job already uses this job_url`, [
        { field: "job_url", received: input.job_url, expected: `unique url (in use by '${clash.id}')` },
      ]);
    }
  }
  const job = db.transaction(() => applyPatch(existing, input, actor));
  log.info("Job updated", { id });
  return job;
}

/** A job plus its status history (newest first). */
export function getJob(id: string) {
  const job = requireJob(id);
  return { job, events: jobEventRepo.forJob(id) };
}

export function deleteJob(id: string): void {
  requireJob(id);
  jobRepo.delete(id);
  log.info("Job deleted", { id });
}

// --- Query parsing -----------------------------------------------------------

const isDate = (v: string | undefined) =>
  v && /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v)) ? v : undefined;

function num(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function pick<T extends string>(allowed: readonly T[], v: string | undefined): T | undefined {
  return allowed.includes(v as T) ? (v as T) : undefined;
}

/**
 * Turn raw query params into a list filter. Unknown or malformed values fall
 * back to defaults (like `?page=abc` on /resumes) rather than erroring, and the
 * sort/date columns only ever come from whitelists.
 */
export function parseJobQuery(q: Record<string, string | undefined>): JobListFilter {
  const status = (q.status ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is (typeof JOB_STATUSES)[number] => (JOB_STATUSES as readonly string[]).includes(s));
  return {
    status: status.length ? status : undefined,
    company: q.company || undefined,
    location: q.location || undefined,
    workMode: q.work_mode || undefined,
    source: q.source || undefined,
    tag: q.tag || undefined,
    q: q.q?.trim() || undefined,
    from: isDate(q.from),
    to: isDate(q.to),
    dateField: pick(JOB_DATE_FIELDS, q.date_field),
    sort: pick(JOB_SORT_FIELDS, q.sort),
    order: q.order === "asc" ? "asc" : q.order === "desc" ? "desc" : undefined,
    page: num(q.page),
    limit: num(q.limit),
  };
}

// --- Metrics -----------------------------------------------------------------

const APPLIED_STAGES = new Set(["applied", "screening", "interviewing", "offer", "accepted"]);
const RESPONSE_STAGES = new Set(["screening", "interviewing", "offer", "accepted", "rejected"]);
const INTERVIEW_STAGES = new Set(["interviewing", "offer", "accepted"]);
const OFFER_STAGES = new Set(["offer", "accepted"]);
const DAY = 86_400_000;

export interface MetricJob {
  id: string;
  status: string;
  company: string;
  location: string | null;
  workMode: string | null;
  source: string | null;
  appliedAt: string | null;
}

export interface MetricEvent {
  jobId: string;
  toStatus: string;
  createdAt: string;
}

const ratio = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 1000 : 0);

/** Top-N counts for a nullable string key (nulls skipped). */
function topCounts(items: Array<string | null>, n = 10) {
  const counts = new Map<string, number>();
  for (const k of items) if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, n);
}

/** Bucket key: Monday of the ISO week (YYYY-MM-DD), or YYYY-MM when monthly. */
export function periodKey(iso: string, monthly: boolean): string {
  if (monthly) return iso.slice(0, 7);
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(d.getTime() - dow * DAY).toISOString().slice(0, 10);
}

/** Every period key from `first` to `last` inclusive, so the chart has no gaps. */
function periodRange(first: string, last: string, monthly: boolean): string[] {
  const keys: string[] = [];
  if (monthly) {
    let [y, m] = first.split("-").map(Number) as [number, number];
    const [ly, lm] = last.split("-").map(Number) as [number, number];
    while (y < ly || (y === ly && m <= lm)) {
      keys.push(`${y}-${String(m).padStart(2, "0")}`);
      if (++m > 12) { m = 1; y++; }
    }
    return keys;
  }
  for (let t = Date.parse(`${first}T00:00:00Z`); t <= Date.parse(`${last}T00:00:00Z`); t += 7 * DAY) {
    keys.push(new Date(t).toISOString().slice(0, 10));
  }
  return keys;
}

/**
 * Compute dashboard metrics from a filtered set of jobs and their status
 * history. Funnel stages count what a job ever reached (from events + current
 * status), so a job now "rejected" still counts as interviewed if it got there.
 */
export function computeJobMetrics(jobRows: MetricJob[], events: MetricEvent[], now = new Date()) {
  const reached = new Map<string, Set<string>>();
  const firstResponse = new Map<string, string>();
  for (const j of jobRows) reached.set(j.id, new Set([j.status]));
  // Events arrive in any order; sort so "first response" is the earliest.
  for (const e of [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    reached.get(e.jobId)?.add(e.toStatus);
    if (RESPONSE_STAGES.has(e.toStatus) && !firstResponse.has(e.jobId)) firstResponse.set(e.jobId, e.createdAt);
  }

  const by_status = Object.fromEntries(JOB_STATUSES.map((s) => [s, 0])) as Record<string, number>;
  let applied = 0, responded = 0, interviewed = 0, offered = 0;
  let responseDays = 0, responseCount = 0, last7 = 0, last30 = 0;
  const appliedDates: string[] = [];
  const responseDates: string[] = [];

  for (const j of jobRows) {
    by_status[j.status] = (by_status[j.status] ?? 0) + 1;
    const stages = reached.get(j.id)!;
    const hasApplied = !!j.appliedAt || [...stages].some((s) => APPLIED_STAGES.has(s));
    if (!hasApplied) continue;
    applied++;
    if ([...stages].some((s) => RESPONSE_STAGES.has(s))) responded++;
    if ([...stages].some((s) => INTERVIEW_STAGES.has(s))) interviewed++;
    if ([...stages].some((s) => OFFER_STAGES.has(s))) offered++;

    const resp = firstResponse.get(j.id);
    if (resp) responseDates.push(resp);
    if (j.appliedAt) {
      appliedDates.push(j.appliedAt);
      const age = now.getTime() - Date.parse(j.appliedAt);
      if (age <= 7 * DAY) last7++;
      if (age <= 30 * DAY) last30++;
      if (resp && resp >= j.appliedAt.slice(0, 10)) {
        responseDays += (Date.parse(resp) - Date.parse(j.appliedAt)) / DAY;
        responseCount++;
      }
    }
  }

  // Weekly buckets, switching to monthly once the span passes ~6 months.
  const all = [...appliedDates, ...responseDates].sort();
  let timeline: Array<{ period: string; applied: number; responses: number }> = [];
  if (all.length) {
    const monthly = Date.parse(all.at(-1)!) - Date.parse(all[0]!) > 180 * DAY;
    const buckets = new Map(
      periodRange(periodKey(all[0]!, monthly), periodKey(all.at(-1)!, monthly), monthly).map((k) => [
        k,
        { period: k, applied: 0, responses: 0 },
      ]),
    );
    for (const d of appliedDates) buckets.get(periodKey(d, monthly))!.applied++;
    for (const d of responseDates) buckets.get(periodKey(d, monthly))!.responses++;
    timeline = [...buckets.values()];
  }

  return {
    total: jobRows.length,
    by_status,
    applied_total: applied,
    funnel: { applied, responded, interviewed, offered },
    rates: {
      response_rate: ratio(responded, applied),
      interview_rate: ratio(interviewed, applied),
      offer_rate: ratio(offered, applied),
    },
    avg_days_to_response: responseCount ? Math.round((responseDays / responseCount) * 10) / 10 : null,
    applied_last_7d: last7,
    applied_last_30d: last30,
    timeline,
    by_location: topCounts(jobRows.map((j) => j.location)),
    by_work_mode: topCounts(jobRows.map((j) => j.workMode)),
    by_source: topCounts(jobRows.map((j) => j.source)),
    by_company: topCounts(jobRows.map((j) => j.company)),
  };
}

/** Distinct values for the dashboard's filter dropdowns (ignores filters). */
function jobFacets() {
  const distinct = (col: typeof jobs.location | typeof jobs.company | typeof jobs.source) =>
    db
      .selectDistinct({ v: col })
      .from(jobs)
      .where(sql`${col} IS NOT NULL AND ${col} != ''`)
      .orderBy(col)
      .limit(200)
      .all()
      .map((r) => r.v as string);
  const tags = db
    .all<{ v: string }>(sql`SELECT DISTINCT json_each.value AS v FROM ${jobs}, json_each(${jobs.tags}) ORDER BY v LIMIT 200`)
    .map((r) => r.v);
  return {
    locations: distinct(jobs.location),
    companies: distinct(jobs.company),
    sources: distinct(jobs.source),
    tags,
  };
}

/** Metrics for the jobs matching `filter` (same filters as the list endpoint). */
export function jobStats(filter: JobFilter) {
  const where = jobWhere(filter);
  const rows = db
    .select({
      id: jobs.id,
      status: jobs.status,
      company: jobs.company,
      location: jobs.location,
      workMode: jobs.workMode,
      source: jobs.source,
      appliedAt: jobs.appliedAt,
    })
    .from(jobs)
    .where(where)
    .all();
  const events = db
    .select({ jobId: jobEvents.jobId, toStatus: jobEvents.toStatus, createdAt: jobEvents.createdAt })
    .from(jobEvents)
    .where(inArray(jobEvents.jobId, db.select({ id: jobs.id }).from(jobs).where(where)))
    .all();
  return { ...computeJobMetrics(rows, events), facets: jobFacets() };
}
