import { getBase } from "$lib/api";
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ url }) => {
  const baseId = url.searchParams.get("base");
  if (!baseId) return { base: null };
  try {
    const base = await getBase(baseId);
    return { base };
  } catch {
    return { base: null };
  }
};
