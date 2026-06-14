<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import Icon from "$lib/Icon.svelte";
  import { getApiKey, getApiUrl } from "$lib/api";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  let creating = $state(false);
  let newKey = $state<string | null>(null);
  let autoCopied = $state(false);
  let manuallyCopied = $state(false);
  let toast = $state<string | null>(null);
  let deletingId = $state<string | null>(null);

  function showToast(msg: string) {
    toast = msg;
    setTimeout(() => (toast = null), 2500);
  }

  function autoName(): string {
    return new Date().toLocaleString(undefined, {
      month: "short", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  async function createKey() {
    creating = true;
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": getApiKey() },
        body: JSON.stringify({ name: autoName() }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json();
      newKey = created.key;
      try {
        await navigator.clipboard.writeText(created.key);
        autoCopied = true;
      } catch {
        autoCopied = false;
      }
      await invalidateAll();
    } catch {
      showToast("Failed to create key");
    } finally {
      creating = false;
    }
  }

  async function copyKey() {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    manuallyCopied = true;
    setTimeout(() => (manuallyCopied = false), 2000);
  }

  function dismiss() {
    newKey = null;
    autoCopied = false;
    manuallyCopied = false;
  }

  async function deleteKey(id: string, name: string) {
    if (!confirm(`Revoke "${name}"? Any integration using this key will stop working immediately.`)) return;
    deletingId = id;
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/api-keys/${id}`, {
        method: "DELETE",
        headers: { "X-API-Key": getApiKey() },
      });
      if (!res.ok) throw new Error();
      showToast("Key revoked");
      await invalidateAll();
    } catch {
      showToast("Failed to revoke key");
    } finally {
      deletingId = null;
    }
  }

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
</script>

<!-- New key dialog -->
{#if newKey}
  <div class="modal-overlay" role="dialog" aria-modal="true">
    <div class="modal">
      <div class="modal-header">
        <span class="modal-title">API Key Created</span>
        <button class="btn ghost-icon" onclick={dismiss} aria-label="Close">
          <Icon name="x" size={16} />
        </button>
      </div>

      <div class="modal-body">
        <div class="warning-banner">
          <Icon name="alert" size={15} />
          <span>Copy this key now — it <strong>won't be shown again</strong> after you close this dialog.</span>
        </div>

        <div class="key-display">
          <code class="key-value">{newKey}</code>
          <button class="btn ghost-icon copy-btn" onclick={copyKey} title="Copy key">
            <Icon name={manuallyCopied ? "check" : "copy"} size={15} />
          </button>
        </div>

        <p class="copy-status">
          {#if autoCopied}
            <Icon name="check" size={13} /> Copied to clipboard automatically
          {:else}
            Click the copy button above to copy the key
          {/if}
        </p>

        <p class="usage-hint">
          Add to your requests: <code>X-API-Key: {newKey.slice(0, 22)}…</code>
        </p>
      </div>

      <div class="modal-footer">
        <button class="btn primary" onclick={dismiss}>
          <Icon name="check" size={15} /> Done, I've saved the key
        </button>
      </div>
    </div>
  </div>
{/if}

<div class="page-wrap">
  <div class="page-head">
    <div class="page-heading">
      <h1 class="page-title">API Keys</h1>
      <p class="page-subline">Manage keys for n8n, scripts, and other integrations. Each key is shown only once.</p>
    </div>
    <button class="btn red" onclick={createKey} disabled={creating}>
      {#if creating}
        <span class="spin"><Icon name="refresh" size={15} /></span> Generating…
      {:else}
        <Icon name="plus" size={15} /> Create API Key
      {/if}
    </button>
  </div>

  {#if data.keys.length === 0}
    <div class="empty">
      <span class="empty-icon"><Icon name="key" size={26} /></span>
      <h2>No API keys yet</h2>
      <p class="empty-sub">Create a key to connect n8n, Zapier, or any HTTP client to your resume API.</p>
    </div>
  {:else}
    <div class="keys-card">
      <div class="keys-header-row">
        <span>Name</span>
        <span>Key prefix</span>
        <span>Created</span>
        <span></span>
      </div>
      {#each data.keys as k (k.id)}
        <div class="key-row">
          <span class="key-name">{k.name}</span>
          <code class="key-prefix">{k.prefix}</code>
          <span class="key-date">{fmtDate(k.createdAt)}</span>
          <button
            class="btn ghost-icon revoke-btn"
            disabled={deletingId === k.id}
            onclick={(e) => { e.stopPropagation(); deleteKey(k.id, k.name); }}
            title="Revoke key"
          >
            <Icon name="trash" size={15} />
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>

{#if toast}
  <div class="toast">{toast}</div>
{/if}

<style>
  .page-wrap {
    padding: 24px 28px 64px;
    max-width: 780px;
  }

  /* Header — same pattern as +page.svelte */
  .page-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    margin: 8px 0 24px;
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

  /* Empty — matches existing .empty pattern */
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

  .empty-icon { color: var(--border-strong); }

  .empty h2 {
    font-size: 18px;
    font-weight: 600;
    margin: 8px 0 4px;
    color: var(--text);
  }

  .empty-sub {
    font-size: 14px;
    color: var(--text-soft);
    margin: 0;
    max-width: 340px;
  }

  /* Keys table */
  .keys-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .keys-header-row {
    display: grid;
    grid-template-columns: 1fr 180px 120px 36px;
    padding: 9px 16px;
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }

  .key-row {
    display: grid;
    grid-template-columns: 1fr 180px 120px 36px;
    align-items: center;
    padding: 11px 16px;
    border-bottom: 1px solid var(--border);
    gap: 8px;
    transition: background 0.1s;
  }

  .key-row:last-child { border-bottom: none; }
  .key-row:hover { background: var(--surface-2); }

  .key-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .key-prefix {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--muted);
  }

  .key-date {
    font-size: 12px;
    color: var(--muted);
  }

  .revoke-btn:hover:not(:disabled) {
    color: var(--danger) !important;
    background: color-mix(in srgb, var(--danger) 10%, transparent) !important;
    border-color: color-mix(in srgb, var(--danger) 20%, transparent) !important;
  }

  /* Modal */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    padding: 24px;
    backdrop-filter: blur(3px);
  }

  .modal {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-xl);
    max-width: 500px;
    width: 100%;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
  }

  .modal-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }

  .modal-body {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .modal-footer {
    padding: 16px 20px;
    border-top: 1px solid var(--border);
    display: flex;
    justify-content: flex-end;
  }

  .warning-banner {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 10px 13px;
    background: color-mix(in srgb, var(--danger) 8%, var(--surface-2));
    border: 1px solid color-mix(in srgb, var(--danger) 22%, var(--border));
    border-radius: var(--radius-sm);
    font-size: 13px;
    color: var(--text-soft);
    line-height: 1.5;
  }

  .warning-banner :global(svg) {
    flex-shrink: 0;
    margin-top: 2px;
    color: var(--danger);
  }

  .key-display {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--canvas);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
  }

  .key-value {
    flex: 1;
    font-family: var(--mono);
    font-size: 12.5px;
    color: var(--text);
    word-break: break-all;
    line-height: 1.6;
    user-select: all;
  }

  .copy-btn {
    flex-shrink: 0;
  }

  .copy-status {
    font-size: 12px;
    color: var(--muted);
    margin: -4px 0 0;
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .copy-status :global(svg) { color: var(--success); }

  .usage-hint {
    font-size: 12px;
    color: var(--muted);
    margin: 0;
    line-height: 1.7;
  }

  .usage-hint code {
    font-family: var(--mono);
    font-size: 11.5px;
    background: var(--surface-3);
    padding: 1px 5px;
    border-radius: 4px;
    border: 1px solid var(--border);
    color: var(--code);
  }

  /* Toast — same as rest of app */
  :global(.toast) {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--text);
    color: var(--surface);
    padding: 8px 16px;
    border-radius: var(--radius-sm);
    font-size: 13px;
    font-weight: 500;
    z-index: 300;
    white-space: nowrap;
    pointer-events: none;
  }

  .spin {
    display: inline-flex;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Mobile: anchor the section to the top and center it horizontally. */
  @media (max-width: 860px) {
    .page-wrap {
      margin-inline: auto;
    }
    .page-head {
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
  }
</style>
