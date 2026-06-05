<script lang="ts">
  import { navigating } from "$app/stores";
  import { untrack } from "svelte";
  import { fade } from "svelte/transition";
  import Icon from "$lib/Icon.svelte";

  /**
   * Route-transition overlay (UX). Shows a calm fade + spinner when opening a
   * resume detail or navigating back from one. The overlay reflects the real
   * SvelteKit load but stays on screen for at least MIN_VISIBLE so quick
   * navigations still feel intentional instead of flashing.
   */
  const MIN_VISIBLE = 400; // ms the spinner is held before it fades back out

  let visible = $state(false);
  let shownAt = 0;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  type Nav = NonNullable<typeof $navigating>;

  /** Only animate resume open / back — not sidebar or other navigations. */
  function qualifies(nav: Nav): boolean {
    const to = nav.to?.url.pathname ?? "";
    const from = nav.from?.url.pathname ?? "";
    return to.startsWith("/resume/") || from.startsWith("/resume/");
  }

  $effect(() => {
    const nav = $navigating;
    // untrack the state reads/writes so $navigating is the only dependency and
    // we don't retrigger this effect by toggling `visible`.
    untrack(() => {
      if (nav && qualifies(nav)) {
        if (hideTimer) {
          clearTimeout(hideTimer);
          hideTimer = null;
        }
        if (!visible) {
          visible = true;
          shownAt = Date.now();
        }
      } else if (!nav && visible) {
        const remaining = Math.max(0, MIN_VISIBLE - (Date.now() - shownAt));
        hideTimer = setTimeout(() => {
          visible = false;
          hideTimer = null;
        }, remaining);
      }
    });
  });

  $effect(() => () => {
    if (hideTimer) clearTimeout(hideTimer);
  });
</script>

{#if visible}
  <!-- Appears instantly so it masks the page swap (no flash of the destination),
       then fades out smoothly once the minimum hold has elapsed. -->
  <div class="nav-loader" out:fade={{ duration: 200 }} role="status" aria-live="polite">
    <span class="spinner"><Icon name="refresh" size={28} /></span>
    <span class="msg">Loading…</span>
  </div>
{/if}

<style>
  /* Covers only the content column — the sidebar stays visible so the app
     shell never disappears, which feels far more natural than a full blackout. */
  .nav-loader {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    left: var(--sidebar-w);
    z-index: 200;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    background: var(--canvas);
    color: var(--muted);
  }

  /* On mobile the sidebar is an off-canvas drawer, so cover the full width. */
  @media (max-width: 860px) {
    .nav-loader {
      left: 0;
    }
  }

  .spinner {
    display: inline-flex;
    color: var(--accent);
    animation: nav-spin 0.8s linear infinite;
  }

  .msg {
    font-size: 13.5px;
    font-weight: 500;
    letter-spacing: 0.01em;
  }

  @keyframes nav-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation: none;
    }
  }
</style>
