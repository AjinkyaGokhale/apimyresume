<script lang="ts">
  import YAML from "yaml";
  import Icon from "$lib/Icon.svelte";
  import ThemeToggle from "$lib/ThemeToggle.svelte";
  import { getApiKey, getApiUrl } from "$lib/api";
  import type { ResumeDto } from "$lib/types";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const r = $derived(data.resume);

  const pdfHref = $derived(r.pdf_url ? `${getApiUrl()}${r.pdf_url}` : "");

  function buildYaml(resume: ResumeDto): string {
    const obj: Record<string, unknown> = {};
    if (resume.company) obj.company = resume.company;
    if (resume.role) obj.role = resume.role;
    if (resume.tags?.length) obj.tags = resume.tags;
    const overrides = (resume.overrides ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(overrides)) {
      if (v != null) obj[k] = v;
    }
    return YAML.stringify(obj, { lineWidth: 0 });
  }

  /** Split parsed YAML back into a PATCH payload. */
  function buildPatchPayload(parsed: Record<string, unknown>): Record<string, unknown> {
    const meta: Record<string, unknown> = {};
    if (parsed.company != null) meta.company = String(parsed.company);
    if (parsed.role != null) meta.role = String(parsed.role);

    const overrides: Record<string, unknown> = {};
    const META_KEYS = new Set(["company", "role", "tags", "template"]);
    for (const [k, v] of Object.entries(parsed)) {
      if (!META_KEYS.has(k) && v != null) overrides[k] = v;
    }

    const payload: Record<string, unknown> = {};
    if (parsed.template) payload.template = String(parsed.template);
    payload.meta = meta;
    payload.tags = Array.isArray(parsed.tags) ? parsed.tags : [];
    payload.overrides = overrides;
    return payload;
  }

  let yamlContent = $state(buildYaml(r));
  let yamlError = $state<string | null>(null);
  let isValidYaml = $state(true);
  let previewUrl = $state("");
  let previewLoading = $state(false);
  let saving = $state(false);
  let toast = $state<string | null>(null);

  function showToast(msg: string) {
    toast = msg;
    setTimeout(() => (toast = null), 1800);
  }

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  async function runPreview() {
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
      const res = await fetch(`/base/${r.base_id}/new/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...buildPatchPayload(parsed), base_id: r.base_id }),
      });
      if (!res.ok) {
        yamlError = (await res.text()) || `Preview failed (${res.status})`;
        isValidYaml = false;
        return;
      }
      yamlError = null;
      isValidYaml = true;
      const blob = await res.blob();
      if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(blob);
    } catch (e) {
      yamlError = String(e);
    } finally {
      previewLoading = false;
    }
  }

  function onInput() {
    try {
      YAML.parse(yamlContent);
      yamlError = null;
      isValidYaml = true;
    } catch (e) {
      yamlError = (e as Error).message;
      isValidYaml = false;
    }
    if (debounceTimer) clearTimeout(debounceTimer);
    if (!isValidYaml) return;
    debounceTimer = setTimeout(runPreview, 500);
  }

  $effect(() => {
    runPreview();
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  });

  async function saveAndRegenerate() {
    let parsed: Record<string, unknown>;
    try {
      parsed = YAML.parse(yamlContent) ?? {};
    } catch (e) {
      yamlError = (e as Error).message;
      return;
    }

    saving = true;
    try {
      // PATCH the resume overrides
      const patchRes = await fetch(`${getApiUrl()}/api/v1/resumes/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-API-Key": getApiKey() },
        body: JSON.stringify(buildPatchPayload(parsed)),
      });
      if (!patchRes.ok) {
        const err = await patchRes.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to save");
      }

      // Regenerate the PDF
      const regenRes = await fetch(`${getApiUrl()}/api/v1/resumes/${r.id}/regenerate`, {
        method: "POST",
        headers: { "X-API-Key": getApiKey() },
      });
      if (!regenRes.ok) {
        const err = await regenRes.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to regenerate PDF");
      }

      showToast("Saved");
    } catch (e) {
      yamlError = String(e).replace(/^Error: /, "");
    } finally {
      saving = false;
    }
  }
</script>

<div class="detail">
  {#if toast}
    <div class="toast"><Icon name="check" size={16} />{toast}</div>
  {/if}

  <header class="detail-head">
    <a class="btn back" href="/">
      <Icon name="chevron-left" size={16} /> Back
    </a>
    <div class="detail-title">
      <span class="t-company">{r.company ?? "Resume"}</span>
      <span class="t-role">{r.role ?? r.template} · base: {r.base_id}</span>
    </div>
    <div class="detail-actions">
      <ThemeToggle variant="icon" />
      <button class="btn" onclick={saveAndRegenerate} disabled={saving || !isValidYaml}>
        {#if saving}
          <span class="spin"><Icon name="refresh" size={15} /></span> Saving…
        {:else}
          <Icon name="check" size={15} /> Save
        {/if}
      </button>
      {#if pdfHref}
        <a class="btn primary" href={pdfHref} download="{r.company ?? 'resume'}-{r.role ?? r.template}.pdf">
          <Icon name="download" size={15} /> Download
        </a>
      {/if}
    </div>
  </header>

  <div class="detail-body">
    <aside class="diff-pane">
      <div class="pane-head">
        <span class="label">Override YAML</span>
        {#if yamlError}
          <span class="label error" title={yamlError}>
            {yamlError.length > 48 ? yamlError.slice(0, 48) + "…" : yamlError}
          </span>
        {:else if isValidYaml}
          <span class="label ok">Valid</span>
        {/if}
      </div>
      <textarea
        class="yaml-editor"
        bind:value={yamlContent}
        oninput={onInput}
        spellcheck="false"
      ></textarea>
    </aside>

    <section class="pdf-pane">
      <div class="pane-head">
        <span class="label">Live preview</span>
        {#if previewLoading}
          <span class="label loading">
            <span class="spin-inline"><Icon name="refresh" size={12} /></span> Rendering…
          </span>
        {/if}
      </div>
      {#if previewUrl}
        <iframe class="pdf-frame" src={previewUrl} title="Resume preview"></iframe>
      {:else}
        <div class="preview-placeholder" class:error={Boolean(yamlError)}>
          <Icon name={yamlError ? "alert" : "file-text"} size={48} />
          <span>{yamlError || "Rendering preview…"}</span>
        </div>
      {/if}
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
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
    gap: 8px;
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
    padding: 10px 16px;
    border-bottom: 1px solid var(--border);
    background: var(--surface-2);
    flex-shrink: 0;
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

  .pdf-frame {
    flex: 1;
    width: 100%;
    border: none;
    background: var(--surface);
  }

  .preview-placeholder {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    color: var(--muted);
    text-align: center;
    padding: 32px;
  }

  .preview-placeholder.error {
    color: var(--badge-red-text);
  }

  .toast {
    position: fixed;
    bottom: 22px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--text);
    color: var(--canvas);
    padding: 10px 16px;
    border-radius: var(--radius);
    font-size: 13px;
    font-weight: 500;
    box-shadow: var(--shadow-lg);
    z-index: 60;
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
    text-decoration: none;
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
