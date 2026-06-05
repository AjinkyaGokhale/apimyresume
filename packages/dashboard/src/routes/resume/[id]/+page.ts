// dashboard/src/routes/resume/[id]/+page.ts
import { error } from "@sveltejs/kit";
import { getResume, expandResume, ApiError } from "$lib/api";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ params }) => {
  try {
    const [resume, merged] = await Promise.all([getResume(params.id), expandResume(params.id)]);
    return { resume, merged };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) throw error(404, "Resume not found");
    throw err;
  }
};
