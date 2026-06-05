// dashboard/src/routes/+layout.ts
import { health, listResumes, ApiUnreachable } from "$lib/api";
import type { LayoutLoad } from "./$types";

export const ssr = false;
export const prerender = false;

export const load: LayoutLoad = async () => {
  try {
    await health();
    const { pagination } = await listResumes({ limit: 1 });
    return { apiDown: false, total: pagination.total };
  } catch (err) {
    return { apiDown: err instanceof ApiUnreachable, total: 0 };
  }
};
