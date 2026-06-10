<script lang="ts">
  import "../app.css";
  import { invalidateAll, goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { authLogout } from "$lib/auth";
  import Icon from "$lib/Icon.svelte";
  import NavLoader from "$lib/NavLoader.svelte";
  import type { Snippet } from "svelte";
  import type { LayoutData } from "./$types";

  let { data, children }: { data: LayoutData; children: Snippet } = $props();

  let navOpen = $state(false);
  const close = () => (navOpen = false);

  async function signOut() {
    try {
      await authLogout();
    } catch {
      // best effort
    }
    await invalidateAll();
    await goto("/login", { replaceState: true });
  }

  // Editor pages expand flush to fill the main content area (no padding, no max-width).
  const editor = $derived(
    $page.url.pathname.startsWith("/resume/") ||
    $page.url.pathname.startsWith("/create-base") ||
    /^\/base\/[^/]+\/new/.test($page.url.pathname)
  );
  // Resumes browsing (overview + inside a base folder) keeps the nav highlighted
  // and the constrained content width.
  const onResumes = $derived($page.url.pathname === "/" || $page.url.pathname.startsWith("/base/"));
  const onDocs = $derived($page.url.pathname === "/docs");
  const onApiKeys = $derived($page.url.pathname === "/api-keys");
  const isAuthPage = $derived($page.url.pathname === "/login" || $page.url.pathname === "/setup");
  // Auth pages render the slot naked (no sidebar, no top bar).
  const showShell = $derived(!isAuthPage);
  // Pages that render inside the centered, max-width content column.
  // NB: written as an explicit branch rather than `(onResumes || onDocs) && !editor`
  // because the Svelte compiler drops the outer parens, which flips the meaning to
  // `onResumes || (onDocs && !editor)` and leaks editor pages into the constrained column.
  const constrained = $derived.by(() => {
    if (editor) return false;
    return onResumes || onDocs || onApiKeys;
  });

  const settingsItems = [
    { label: "Profile", icon: "user" },
    { label: "Preferences", icon: "settings" },
    { label: "Authentication", icon: "lock" },
    { label: "Integrations", icon: "plug" },
    { label: "Danger Zone", icon: "alert", danger: true },
  ] as const;
</script>

{#snippet brand()}
  <div class="brand">
    <span class="brand-name">apimyresume</span>
  </div>
{/snippet}

<NavLoader />

{#if showShell}
  <div class="app">
    <!-- Mobile top bar -->
    <header class="topbar">
      <button class="icon-btn" aria-label="Open menu" onclick={() => (navOpen = true)}>
        <Icon name="menu" size={20} />
      </button>
      {@render brand()}
    </header>

    {#if navOpen}
      <button class="backdrop" aria-label="Close menu" onclick={close}></button>
    {/if}

    <aside class="sidebar" class:open={navOpen}>
      {@render brand()}

      <div class="nav-section">App</div>
      <a class="nav-item" class:active={onResumes} href="/" onclick={close}>
        <Icon name="file-text" size={17} />
        <span class="label">Resumes</span>
        <span class="count">{data.total}</span>
      </a>
      <a class="nav-item" class:active={onDocs} href="/docs" onclick={close}>
        <Icon name="book-open" size={17} />
        <span class="label">API docs</span>
      </a>

      <div class="nav-section">Settings</div>
      <a class="nav-item" class:active={onApiKeys} href="/api-keys" onclick={close}>
        <Icon name="key" size={17} />
        <span class="label">API Keys</span>
      </a>
      {#each settingsItems as item (item.label)}
        <span class="nav-item disabled" class:danger={"danger" in item && item.danger}>
          <Icon name={item.icon} size={17} />
          <span class="label">{item.label}</span>
          <span class="soon">soon</span>
        </span>
      {/each}

      <div class="nav-spacer"></div>
      <button class="nav-item sign-out" type="button" onclick={signOut} aria-label="Sign out">
        <Icon name="log-out" size={17} />
        <span class="label">Sign out</span>
      </button>
      <div class="credits">Built with <Icon name="heart" size={14} /> by <span>Ajinkya Gokhale</span></div>
    </aside>

    <main class="main" class:constrained={constrained} class:editor={editor}>
      {@render children()}
    </main>
  </div>
{:else}
  {@render children()}
{/if}

<style>
  .credits {
    display: flex;
    align-items: center;
    gap: 5px;
    white-space: nowrap;
    padding: 14px 12px 6px;
    font-size: 13px;
    line-height: 1.4;
    color: var(--muted);
    border-top: 1px solid var(--divider);
    margin-top: 4px;
  }

  .credits span {
    color: var(--text);
  }

  .credits :global(.icon) {
    color: var(--text);
    flex-shrink: 0;
  }

  .sign-out {
    background: transparent;
    border: none;
    text-align: left;
    width: 100%;
    cursor: pointer;
    color: var(--text-soft);
    margin-top: 2px;
  }
  .sign-out:hover {
    background: var(--surface-2);
    color: var(--text);
  }
</style>
