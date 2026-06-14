<script lang="ts">
  import { goto, invalidateAll } from "$app/navigation";
  import { page } from "$app/stores";
  import Icon from "$lib/Icon.svelte";
  import { regenerate, deleteResume, getPublicApiUrl } from "$lib/api";
  import type { ResumeDto } from "$lib/types";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const publicApiUrl = getPublicApiUrl();

  const profile = $derived((data.base.data?.profile ?? {}) as Record<string, unknown>);
  const profileLinks = $derived((profile.links ?? {}) as Record<string, string>);

  let view = $state<"grid" | "list">($page.url.searchParams.get("view") === "list" ? "list" : "grid");
  let busy = $state<string | null>(null);
  let openMenu = $state<string | null>(null);
  let toast = $state<string | null>(null);

  function showToast(msg: string) {
    toast = msg;
    setTimeout(() => (toast = null), 1500);
  }

  // A single, un-highlighted resume name (company + role if present).
  const resumeName = (r: ResumeDto) =>
    [r.company, r.role].filter(Boolean).join(" · ") || r.template;

  // Thumbnail is the actual rendered resume (SVG), not a static template image.
  // The `version` cache-buster forces a refetch after each recompile so the card
  // always shows the last compiled resume.
  const thumb = (r: ResumeDto) =>
    `${publicApiUrl}/api/v1/resumes/${r.id}/thumbnail.svg?v=${r.version}`;

  async function copyPdf(r: ResumeDto) {
    if (!r.pdf_url) return;
    await navigator.clipboard.writeText(`${publicApiUrl}${r.pdf_url}`);
    showToast("PDF link copied");
  }

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
</script>

<svelte:window onclick={() => (openMenu = null)} />

<div class="folder-page">
  <!-- Breadcrumb / back -->
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <a class="crumb" href="/"><Icon name="chevron-left" size={15} /> Overview</a>
    <span class="crumb-sep">/</span>
    <span class="crumb current">{data.base.name || "Unnamed Base"}</span>
  </nav>

  <!-- Folder header -->
  <header class="folder-head">
    <div class="folder-title">
      <span class="folder-icon"><Icon name="folder-open" size={26} /></span>
      <div class="folder-meta">
        <h1>{data.base.name || "Unnamed Base"}</h1>
        <p>
          {data.base.template} <span class="divider">•</span>
          {data.children.length} child{data.children.length === 1 ? "" : "ren"}
          <span class="divider">•</span>
          Updated {fmtDate(data.base.updated_at)}
        </p>
      </div>
    </div>
    <div class="folder-actions">
      <button class="btn ghost" onclick={() => goto(`/create-base?base=${data.base.id}`)}>
        <Icon name="edit" size={15} /> Edit base
      </button>
      <button class="btn red" onclick={() => goto(`/base/${data.base.id}/new`)}>
        <Icon name="plus" size={15} /> New resume
      </button>
      <div class="view-toggle" role="group" aria-label="View mode">
        <button class:active={view === "grid"} onclick={() => (view = "grid")} aria-label="Grid view" title="Grid view">
          <Icon name="grid" size={17} />
        </button>
        <button class:active={view === "list"} onclick={() => (view = "list")} aria-label="List view" title="List view">
          <Icon name="list" size={17} />
        </button>
      </div>
    </div>
  </header>

  {#if profile.name}
    <div class="profile-strip">
      <div class="ps-name">
        <span class="ps-fullname">{profile.name}</span>
        {#if profile.title}<span class="ps-title">{profile.title}</span>{/if}
      </div>
      <div class="ps-meta">
        {#if profile.email}<span>{profile.email}</span>{/if}
        {#if profile.phone}<span>{profile.phone}</span>{/if}
        {#if profile.location}<span>{profile.location}</span>{/if}
        {#each Object.values(profileLinks).filter(Boolean) as link}
          <span>{link}</span>
        {/each}
      </div>
    </div>
  {/if}

  {#if data.children.length === 0}
    <div class="empty">
      <span class="empty-icon"><Icon name="inbox" size={26} /></span>
      <span>No child resumes yet.</span>
      <span class="empty-sub">Create a tailored resume on top of this base — here or via the API.</span>
      <button class="btn red" onclick={() => goto(`/base/${data.base.id}/new`)}>
        <Icon name="plus" size={15} /> New resume
      </button>
    </div>
  {:else}
    <div class:grid={view === "grid"} class:list={view === "list"}>
      {#each data.children as r (r.id)}
        <article class="card child-card">
          <button
            class="kebab"
            aria-label="Actions"
            title="Actions"
            onclick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openMenu = openMenu === r.id ? null : r.id;
            }}
          >
            <Icon name="more-vertical" size={18} />
          </button>

          <a class="thumb" href="/resume/{r.id}" aria-label="Open {r.company ?? r.id}">
            <img
              src={thumb(r)}
              alt=""
              loading="lazy"
              onerror={(e) => ((e.currentTarget as HTMLImageElement).style.visibility = "hidden")}
            />
          </a>
          <a class="card-body" href="/resume/{r.id}">
            <div class="card-name">{resumeName(r)}</div>
            <div class="card-date">{fmtDate(r.created_at)}</div>
          </a>

          {#if openMenu === r.id}
            <div class="menu" role="menu">
              <button class="menu-item" onclick={() => { copyPdf(r); openMenu = null; }}>
                <Icon name="link" size={15} /> Copy PDF link
              </button>
              <button
                class="menu-item"
                disabled={busy === r.id}
                onclick={async (e) => {
                  e.stopPropagation();
                  busy = r.id;
                  try {
                    await regenerate(r.id);
                    openMenu = null;
                    showToast("Regenerated");
                    await invalidateAll();
                  } finally {
                    busy = null;
                  }
                }}
              >
                <span class:spin={busy === r.id} style="display:inline-flex"><Icon name="refresh" size={15} /></span>
                {busy === r.id ? "Working…" : "Regenerate"}
              </button>
              <button
                class="menu-item danger"
                onclick={async (e) => {
                  e.stopPropagation();
                  if (!confirm("Delete this resume? This cannot be undone.")) return;
                  await deleteResume(r.id);
                  openMenu = null;
                  showToast("Deleted");
                  await invalidateAll();
                }}
              >
                <Icon name="trash" size={15} /> Delete
              </button>
            </div>
          {/if}
        </article>
      {/each}
    </div>
  {/if}
</div>

{#if toast}
  <div class="toast"><Icon name="check" size={16} />{toast}</div>
{/if}

<style>
  .folder-page {
    max-width: 1240px;
    margin-inline: auto;
    padding: 0 6px;
  }

  .breadcrumb {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    margin: 8px 0 16px;
  }

  .crumb {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--muted);
    text-decoration: none;
  }

  a.crumb:hover {
    color: var(--text);
  }

  .crumb.current {
    color: var(--text);
    font-weight: 600;
  }

  .crumb-sep {
    color: var(--muted);
    opacity: 0.5;
  }

  .folder-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    margin-bottom: 20px;
  }

  .folder-title {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }

  .folder-icon {
    color: var(--accent);
    display: flex;
    align-items: center;
  }

  .folder-meta h1 {
    font-size: 18px;
    font-weight: 700;
    margin: 0 0 2px;
    color: var(--text);
  }

  .folder-meta p {
    font-size: 12px;
    color: var(--muted);
    margin: 0;
  }

  .folder-meta .divider {
    margin: 0 6px;
    opacity: 0.5;
  }

  .folder-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .btn.ghost {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 7px 12px;
    border-radius: var(--radius-sm);
    font-size: 13px;
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s;
  }

  .btn.ghost:hover {
    background: var(--surface-2);
    border-color: var(--border-strong);
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

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 64px 24px;
    color: var(--muted);
    text-align: center;
  }

  .empty-icon {
    color: var(--border-strong);
  }

  .profile-strip {
    padding: 10px 24px 12px;
    border-bottom: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .ps-name {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .ps-fullname {
    font-weight: 600;
    font-size: 14px;
  }

  .ps-title {
    font-size: 13px;
    color: var(--muted);
  }

  .ps-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 12px;
    font-size: 12px;
    color: var(--muted);
  }

  .empty-sub {
    font-size: 13px;
    color: var(--text-soft);
    max-width: 360px;
  }
</style>
