// dashboard/src/routes/+layout.ts
import { browser } from "$app/environment";
import { goto } from "$app/navigation";
import { authState, authMe } from "$lib/auth";
import type { LayoutLoad } from "./$types";

export const ssr = false;
export const prerender = false;

export const load: LayoutLoad = async ({ url }) => {
  // Public auth pages skip the gate.
  const path = url.pathname;
  const isAuthPage = path === "/login" || path === "/setup";

  if (!browser) {
    return { apiDown: false, total: 0, authed: false, needsSetup: false, isAuthPage };
  }

  let needsSetup = false;
  let authed = false;
  let apiDown = false;

  try {
    const state = await authState();
    needsSetup = state.needs_setup;
    // `authenticated` from /auth/state is informational; verify with /me when
    // we actually need to know who the user is, since the cookie can outlive
    // the user in edge cases.
    authed = state.authenticated;
  } catch {
    apiDown = true;
  }

  // Decide where to send the user.
  if (!authed && !isAuthPage) {
    const next = encodeURIComponent(url.pathname + url.search);
    if (needsSetup) {
      void goto(`/setup?next=${next}`, { replaceState: true });
    } else {
      void goto(`/login?next=${next}`, { replaceState: true });
    }
  } else if (authed && isAuthPage) {
    void goto("/", { replaceState: true });
  } else if (authed) {
    // Verify with /me so the layout data carries the username.
    try {
      const me = await authMe();
      return { apiDown, total: 0, authed: true, needsSetup, isAuthPage, username: me.username };
    } catch {
      // Session expired between /state and /me — treat as logged out.
      void goto(`/login?next=${encodeURIComponent(path)}`, { replaceState: true });
      return { apiDown, total: 0, authed: false, needsSetup, isAuthPage };
    }
  }

  return { apiDown, total: 0, authed, needsSetup, isAuthPage };
};
