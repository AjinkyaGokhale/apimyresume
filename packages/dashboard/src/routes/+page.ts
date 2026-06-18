// dashboard/src/routes/+page.ts
import { listResumes, listBases, getTemplates, ApiUnreachable } from "$lib/api";
import type { ResumeDto, Stat } from "$lib/types";
import type { PageLoad } from "./$types";

const DAY = 86_400_000;

function computeStats(resumes: ResumeDto[]): Stat[] {
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const todayMs = startToday.getTime();
  const now = Date.now();

  let today = 0;
  let yesterday = 0;
  let week = 0;
  const companies = new Set<string>();
  const templates = new Set<string>();

  for (const r of resumes) {
    const t = new Date(r.created_at).getTime();
    if (t >= todayMs) today++;
    else if (t >= todayMs - DAY) yesterday++;
    if (t >= now - 7 * DAY) week++;
    if (r.company) companies.add(r.company);
    templates.add(r.template);
  }

  const todayDelta = today - yesterday;
  const todayPct = yesterday > 0 ? Math.round((todayDelta / yesterday) * 100) : today > 0 ? 100 : 0;
  const weekPct = resumes.length > 0 ? Math.round((week / resumes.length) * 100) : 0;
  const signed = (n: number, pct: number): Pick<Stat, "delta" | "dir" | "plain"> =>
    n === 0 ? {} : { delta: `${pct}%`, dir: n > 0 ? "up" : "down", plain: true };

  return [
    { label: "Total resumes", value: resumes.length, ...(week > 0 ? { delta: `${weekPct}%`, dir: "up", plain: true } : {}) },
    { label: "Created today", value: today, ...signed(todayDelta, todayPct) },
    { label: "Companies", value: companies.size },
    { label: "Templates", value: templates.size },
  ];
}

export const load: PageLoad = async ({ url }) => {
  const company = url.searchParams.get("company") ?? undefined;
  const tag = url.searchParams.get("tag") ?? undefined;

  try {
    const [resumesRes, basesRes, templatesRes] = await Promise.all([
      listResumes({ company, tag, limit: 500 }),
      listBases(),
      getTemplates(),
    ]);
    const resumes = (resumesRes as { data?: ResumeDto[] }).data || [];
    const bases = Array.isArray(basesRes) ? basesRes : [];
    const templates = Array.isArray(templatesRes) ? templatesRes : [];
    resumes.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { resumes, stats: computeStats(resumes), bases, templates, company, tag, apiDown: false };
  } catch (err) {
    return {
      resumes: [] as ResumeDto[],
      stats: [] as Stat[],
      bases: [],
      templates: [],
      company,
      tag,
      apiDown: err instanceof ApiUnreachable,
    };
  }
};
