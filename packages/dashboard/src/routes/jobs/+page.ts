// dashboard/src/routes/jobs/+page.ts
import { ApiUnreachable, getJobStats, listJobs } from "$lib/api";
import { daysAgo } from "$lib/format";
import type { JobDto, JobFilters, JobStats, Pagination } from "$lib/types";
import type { PageLoad } from "./$types";

const PAGE_SIZE = 25;
const RANGE_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

/** Resolve the `range` preset (or custom from/to) into concrete dates. */
function resolveRange(range: string, from?: string, to?: string): { from?: string; to?: string } {
  if (RANGE_DAYS[range]) return { from: daysAgo(RANGE_DAYS[range]!) };
  if (range === "ytd") return { from: `${new Date().getFullYear()}-01-01` };
  if (range === "custom") return { from, to };
  return {};
}

export const load: PageLoad = async ({ url }) => {
  const p = url.searchParams;
  const get = (k: string) => p.get(k) || undefined;

  // Raw URL state, echoed back so the toolbar controls render from it.
  const params = {
    q: get("q") ?? "",
    status: (get("status") ?? "").split(",").filter(Boolean),
    location: get("location") ?? "",
    work_mode: get("work_mode") ?? "",
    source: get("source") ?? "",
    tag: get("tag") ?? "",
    range: get("range") ?? "all",
    from: get("from") ?? "",
    to: get("to") ?? "",
    date_field: (get("date_field") ?? "applied_at") as NonNullable<JobFilters["date_field"]>,
    sort: get("sort") ?? "updated_at",
    order: (get("order") === "asc" ? "asc" : "desc") as "asc" | "desc",
    page: Math.max(Number(get("page")) || 1, 1),
  };

  const filters: JobFilters = {
    q: params.q || undefined,
    status: params.status,
    location: params.location || undefined,
    work_mode: params.work_mode || undefined,
    source: params.source || undefined,
    tag: params.tag || undefined,
    date_field: params.date_field,
    ...resolveRange(params.range, params.from || undefined, params.to || undefined),
  };

  try {
    const [list, stats] = await Promise.all([
      listJobs({ ...filters, sort: params.sort, order: params.order, page: params.page, limit: PAGE_SIZE }),
      getJobStats(filters),
    ]);
    return { jobs: list.data, pagination: list.pagination, stats, params, apiDown: false };
  } catch (err) {
    return {
      jobs: [] as JobDto[],
      pagination: { total: 0, page: 1, limit: PAGE_SIZE, has_next: false } as Pagination,
      stats: null as JobStats | null,
      params,
      apiDown: err instanceof ApiUnreachable,
    };
  }
};
