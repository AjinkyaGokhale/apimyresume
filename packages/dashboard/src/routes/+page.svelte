<script lang="ts">
  import { goto, invalidateAll } from "$app/navigation";
  import { page } from "$app/stores";
  import { deleteBase, getPublicApiUrl } from "$lib/api";
  import Icon from "$lib/Icon.svelte";
  import StatsBar from "$lib/StatsBar.svelte";
  import type { ResumeDto } from "$lib/types";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let search = $state($page.url.searchParams.get("q") || "");
  let searchFocused = $state(false);

  // Autocomplete suggestions from companies, roles, tags
  const suggestions = $derived.by(() => {
    const comps = new Set(data.resumes.map(r => r.company).filter((c): c is string => Boolean(c)));
    const roles = new Set(data.resumes.map(r => r.role).filter((r): r is string => Boolean(r)));
    const allTags = new Set(data.resumes.flatMap(r => r.tags || []));
    return [...comps, ...roles, ...allTags].filter(s => typeof s === "string").sort();
  });

  const filteredSuggestions = $derived(
    search.trim() && searchFocused
      ? suggestions.filter(s => s.toLowerCase().includes(search.toLowerCase())).slice(0, 6)
      : []
  );
  let view = $state<"grid" | "list">($page.url.searchParams.get("view") === "list" ? "list" : "grid");
  let sort = $state<"newest" | "oldest" | "company">(
    ($page.url.searchParams.get("sort") as "newest" | "oldest" | "company") || "newest"
  );
  let pageLimit = $state<50 | 100>(Number($page.url.searchParams.get("limit")) === 100 ? 100 : 50);
  let currentPage = $state(1);

  let openBaseMenu = $state<string | null>(null);

  // Group resumes (filtered by search) under their base, keeping every base
  // even when it has no matching children.
  const resumesByBase = $derived(() => {
    const grouped = new Map<string, { base: typeof data.bases[0], children: ResumeDto[] }>();

    // First, add all bases (even those with no children)
    for (const base of data.bases || []) {
      grouped.set(base.id, { base, children: [] });
    }

    // Then, group resumes under their bases
    for (const resume of filtered) {
      if (grouped.has(resume.base_id)) {
        grouped.get(resume.base_id)!.children.push(resume);
      }
    }

    return grouped;
  });

  // Sorted folder list. When searching, keep a folder only if its name/template
  // matches or it contains a matching child (children are already search-filtered).
  const sortedBases = $derived(() => {
    const q = search.trim().toLowerCase();
    const entries = Array.from(resumesByBase().values()).filter(({ base, children }) => {
      if (!q) return true;
      const baseHit = [base.name, base.template, base.id].some((v) => String(v ?? "").toLowerCase().includes(q));
      return baseHit || children.length > 0;
    });
    if (sort === "company")
      entries.sort((a, b) => (a.base.name ?? "~").localeCompare(b.base.name ?? "~"));
    else if (sort === "oldest")
      entries.sort((a, b) => new Date(a.base.updated_at).getTime() - new Date(b.base.updated_at).getTime());
    else
      entries.sort((a, b) => new Date(b.base.updated_at).getTime() - new Date(a.base.updated_at).getTime());
    return entries;
  });

  // Pagination for bases (folders)
  const paginatedBases = $derived(() => {
    const all = sortedBases();
    const start = (currentPage - 1) * pageLimit;
    const end = start + pageLimit;
    return all.slice(start, end);
  });

  const totalBasePages = $derived(Math.max(1, Math.ceil(sortedBases().length / pageLimit)));

  // Reset to page 1 when search, sort, or page limit changes
  $effect(() => {
    if (search || sort || pageLimit) {
      currentPage = 1;
    }
  });

  // Persist view/sort/limit to URL for shareable/bookmarkable state
  $effect(() => {
    const url = new URL($page.url);
    if (view !== "grid") url.searchParams.set("view", view);
    else url.searchParams.delete("view");
    if (sort !== "newest") url.searchParams.set("sort", sort);
    else url.searchParams.delete("sort");
    if (pageLimit !== 50) url.searchParams.set("limit", String(pageLimit));
    else url.searchParams.delete("limit");
    if (search) url.searchParams.set("q", search);
    else url.searchParams.delete("q");

    // Only update if actually changed (avoid loops)
    const newUrl = url.toString();
    if (newUrl !== $page.url.toString()) {
      window.history.replaceState({}, "", newUrl);
    }
  });

  const filtered = $derived(
    data.resumes.filter((r) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return [r.company, r.role, r.template, ...r.tags]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    }),
  );

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

  // The base resume rendered to SVG — same render path as a child's thumbnail.
  const baseThumb = (id: string) => `${getPublicApiUrl()}/api/v1/bases/${id}/thumbnail.svg`;
</script>

<div class="home-container">
<div class="page-head">
  <div class="page-heading">
    <h1 class="page-title">Overview</h1>
    <p class="page-subline">Browse and manage resumes. Create base resumes here, child resumes via API.</p>
  </div>
  <button id="new-resume-btn" class="btn red new-resume" onclick={() => goto('/create-base')}>
    <Icon name="plus" size={16} /> New Base Resume
  </button>
</div>

{#if !data.apiDown && data.stats.length}
  <StatsBar stats={data.stats} />
{/if}

<div class="toolbar">
  <div class="search-wrap">
    <label class="search">
      <Icon name="search" size={17} />
      <input
        placeholder="Search company, role, tag…"
        bind:value={search}
        onfocus={() => searchFocused = true}
        onblur={() => setTimeout(() => searchFocused = false, 150)}
      />
    </label>
    {#if filteredSuggestions.length > 0}
      <ul class="autocomplete">
        {#each filteredSuggestions as suggestion}
          <button type="button" class="autocomplete-item"
            onclick={() => { search = suggestion; searchFocused = false; }}
          >
            {suggestion}
          </button>
        {/each}
      </ul>
    {/if}
  </div>
  <div class="toolbar-group">
    <select class="select" bind:value={sort} aria-label="Sort resumes">
      <option value="newest">Newest</option>
      <option value="oldest">Oldest</option>
      <option value="company">Company A–Z</option>
    </select>
    <div class="view-toggle" role="group" aria-label="View mode">
      <button class:active={view === "grid"} onclick={() => (view = "grid")} aria-label="Grid view" title="Grid view">
        <Icon name="grid" size={17} />
      </button>
      <button class:active={view === "list"} onclick={() => (view = "list")} aria-label="List view" title="List view">
        <Icon name="list" size={17} />
      </button>
    </div>
  </div>
</div>

{#if data.apiDown}
  <div class="banner">
    <Icon name="alert" size={18} />
    Cannot reach the API — check that it is running.
  </div>
{/if}

{#if !data.bases?.length}
  <!-- Onboarding hero -->
  <div class="onboarding-hero">
    <div class="hero-content">
      <span class="hero-icon"><Icon name="file-text" size={48} /></span>
      <h2 class="hero-title">No Base Resume Found</h2>
      <p class="hero-text">
        Create your first base resume to get started. A base resume is your canonical profile
        that contains your complete professional history. All tailored resumes derive from it.
      </p>
    </div>
  </div>
{:else}
  <!-- Folder list: each base resume is a folder you open -->
  <div class="results-info">
    <span>{sortedBases().length} base resume{sortedBases().length === 1 ? '' : 's'} <span class="text-muted">({filtered.length} child{filtered.length === 1 ? '' : 'ren'} total)</span></span>

    <div class="results-controls">
      {#if totalBasePages > 1}
        <div class="pager">
          <button
            class="page-btn"
            disabled={currentPage === 1}
            onclick={() => currentPage = Math.max(1, currentPage - 1)}
            aria-label="Previous page"
          >
            <Icon name="chevron-left" size={15} />
          </button>
          <span class="pager-status">Page {currentPage} / {totalBasePages}</span>
          <button
            class="page-btn"
            disabled={currentPage === totalBasePages}
            onclick={() => currentPage = Math.min(totalBasePages, currentPage + 1)}
            aria-label="Next page"
          >
            <Icon name="chevron-right" size={15} />
          </button>
        </div>
      {/if}
      <select class="select" bind:value={pageLimit} aria-label="Items per page">
        <option value={50}>50 / page</option>
        <option value={100}>100 / page</option>
      </select>
    </div>
  </div>

  {#if sortedBases().length === 0}
    <div class="empty">
      <span class="empty-icon"><Icon name="inbox" size={26} /></span>
      <span>No base resumes match your search.</span>
    </div>
  {:else}
    <!-- Folders: a base renders just like its children; click to go inside. -->
    <div class:grid={view === "grid"} class:list={view === "list"}>
      {#each paginatedBases() as { base, children } (base.id)}
        <div
          class="card folder-card"
          role="button"
          tabindex="0"
          onclick={() => goto(`/base/${base.id}`)}
          onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && goto(`/base/${base.id}`)}
        >
          <button
            class="kebab"
            aria-label="Base actions"
            title="Base actions"
            onclick={(e) => {
              e.stopPropagation();
              openBaseMenu = openBaseMenu === base.id ? null : base.id;
            }}
          >
            <Icon name="more-vertical" size={18} />
          </button>

          <div class="thumb">
            <img
              src={baseThumb(base.id)}
              alt=""
              loading="lazy"
              onerror={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = "hidden")}
            />
          </div>

          <div class="card-body">
            <div class="card-name">
              <span class="base-pill"><Icon name="folder" size={11} /> Base</span>
              <span class="folder-id">{base.id}</span>
            </div>
            <div class="card-date">
              {base.template} · {children.length} child{children.length === 1 ? '' : 'ren'}
            </div>
          </div>

          <!-- Base actions menu -->
          {#if openBaseMenu === base.id}
            <div class="menu" role="menu">
              <button class="menu-item" onclick={(e) => { e.stopPropagation(); goto(`/create-base?base=${base.id}`); openBaseMenu = null; }}>
                <Icon name="edit" size={15} /> Edit base resume
              </button>
              <form
                onsubmit={async (e) => {
                  e.preventDefault();
                  const msg = children.length > 0
                    ? `Delete base "${base.id}" and all ${children.length} child resume${children.length === 1 ? '' : 's'}? This cannot be undone.`
                    : `Delete base "${base.id}"? This cannot be undone.`;
                  if (!confirm(msg)) return;
                  openBaseMenu = null;
                  await deleteBase(base.id, true);
                  await invalidateAll();
                }}
              >
                <button class="menu-item danger" onclick={(e) => e.stopPropagation()}>
                  <Icon name="trash" size={15} /> Delete base resume
                </button>
              </form>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

{/if}

{#if openBaseMenu}
  <button class="menu-overlay" aria-label="Close menu" onclick={() => { openBaseMenu = null; }}></button>
{/if}

</div>

<style>
  .home-container {
    max-width: 1240px;
    margin-inline: auto;
  }

  /* Folder cards: a base resume styled like its child resume cards. */
  .folder-card {
    cursor: pointer;
  }

  .folder-card .card-name {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .folder-id {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* "Base" tag sits inline next to the id, in the card body. */
  .base-pill {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 7px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
  }

  .text-muted {
    color: var(--muted);
    font-weight: normal;
  }

  .page-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    margin: 8px 0 16px 0;
    padding: 0 6px;
  }

  .page-title {
    font-size: 18px;
    font-weight: 700;
    margin: 0;
    color: var(--text);
  }

  .page-subline {
    font-size: 13px;
    color: var(--muted);
    margin: 4px 0 0;
  }

  .btn.red.new-resume {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--accent);
    border: 1px solid var(--accent);
    color: var(--accent-contrast);
    padding: 7px 14px;
    border-radius: var(--radius-sm);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.12s;
  }

  .btn.red.new-resume:hover {
    background: var(--accent-hover);
    border-color: var(--accent-hover);
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 6px 16px;
    flex-wrap: wrap;
  }

  .search-wrap {
    position: relative;
    flex: 1 1 260px;
  }

  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 7px 12px;
    width: 100%;
  }

  .search input {
    flex: 1;
    border: none;
    background: transparent;
    color: var(--text);
    font-size: 13px;
    outline: none;
  }

  .search input::placeholder {
    color: var(--text-soft);
  }

  .autocomplete {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    list-style: none;
    margin: 0;
    padding: 4px;
    z-index: 30;
    box-shadow: var(--shadow-md);
  }

  .autocomplete-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: 8px 10px;
    border-radius: var(--radius-xs);
    cursor: pointer;
    border: none;
    background: transparent;
    color: var(--text);
    font-size: 13px;
  }

  .autocomplete-item:hover {
    background: var(--surface-2);
  }

  .toolbar-group {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
  }

  .select {
    appearance: none;
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 7px 28px 7px 12px;
    border-radius: var(--radius-sm);
    font-size: 13px;
    cursor: pointer;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a8f98' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 8px center;
  }

  .view-toggle {
    display: flex;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .view-toggle button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 34px;
    background: var(--surface);
    border: none;
    color: var(--text-soft);
    cursor: pointer;
    transition: all 0.12s;
  }

  .view-toggle button.active {
    background: var(--surface-2);
    color: var(--text);
  }

  .view-toggle button:hover:not(.active) {
    background: var(--surface-2);
    color: var(--text);
  }

  .banner {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 6px 14px;
    padding: 10px 12px;
    background: var(--badge-red-bg);
    border: 1px solid var(--badge-red-border);
    color: var(--badge-red-text);
    border-radius: var(--radius-sm);
    font-size: 13px;
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 64px 24px;
    color: var(--muted);
    text-align: center;
  }

  .empty.onboarding {
    padding: 48px 24px;
  }

  .empty-icon {
    color: var(--border-strong);
  }

  .empty-icon.large :global(.icon) {
    width: 48px;
    height: 48px;
  }

  .empty h2 {
    font-size: 18px;
    font-weight: 600;
    margin: 8px 0 4px;
    color: var(--text);
  }

  .empty-sub {
    font-size: 14px;
    color: var(--text-soft);
    margin: 0 0 16px;
    max-width: 320px;
  }

  /* Onboarding Hero with Integrated Tour */
  .onboarding-hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    padding: 48px 24px;
    text-align: center;
  }

  .hero-content {
    max-width: 600px;
    animation: hero-fade-in 0.5s ease;
  }

  .hero-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 96px;
    height: 96px;
    border-radius: 24px;
    background: linear-gradient(135deg, var(--surface-2), var(--surface-3));
    border: 1px solid var(--border);
    color: var(--accent);
    margin-bottom: 24px;
  }

  .hero-icon :global(.icon) {
    width: 48px;
    height: 48px;
  }

  .hero-title {
    font-size: 32px;
    font-weight: 700;
    margin: 0 0 16px;
    color: var(--text);
    letter-spacing: -0.02em;
  }

  .hero-text {
    font-size: 16px;
    line-height: 1.6;
    color: var(--text-soft);
    margin: 0 0 32px;
  }

  .hero-text strong {
    color: var(--text);
    font-weight: 600;
  }

  @keyframes hero-fade-in {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @media (max-width: 860px) {
    .hero-title {
      font-size: 26px;
    }
    .hero-text {
      font-size: 15px;
    }
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text-soft);
    padding: 7px 14px;
    border-radius: var(--radius-sm);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.12s;
    text-decoration: none;
  }

  .btn:hover:not(:disabled) {
    background: var(--surface-2);
    border-color: var(--border-strong);
    color: var(--text);
  }

  .btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .btn.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-contrast);
  }

  .btn.primary:hover:not(:disabled) {
    background: var(--accent-hover);
    border-color: var(--accent-hover);
  }

  .results-info {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    padding: 0 6px 12px;
    font-size: 13px;
    color: var(--muted);
  }

  .results-controls {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .pager {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .pager-status {
    font-size: 13px;
    color: var(--muted);
    white-space: nowrap;
    min-width: 78px;
    text-align: center;
  }

  .menu {
    position: absolute;
    top: 40px;
    right: 8px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-lg);
    z-index: 20;
    min-width: 160px;
    padding: 4px;
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 12px;
    border: none;
    background: transparent;
    color: var(--text);
    font-size: 13px;
    cursor: pointer;
    border-radius: var(--radius-xs);
  }

  .menu-item:hover:not(:disabled) {
    background: var(--surface-2);
  }

  .menu-item:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .menu-overlay {
    position: fixed;
    inset: 0;
    background: transparent;
    z-index: 5;
    cursor: default;
    border: none;
  }

  .page-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text-soft);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 0.12s;
  }

  .page-btn:hover:not(:disabled) {
    background: var(--surface-2);
    border-color: var(--border-strong);
    color: var(--text);
  }

  .page-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Modal styles */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
  }

  .modal {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-xl);
    width: 90%;
    max-width: 520px;
    max-height: 90vh;
    overflow: auto;
  }

  .modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
  }

  .modal-title {
    font-size: 16px;
    font-weight: 600;
  }

  .btn.ghost-icon {
    background: transparent;
    border: none;
    padding: 6px;
    width: 32px;
    height: 32px;
  }

  .modal-body {
    padding: 20px;
  }

  .form-section {
    margin-bottom: 16px;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .form-label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--text);
    margin-bottom: 6px;
  }

  .form-select {
    width: 100%;
  }

  .form-input {
    width: 100%;
    padding: 8px 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text);
    font-size: 13px;
    box-sizing: border-box;
  }

  .form-input:focus {
    outline: none;
    border-color: var(--accent);
  }

  .form-input::placeholder {
    color: var(--text-soft);
  }

  .form-hint {
    font-size: 12px;
    margin-top: 6px;
  }

  .form-hint.warn {
    color: var(--badge-red-text);
  }

  .modal-foot {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 16px 20px;
    border-top: 1px solid var(--border);
  }
</style>
