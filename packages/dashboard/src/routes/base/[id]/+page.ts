// dashboard/src/routes/base/[id]/+page.ts
import { error } from "@sveltejs/kit";
import { getBase, listResumes, listTemplates, ApiError, ApiUnreachable } from "$lib/api";
import type { ResumeDto } from "$lib/types";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ params }) => {
  try {
    const [base, childrenRes, templates] = await Promise.all([
      getBase(params.id),
      listResumes({ base_id: params.id, limit: 500 }),
      listTemplates(),
    ]);
    const children = ((childrenRes as { data?: ResumeDto[] }).data || []).sort((a, b) =>
      b.created_at.localeCompare(a.created_at),
    );
    return { base, children, templates, apiDown: false };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) throw error(404, "Base resume not found");
    if (err instanceof ApiUnreachable) throw error(503, "Cannot reach the API — check that it is running.");
    throw err;
  }
};
