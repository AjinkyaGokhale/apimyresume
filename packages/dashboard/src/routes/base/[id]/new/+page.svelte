<script lang="ts">
  import { goto } from "$app/navigation";
  import { fade } from "svelte/transition";
  import { onMount } from "svelte";
  import YAML from "yaml";
  import Icon from "$lib/Icon.svelte";
  import { getApiKey, getApiUrl } from "$lib/api";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const base = $derived(data.base);

  const SECTION_KEYS = [
    "experience", "education", "skills", "projects",
    "certifications", "languages", "awards", "extracurriculars", "custom",
  ] as const;

  // Profile (name, title, contact, links) is fixed: it is inherited from the
  // base resume and is never editable or overridable per child resume.
  const profile = $derived((base.data?.profile ?? {}) as Record<string, unknown>);
  const profileLinks = $derived((profile.links ?? {}) as Record<string, string>);

  function buildInitialYaml(): string {
    // Job metadata + the tailorable sections only. Profile is intentionally
    // omitted — it stays locked to the base and is merged in server-side.
    const obj: Record<string, unknown> = {
      company: "",
      role: "",
      tags: [],
    };
    for (const key of SECTION_KEYS) {
      const val = base.data?.[key];
      if (Array.isArray(val) && val.length > 0) obj[key] = val;
    }
    return YAML.stringify(obj, { lineWidth: 0 });
  }

  let yamlContent = $state(buildInitialYaml());
  let yamlError = $state<string | null>(null);
  let isValidYaml = $state(true);
  let previewUrl = $state("");
  let previewLoading = $state(false);
  let creating = $state(false);

  /** Parse YAML and split into resume payload. */
  function buildPayload(parsed: Record<string, unknown>): Record<string, unknown> {
    const meta: Record<string, unknown> = {};
    if (parsed.company && String(parsed.company).trim()) meta.company = String(parsed.company).trim();
    if (parsed.role && String(parsed.role).trim()) meta.role = String(parsed.role).trim();

    const overrides: Record<string, unknown> = {};
    // `profile` is excluded so it can never be overridden — it is inherited from
    // the base resume verbatim.
    const NON_OVERRIDE_KEYS = new Set(["company", "role", "tags", "template", "profile"]);
    for (const [k, v] of Object.entries(parsed)) {
      if (!NON_OVERRIDE_KEYS.has(k) && v != null) overrides[k] = v;
    }

    const payload: Record<string, unknown> = { base_id: base.id };
    if (parsed.template) payload.template = String(parsed.template);
    if (Object.keys(meta).length) payload.meta = meta;
    if (Array.isArray(parsed.tags) && parsed.tags.length) payload.tags = parsed.tags;
    if (Object.keys(overrides).length) payload.overrides = overrides;
    return payload;
  }

  async function compile() {
    let parsed: Record<string, unknown>;
    try {
      parsed = YAML.parse(yamlContent) ?? {};
      yamlError = null;
      isValidYaml = true;
    } catch (e) {
      yamlError = (e as Error).message;
      isValidYaml = false;
      return;
    }

    previewLoading = true;
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/resumes/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": getApiKey() },
        body: JSON.stringify(buildPayload(parsed)),
      });
      if (!res.ok) {
        yamlError = (await res.text()) || `Preview failed (${res.status})`;
        isValidYaml = false;
        previewLoading = false;
        return;
      }
      yamlError = null;
      isValidYaml = true;
      const blob = await res.blob();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(blob);
      // Keep previewLoading true until the iframe's onload fires, so the loading
      // overlay masks the iframe reload — no white flash of the new PDF.
    } catch (e) {
      yamlError = String(e);
      previewLoading = false;
    }
  }

  // Validate-only on input — rendering happens only when Compile is clicked.
  function onInput() {
    try {
      YAML.parse(yamlContent);
      yamlError = null;
      isValidYaml = true;
    } catch (e) {
      yamlError = (e as Error).message;
      isValidYaml = false;
    }
  }

  function onKeydown(e: KeyboardEvent) {
    // Cmd/Ctrl+S compiles the preview (and prevents the browser save dialog).
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (isValidYaml && !previewLoading) compile();
    }
  }

  // Render once automatically when the editor opens; after that it's manual.
  // The returned teardown revokes the preview blob URL on unmount (using
  // onMount's cleanup rather than a separate onDestroy, which resolves to the
  // SSR lifecycle and crashes on client-side navigation).
  onMount(() => {
    void compile();

    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  });

  async function createResume() {
    let parsed: Record<string, unknown>;
    try {
      parsed = YAML.parse(yamlContent) ?? {};
    } catch (e) {
      yamlError = (e as Error).message;
      return;
    }

    creating = true;
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/resumes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": getApiKey() },
        body: JSON.stringify(buildPayload(parsed)),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to create resume");
      }
      const result = await res.json() as { id: string };
      goto(`/resume/${result.id}`);
    } catch (e) {
      yamlError = String(e).replace(/^Error: /, "");
    } finally {
      creating = false;
    }
  }
</script>

<div class="detail">
  <header class="detail-head">
    <button type="button" class="btn back" onclick={() => goto(`/base/${base.id}`)}>
      <Icon name="chevron-left" size={16} /> Back
    </button>
    <div class="detail-title">
      <span class="t-company">New resume</span>
      <span class="t-role">tailored from {base.name || base.id}</span>
    </div>
    <div class="detail-actions">
      <button class="btn primary" onclick={createResume} disabled={creating || !isValidYaml}>
        {#if creating}
          <span class="spin"><Icon name="refresh" size={15} /></span> Creating…
        {:else}
          <Icon name="check" size={15} /> Create resume
        {/if}
      </button>
    </div>
  </header>

  <div class="detail-body">
    <aside class="diff-pane">
      <div class="pane-head">
        <span class="label">Resume YAML</span>
        <div class="pane-head-right">
          {#if yamlError}
            <span class="label error" title={yamlError}>
              {yamlError.length > 36 ? yamlError.slice(0, 36) + "…" : yamlError}
            </span>
          {:else if isValidYaml}
            <span class="label ok">Valid</span>
          {/if}
          <button
            class="btn primary compile"
            onclick={compile}
            disabled={!isValidYaml || previewLoading}
            title="Compile preview (⌘/Ctrl + S)"
          >
            {#if previewLoading}
              <span class="spin"><Icon name="refresh" size={13} /></span> Compiling…
            {:else}
              <Icon name="braces" size={13} /> Compile
            {/if}
          </button>
        </div>
      </div>

      <div class="inherited">
        <div class="inherited-head">
          <Icon name="lock" size={12} />
          <span>Profile — inherited from base, not editable</span>
        </div>
        <div class="inherited-body">
          <div class="ip-line">
            <span class="ip-name">{profile.name ?? "—"}</span>
            {#if profile.title}<span class="ip-title">{profile.title}</span>{/if}
          </div>
          <div class="ip-meta">
            {#if profile.email}<span>{profile.email}</span>{/if}
            {#if profile.phone}<span>{profile.phone}</span>{/if}
            {#if profile.location}<span>{profile.location}</span>{/if}
            {#each Object.values(profileLinks).filter(Boolean) as link}
              <span>{link}</span>
            {/each}
          </div>
        </div>
      </div>

      <textarea
        class="yaml-editor"
        bind:value={yamlContent}
        oninput={onInput}
        onkeydown={onKeydown}
        spellcheck="false"
      ></textarea>
    </aside>

    <section class="pdf-pane">
      <div class="pane-head">
        <span class="label">Preview</span>
        {#if previewLoading}
          <span class="label loading">
            <span class="spin-inline"><Icon name="refresh" size={12} /></span> Compiling…
          </span>
        {/if}
      </div>
      <div class="pdf-stage">
        {#if previewUrl}
          <iframe
            class="pdf-frame"
            src={previewUrl}
            title="Resume preview"
            onload={() => (previewLoading = false)}
          ></iframe>
        {/if}
        {#if previewLoading || !previewUrl}
          <div
            class="preview-placeholder"
            class:error={Boolean(yamlError) && !previewUrl}
            out:fade={{ duration: 200 }}
          >
            {#if previewLoading}
              <span class="spin"><Icon name="refresh" size={34} /></span>
              <span>Compiling…</span>
            {:else if yamlError && !previewUrl}
              <Icon name="alert" size={48} />
              <span>{yamlError}</span>
            {:else}
              <Icon name="braces" size={44} />
              <span>Press <strong>Compile</strong> to render the preview</span>
            {/if}
          </div>
        {/if}
      </div>
    </section>
  </div>
</div>

<style>
  .detail {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--canvas);
  }

  .detail-head {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 11px 18px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
    flex-shrink: 0;
  }

  .detail-title {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
    min-width: 0;
  }

  .detail-title .t-company {
    font-weight: 600;
    font-size: 15px;
  }

  .detail-title .t-role {
    font-size: 12.5px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .detail-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .detail-body {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1.25fr;
    min-height: 0;
  }

  .diff-pane {
    display: flex;
    flex-direction: column;
    min-height: 0;
    border-right: 1px solid var(--border);
  }

  .inherited {
    flex-shrink: 0;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }

  .inherited-head {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    margin-bottom: 6px;
  }

  .inherited-body {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .ip-line {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
  }

  .ip-name {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--text);
  }

  .ip-title {
    font-size: 12.5px;
    color: var(--text-soft);
  }

  .ip-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    font-size: 12px;
    color: var(--muted);
  }

  .pdf-pane {
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--canvas);
  }

  .pane-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px 8px 16px;
    border-bottom: 1px solid var(--border);
    background: var(--surface-2);
    flex-shrink: 0;
    min-height: 42px;
  }

  .pane-head-right {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .btn.compile {
    padding: 5px 11px;
    font-size: 12.5px;
  }

  .pane-head .label {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
  }

  .pane-head .label.error {
    color: var(--badge-red-text);
    max-width: 60%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pane-head .label.ok {
    color: var(--badge-green-text);
  }

  .pane-head .label.loading {
    color: var(--text-soft);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .yaml-editor {
    flex: 1;
    padding: 16px;
    border: none;
    background: var(--surface);
    color: var(--code);
    font-family: var(--mono);
    font-size: 13px;
    line-height: 1.6;
    resize: none;
    outline: none;
    tab-size: 2;
  }

  .yaml-editor:focus {
    background: var(--surface);
  }

  .pdf-stage {
    position: relative;
    flex: 1;
    min-height: 0;
  }

  .pdf-frame {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: none;
    background: var(--surface);
  }

  .preview-placeholder {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    background: var(--surface);
    color: var(--muted);
    text-align: center;
    padding: 32px;
  }

  .preview-placeholder .spin {
    color: var(--accent);
  }

  .preview-placeholder.error {
    color: var(--badge-red-text);
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

  .btn.back {
    font-weight: 600;
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

  .spin,
  .spin-inline {
    animation: spin 0.8s linear infinite;
    display: inline-flex;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (max-width: 860px) {
    .detail-body {
      grid-template-columns: 1fr;
    }
  }
</style>
