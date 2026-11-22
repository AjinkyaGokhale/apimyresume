import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { db } from "./index.ts";
import {
  bases,
  jobEvents,
  jobs,
  resumes,
  type NewBaseRow,
  type NewJobEventRow,
  type NewJobRow,
  type NewResumeRow,
} from "./schema.ts";

/** Data-access helpers for bases and resumes (spec §3, §6). */

const now = () => new Date().toISOString();

// --- Bases ---

export const baseRepo = {
  list() {
    return db
      .select({
        id: bases.id,
        name: bases.name,
        template: bases.template,
        updatedAt: bases.updatedAt,
        childCount: sql<number>`(SELECT COUNT(*) FROM ${resumes} WHERE ${resumes.baseId} = ${bases.id})`,
      })
      .from(bases)
      .orderBy(desc(bases.updatedAt))
      .all();
  },

  get(id: string) {
    return db.select().from(bases).where(eq(bases.id, id)).get();
  },

  insert(row: NewBaseRow) {
    return db.insert(bases).values(row).returning().get();
  },

  update(id: string, patch: Partial<NewBaseRow>) {
    return db
      .update(bases)
      .set({ ...patch, updatedAt: now() })
      .where(eq(bases.id, id))
      .returning()
      .get();
  },

  delete(id: string) {
    return db.delete(bases).where(eq(bases.id, id)).run();
  },

  childCount(baseId: string): number {
    const row = db
      .select({ n: sql<number>`COUNT(*)` })
      .from(resumes)
      .where(eq(resumes.baseId, baseId))
      .get();
    return row?.n ?? 0;
  },
};

// --- Resumes ---

export interface ResumeListFilter {
  company?: string;
  tag?: string;
  baseId?: string;
  page?: number;
  limit?: number;
}

export const resumeRepo = {
  get(id: string) {
    return db.select().from(resumes).where(eq(resumes.id, id)).get();
  },

  insert(row: NewResumeRow) {
    return db.insert(resumes).values(row).returning().get();
  },

  update(id: string, patch: Partial<NewResumeRow>) {
    return db
      .update(resumes)
      .set({ ...patch, updatedAt: now() })
      .where(eq(resumes.id, id))
      .returning()
      .get();
  },

  delete(id: string) {
    return db.delete(resumes).where(eq(resumes.id, id)).run();
  },

  childrenOf(baseId: string) {
    return db.select().from(resumes).where(eq(resumes.baseId, baseId)).all();
  },

  list(filter: ResumeListFilter = {}) {
    const page = Math.max(filter.page ?? 1, 1);
    const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);

    const conds = [];
    if (filter.company) conds.push(eq(resumes.company, filter.company));
    if (filter.baseId) conds.push(eq(resumes.baseId, filter.baseId));
    // tags is a JSON array column; EXISTS over json_each finds an exact tag match.
    if (filter.tag) {
      conds.push(
        sql`EXISTS (SELECT 1 FROM json_each(${resumes.tags}) WHERE json_each.value = ${filter.tag})`,
      );
    }
    const where = conds.length ? and(...conds) : undefined;

    const total =
      db
        .select({ n: sql<number>`COUNT(*)` })
        .from(resumes)
        .where(where)
        .get()?.n ?? 0;

    const rows = db
      .select()
      .from(resumes)
      .where(where)
      .orderBy(desc(resumes.createdAt))
      .limit(limit)
      .offset((page - 1) * limit)
      .all();

    return { rows, total, page, limit, hasNext: page * limit < total };
  },
};

// --- Jobs ---

export interface JobFilter {
  status?: string[];
  company?: string;
  location?: string;
  workMode?: string;
  source?: string;
  tag?: string;
  q?: string;
  from?: string;
  to?: string;
  dateField?: "applied_at" | "created_at" | "posted_at" | "updated_at";
}

export interface JobListFilter extends JobFilter {
  sort?: "applied_at" | "created_at" | "updated_at" | "posted_at" | "company" | "status" | "match_score";
  order?: "asc" | "desc";
  page?: number;
  limit?: number;
}

const jobDateColumns = {
  applied_at: jobs.appliedAt,
  created_at: jobs.createdAt,
  posted_at: jobs.postedAt,
  updated_at: jobs.updatedAt,
} as const;

const jobSortColumns = {
  ...jobDateColumns,
  company: jobs.company,
  status: jobs.status,
  match_score: jobs.matchScore,
} as const;

/** Escape LIKE wildcards so user input matches literally. */
const likeArg = (v: string) => `%${v.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
const like = (col: SQL | typeof jobs.company, v: string) => sql`${col} LIKE ${likeArg(v)} ESCAPE '\\'`;

/** Build the WHERE clause shared by the job list and the stats endpoint. */
export function jobWhere(f: JobFilter): SQL | undefined {
  const conds: SQL[] = [];
  if (f.status?.length) conds.push(inArray(jobs.status, f.status));
  if (f.company) conds.push(like(jobs.company, f.company));
  if (f.location) conds.push(like(sql`coalesce(${jobs.location}, '')`, f.location));
  if (f.workMode) conds.push(eq(jobs.workMode, f.workMode));
  if (f.source) conds.push(eq(jobs.source, f.source));
  if (f.tag) {
    conds.push(sql`EXISTS (SELECT 1 FROM json_each(${jobs.tags}) WHERE json_each.value = ${f.tag})`);
  }
  if (f.q) {
    const arg = likeArg(f.q);
    conds.push(
      sql`(${jobs.company} LIKE ${arg} ESCAPE '\\' OR ${jobs.role} LIKE ${arg} ESCAPE '\\'
        OR coalesce(${jobs.location}, '') LIKE ${arg} ESCAPE '\\' OR coalesce(${jobs.notes}, '') LIKE ${arg} ESCAPE '\\')`,
    );
  }
  const dateCol = jobDateColumns[f.dateField ?? "applied_at"];
  // Dates are ISO text, so string comparison orders correctly. `to` is inclusive
  // of the whole day when given as YYYY-MM-DD.
  if (f.from) conds.push(gte(dateCol, f.from));
  if (f.to) conds.push(lte(dateCol, f.to.length === 10 ? `${f.to}T23:59:59.999Z` : f.to));
  return conds.length ? and(...conds) : undefined;
}

export const jobRepo = {
  get(id: string) {
    return db.select().from(jobs).where(eq(jobs.id, id)).get();
  },

  getByUrl(url: string) {
    return db.select().from(jobs).where(eq(jobs.jobUrl, url)).get();
  },

  insert(row: NewJobRow) {
    return db.insert(jobs).values(row).returning().get();
  },

  update(id: string, patch: Partial<NewJobRow>) {
    return db
      .update(jobs)
      .set({ ...patch, updatedAt: now() })
      .where(eq(jobs.id, id))
      .returning()
      .get();
  },

  delete(id: string) {
    return db.delete(jobs).where(eq(jobs.id, id)).run();
  },

  list(filter: JobListFilter = {}) {
    const page = Math.max(filter.page ?? 1, 1);
    const limit = Math.min(Math.max(filter.limit ?? 20, 1), 100);
    const where = jobWhere(filter);

    const total =
      db
        .select({ n: sql<number>`COUNT(*)` })
        .from(jobs)
        .where(where)
        .get()?.n ?? 0;

    const col = jobSortColumns[filter.sort ?? "updated_at"];
    const dir = filter.order === "asc" ? asc : desc;
    const rows = db
      .select()
      .from(jobs)
      .where(where)
      // Nulls (e.g. not-yet-applied) sort last regardless of direction.
      .orderBy(sql`${col} IS NULL`, dir(col), desc(jobs.createdAt))
      .limit(limit)
      .offset((page - 1) * limit)
      .all();

    return { rows, total, page, limit, hasNext: page * limit < total };
  },
};

export const jobEventRepo = {
  insert(row: NewJobEventRow) {
    return db.insert(jobEvents).values(row).returning().get();
  },

  forJob(jobId: string) {
    return db
      .select()
      .from(jobEvents)
      .where(eq(jobEvents.jobId, jobId))
      .orderBy(desc(jobEvents.createdAt))
      .all();
  },
};
