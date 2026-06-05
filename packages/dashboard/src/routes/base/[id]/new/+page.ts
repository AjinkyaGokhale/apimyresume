// dashboard/src/routes/base/[id]/new/+page.ts
import { error } from "@sveltejs/kit";
import { getBase, listTemplates, ApiError, ApiUnreachable } from "$lib/api";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ params }) => {
  try {
    const [base, templates] = await Promise.all([getBase(params.id), listTemplates()]);
    return { base, templates };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) throw error(404, "Base resume not found");
    if (err instanceof ApiUnreachable) throw error(503, "Cannot reach the API — check that it is running.");
    throw err;
  }
};
