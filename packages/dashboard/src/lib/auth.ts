// dashboard/src/lib/auth.ts
// Session-cookie auth helpers (setup / login / logout / state / me).
// The browser stores the session in an httpOnly cookie set by the API; the
// browser never sees or sends the long-lived API key. Use `apiAuthed` for
// requests that need to ride the session cookie explicitly.

import { getApiUrl } from "./api";

export interface AuthState {
  needs_setup: boolean;
  authenticated: boolean;
}

async function send<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${getApiUrl()}/api/v1${path}`, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const authState = () => send<AuthState>("/auth/state");
export const authMe = () => send<{ username: string }>("/auth/me");
export const authSetup = (username: string, password: string) =>
  send<{ username: string }>("/auth/setup", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
export const authLogin = (username: string, password: string) =>
  send<{ username: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
export const authLogout = () => send<void>("/auth/logout", { method: "POST" });
