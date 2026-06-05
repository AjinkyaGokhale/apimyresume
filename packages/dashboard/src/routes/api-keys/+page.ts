import { getApiKey, getApiUrl, ApiError } from "$lib/api";
import type { PageLoad } from "./$types";

export interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
}

export const load: PageLoad = async () => {
  try {
    const res = await fetch(`${getApiUrl()}/api/v1/api-keys`, {
      headers: { "X-API-Key": getApiKey() },
    });
    if (!res.ok) throw new ApiError("Failed to load keys", res.status);
    const keys: ApiKeyRecord[] = await res.json();
    return { keys };
  } catch {
    return { keys: [] as ApiKeyRecord[] };
  }
};
