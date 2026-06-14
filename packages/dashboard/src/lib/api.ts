// dashboard/src/lib/api.ts
import type { Pagination, ResumeDto } from "$lib/types";

/** Reads bootstrap config injected by the Hono server into index.html. Falls back to Vite env vars for local dev. */
export function getApiKey(): string {
  return window.__BOOTSTRAP__?.apiKey ?? import.meta.env.VITE_API_KEY ?? "";
}

/** Base URL for API calls. Falls back to current origin so copied URLs are always absolute. */
export function getApiUrl(): string {
  const configured = window.__BOOTSTRAP__?.apiUrl ?? import.meta.env.VITE_API_URL ?? "";
  return configured || window.location.origin;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export class ApiUnreachable extends Error {}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${getApiUrl()}/api/v1${path}`, {
      ...init,
      // Ride the httpOnly session cookie alongside the optional API key —
      // required for the dev server, which runs on a different origin.
      credentials: "include",
      headers: { "X-API-Key": getApiKey(), ...(init.headers ?? {}) },
    });
  } catch (err) {
    throw new ApiUnreachable(String(err));
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError((body as { error?: string }).error ?? res.statusText, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function listResumes(params: {
  company?: string;
  tag?: string;
  base_id?: string;
  page?: number;
  limit?: number;
}): Promise<{ data: ResumeDto[]; pagination: Pagination }> {
  const q = new URLSearchParams();
  if (params.company) q.set("company", params.company);
  if (params.tag) q.set("tag", params.tag);
  if (params.base_id) q.set("base_id", params.base_id);
  q.set("limit", String(params.limit ?? 200));
  q.set("page", String(params.page ?? 1));
  return api<{ data: ResumeDto[]; pagination: Pagination }>(`/resumes?${q.toString()}`);
}

export const getResume = (id: string) => api<ResumeDto>(`/resumes/${id}`);
export const expandResume = (id: string) => api<Record<string, unknown>>(`/resumes/${id}?expand=true`);
export const regenerate = (id: string) => api<ResumeDto>(`/resumes/${id}/regenerate`, { method: "POST" });
export const deleteResume = (id: string) => api<void>(`/resumes/${id}`, { method: "DELETE" });
export const health = () => api<{ status: string }>("/health");

/** Full base-resume shape returned by GET /bases/:id — distinct from the list-view BaseDto in $lib/types. */
export interface BaseDto {
  id: string;
  name?: string;
  template: string;
  template_lock?: boolean;
  updated_at: string;
  data?: Record<string, unknown>;
}

export interface TemplateDto {
  id: string;
  name: string;
  description?: string;
  thumbnail_url: string;
  paper_size?: string;
  engine: string;
}

export interface SchemaProp {
  type?: string;
  description?: string;
  example?: unknown;
  enum?: string[];
  default?: unknown;
  properties?: Record<string, SchemaProp>;
  items?: SchemaProp;
  required?: string[];
}

export interface ApiEndpoint {
  method: string;
  path: string;
  summary: string;
  auth?: string;
  content_type?: string;
  body?: string;
  notes?: string[];
  example?: { request?: unknown };
  returns?: unknown;
}

export interface SchemaDoc {
  name: string;
  description: string;
  parameters: SchemaProp;
  input_schema?: SchemaProp;
  "x-aliases"?: Record<string, string[]>;
  endpoints?: ApiEndpoint[];
  child_endpoints?: ApiEndpoint[];
}

export const getSchema = () => api<SchemaDoc>("/schema");

export const getBase = (id: string) => api<BaseDto>(`/bases/${id}`);
export const listBases = () => api<BaseDto[]>("/bases");
export const listTemplates = () => api<TemplateDto[]>("/templates");
export const createBase = (payload: unknown) =>
  api<BaseDto>("/bases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
export const deleteBase = (id: string, cascade = false) =>
  api<void>(`/bases/${id}${cascade ? "?cascade=true" : ""}`, { method: "DELETE" });

export interface CreateResumePayload {
  base_id: string;
  template?: string;
  company?: string;
  role?: string;
  tags?: string[];
  overrides?: Record<string, unknown>;
}

export const createResume = (payload: CreateResumePayload | Record<string, unknown>) =>
  api<ResumeDto>("/resumes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

/** Alias for getApiUrl — use for loading public PDFs and thumbnails. */
export const getPublicApiUrl = getApiUrl;
