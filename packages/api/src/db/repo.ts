import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "./index.ts";
import { bases, resumes, type NewBaseRow, type NewResumeRow } from "./schema.ts";

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
