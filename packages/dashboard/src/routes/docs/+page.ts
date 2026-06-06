// dashboard/src/routes/docs/+page.ts
import { getSchema, ApiUnreachable } from "$lib/api";
import type { PageLoad } from "./$types";

export const load: PageLoad = async () => {
  try {
    const schema = await getSchema();
    return { schema, apiDown: false };
  } catch (err) {
    return { schema: null, apiDown: err instanceof ApiUnreachable };
  }
};
