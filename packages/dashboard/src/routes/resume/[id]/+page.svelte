<script lang="ts">
  import YAML from "yaml";
  import Icon from "$lib/Icon.svelte";
  import { handleYamlKeydown, formatYaml } from "$lib/yamlEditor";
  import { getApiKey, getApiUrl } from "$lib/api";
  import type { ResumeDto } from "$lib/types";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const r = $derived(data.resume);

  const pdfHref = $derived(r.pdf_url ? `${getApiUrl()}${r.pdf_url}` : "");

  /** Editor mode: tailor the resume, or write its cover letter. */
  let mode = $state<"resume" | "cover">("resume");
  const hasCoverLetter = $derived(r.has_cover_letter ?? false);

  /** Editable content sections, in display order (mirrors the API's overridesSchema). */
  const EDITABLE_SECTIONS = [
    "experience",
    "education",
    "skills",
    "projects",
    "certifications",
    "extracurriculars",
    "languages",
    "awards",
    "custom",
  ] as const;

  /** Tailoring directives surfaced so they round-trip through the editor. */
  const DIRECTIVES = ["keywords", "skills_highlight"] as const;

  function isNonEmpty(v: unknown): boolean {
    return Array.isArray(v) ? v.length > 0 : v != null;
  }

  function buildYaml(resume: ResumeDto, merged: Record<string, unknown>): string {
    const obj: Record<string, unknown> = {};
    if (resume.company) obj.company = resume.company;
    if (resume.role) obj.role = resume.role;
    if (resume.tags?.length) obj.tags = resume.tags;

    const overrides = (resume.overrides ?? {}) as Record<string, unknown>;

    // Section blocks are emitted in the resume's saved `section_order`, so an
    // arrangement the user made before comes back the same way. Rearranging
    // these blocks in the editor is what *defines* the order — `buildPatchPayload`
    // turns the block order back into `section_order` on save, and the render
    // pipeline renders sections in that order. Sections not named in the saved
    // order fall back to the default display order behind the named ones.
    const savedOrder = (Array.isArray(overrides.section_order) ? overrides.section_order : [])
      .filter((k): k is string => (EDITABLE_SECTIONS as readonly string[]).includes(k));
    const orderedSections = [
      ...savedOrder,
      ...EDITABLE_SECTIONS.filter((k) => !savedOrder.includes(k)),
    ];

    // Always show the full *resolved* content (base + any existing overrides),
    // so experience bullets, projects and skills are right there to edit — not
    // hidden behind a sparse diff. Saving stores the edited sections as the
    // child's overrides.
    for (const key of orderedSections) {
      if (isNonEmpty(merged[key])) obj[key] = merged[key];
    }

    // Keep pure directives visible so they survive a round-trip. (inject_bullets
    // is intentionally omitted — its effect is already baked into the resolved
    // experience bullets above, so re-storing it would double-apply.)
    for (const key of DIRECTIVES) {
      if (isNonEmpty(overrides[key])) obj[key] = overrides[key];
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

    // The order the section blocks appear in the YAML *is* the section order.
    // Capture it as an explicit `section_order` array (order-stable through the
    // API's schema validation, unlike object key order) so rearranging the
    // blocks reorders the rendered resume. A `section_order` the user typed by
    // hand wins over the inferred block order.
    if (overrides.section_order == null) {
      const blockOrder = Object.keys(parsed).filter((k) =>
        (EDITABLE_SECTIONS as readonly string[]).includes(k),
      );
      if (blockOrder.length) overrides.section_order = blockOrder;
    }

    const payload: Record<string, unknown> = {};
    if (parsed.template) payload.template = String(parsed.template);
    payload.meta = meta;
    payload.tags = Array.isArray(parsed.tags) ? parsed.tags : [];
    payload.overrides = overrides;
    return payload;
  }

  let yamlContent = $state(buildYaml(r, data.merged));
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
      const res = await fetch(`${getApiUrl()}/api/v1/resumes/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": getApiKey() },
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

  /** Pretty-print the whole document on demand (no-op if currently invalid). */
  function onFormat() {
    const pretty = formatYaml(yamlContent);
    if (pretty == null) {
      showToast("Fix YAML errors before formatting");
      return;
    }
    yamlContent = pretty;
    onInput();
  }

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

  // ===== Cover letter mode =====

  /** Seed the cover-letter YAML from the stored letter, or a starter scaffold. */
  function buildCoverLetterYaml(resume: ResumeDto): string {
    if (resume.cover_letter) return YAML.stringify(resume.cover_letter, { lineWidth: 0 });
    return YAML.stringify(
      {
        addressee: {
          name: "",
          institution: resume.company ?? "",
          address: "",
          city: "",
          state: "",
          zip: "",
          country: "",
        },
        body: { intro: "", paragraphs: [""], closing: "", signoff: "Sincerely" },
      },
      { lineWidth: 0 },
    );
  }

  let clYaml = $state(buildCoverLetterYaml(r));
  let clError = $state<string | null>(null);
  let clValidYaml = $state(true);
  let clPreviewUrl = $state("");
  let clPreviewLoading = $state(false);
  let clSaving = $state(false);
  let clDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  async function runClPreview() {
    let parsed: Record<string, unknown>;
    try {
      parsed = YAML.parse(clYaml) ?? {};
      clError = null;
      clValidYaml = true;
    } catch (e) {
      clError = (e as Error).message;
      clValidYaml = false;
      return;
    }

    clPreviewLoading = true;
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/resumes/${r.id}/cover-letter/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": getApiKey() },
        body: JSON.stringify(parsed),
      });
      if (!res.ok) {
        clError = (await res.text()) || `Preview failed (${res.status})`;
        clValidYaml = false;
        return;
      }
      clError = null;
      clValidYaml = true;
      const blob = await res.blob();
      if (clPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(clPreviewUrl);
      clPreviewUrl = URL.createObjectURL(blob);
    } catch (e) {
      clError = String(e);
    } finally {
      clPreviewLoading = false;
    }
  }

  function onClInput() {
    try {
      YAML.parse(clYaml);
      clError = null;
      clValidYaml = true;
    } catch (e) {
      clError = (e as Error).message;
      clValidYaml = false;
    }
    if (clDebounceTimer) clearTimeout(clDebounceTimer);
    if (!clValidYaml) return;
    clDebounceTimer = setTimeout(runClPreview, 500);
  }

  function onClFormat() {
    const pretty = formatYaml(clYaml);
    if (pretty == null) {
      showToast("Fix YAML errors before formatting");
      return;
    }
    clYaml = pretty;
    onClInput();
  }

  async function saveCoverLetter() {
    let parsed: Record<string, unknown>;
    try {
      parsed = YAML.parse(clYaml) ?? {};
    } catch (e) {
      clError = (e as Error).message;
      return;
    }

    clSaving = true;
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/resumes/${r.id}/cover-letter`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-API-Key": getApiKey() },
        body: JSON.stringify(parsed),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to save cover letter");
      }
      showToast("Cover letter saved");
    } catch (e) {
      clError = String(e).replace(/^Error: /, "");
    } finally {
      clSaving = false;
    }
  }

  async function downloadCoverLetter() {
    try {
      const res = await fetch(`${getApiUrl()}/api/v1/resumes/${r.id}/cover-letter/pdf`, {
        headers: { "X-API-Key": getApiKey() },
      });
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${r.company ?? "cover-letter"}-${r.role ?? r.template}-cover-letter.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      clError = String(e).replace(/^Error: /, "");
    }
  }

  // Run the active mode's preview when the page mounts or the mode switches.
  $effect(() => {
    if (mode === "cover") {
      if (hasCoverLetter) runClPreview();
    } else {
      runPreview();
    }
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (clDebounceTimer) clearTimeout(clDebounceTimer);
      if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
      if (clPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(clPreviewUrl);
    };
  });
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

    <div class="mode-toggle" role="tablist">
      <button
        class="mode-btn"
        class:active={mode === "resume"}
        role="tab"
        aria-selected={mode === "resume"}
        onclick={() => (mode = "resume")}
      >
        Resume
      </button>
      <button
        class="mode-btn"
        class:active={mode === "cover"}
        role="tab"
        aria-selected={mode === "cover"}
        disabled={!hasCoverLetter}
        title={hasCoverLetter ? "" : "Cover letter not available for this template"}
        onclick={() => (mode = "cover")}
      >
        Cover Letter
      </button>
    </div>

    <div class="detail-actions">
      {#if mode === "resume"}
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
      {:else}
        <button class="btn" onclick={saveCoverLetter} disabled={clSaving || !clValidYaml}>
          {#if clSaving}
            <span class="spin"><Icon name="refresh" size={15} /></span> Saving…
          {:else}
            <Icon name="check" size={15} /> Save
          {/if}
        </button>
        <button class="btn primary" onclick={downloadCoverLetter} disabled={!clValidYaml}>
          <Icon name="download" size={15} /> Download
        </button>
      {/if}
    </div>
  </header>

  <div class="detail-body">
    {#if mode === "resume"}
      <aside class="diff-pane">
        <div class="pane-head">
          <span class="label">Override YAML</span>
          <div class="pane-head-right">
            {#if yamlError}
              <span class="label error" title={yamlError}>
                {yamlError.length > 36 ? yamlError.slice(0, 36) + "…" : yamlError}
              </span>
            {:else if isValidYaml}
              <span class="label ok">Valid</span>
            {/if}
            <button class="btn fmt" onclick={onFormat} disabled={!isValidYaml} title="Format YAML">
              <Icon name="braces" size={13} /> Format
            </button>
          </div>
        </div>
        <textarea
          class="yaml-editor"
          bind:value={yamlContent}
          oninput={onInput}
          onkeydown={handleYamlKeydown}
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
    {:else}
      <aside class="diff-pane">
        <div class="pane-head">
          <span class="label">Cover letter YAML</span>
          <div class="pane-head-right">
            {#if clError}
              <span class="label error" title={clError}>
                {clError.length > 36 ? clError.slice(0, 36) + "…" : clError}
              </span>
            {:else if clValidYaml}
              <span class="label ok">Valid</span>
            {/if}
            <button class="btn fmt" onclick={onClFormat} disabled={!clValidYaml} title="Format YAML">
              <Icon name="braces" size={13} /> Format
            </button>
          </div>
        </div>
        <textarea
          class="yaml-editor"
          bind:value={clYaml}
          oninput={onClInput}
          onkeydown={handleYamlKeydown}
          spellcheck="false"
        ></textarea>
        <p class="cl-hint">
          Your name and contact details come from the resume profile — only the recipient and the
          letter body live here.
        </p>
      </aside>

      <section class="pdf-pane">
        <div class="pane-head">
          <span class="label">Live preview</span>
          {#if clPreviewLoading}
            <span class="label loading">
              <span class="spin-inline"><Icon name="refresh" size={12} /></span> Rendering…
            </span>
          {/if}
        </div>
        {#if clPreviewUrl}
          <iframe class="pdf-frame" src={clPreviewUrl} title="Cover letter preview"></iframe>
        {:else}
          <div class="preview-placeholder" class:error={Boolean(clError)}>
            <Icon name={clError ? "alert" : "file-text"} size={48} />
            <span>{clError || "Rendering preview…"}</span>
          </div>
        {/if}
      </section>
    {/if}
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

  .mode-toggle {
    display: inline-flex;
    margin-left: 18px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .mode-btn {
    padding: 6px 14px;
    font-size: 13px;
    font-weight: 500;
    background: var(--surface);
    color: var(--text-soft);
    border: none;
    cursor: pointer;
    transition: all 0.12s;
  }

  .mode-btn + .mode-btn {
    border-left: 1px solid var(--border);
  }

  .mode-btn:hover:not(:disabled):not(.active) {
    background: var(--surface-2);
    color: var(--text);
  }

  .mode-btn.active {
    background: var(--accent);
    color: var(--accent-contrast);
  }

  .mode-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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

  .pane-head-right {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .btn.fmt {
    padding: 4px 9px;
    font-size: 12px;
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

  .cl-hint {
    margin: 0;
    padding: 8px 16px;
    font-size: 12px;
    color: var(--muted);
    border-top: 1px solid var(--border);
    background: var(--surface-2);
    flex-shrink: 0;
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
