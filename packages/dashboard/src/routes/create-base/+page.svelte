<script lang="ts">
  import { goto } from "$app/navigation";
  import { fade } from "svelte/transition";
  import { onMount } from "svelte";
  import YAML from "yaml";
  import Icon from "$lib/Icon.svelte";
  import { handleYamlKeydown } from "$lib/yamlEditor";
  import { getApiKey, getApiUrl, getTemplates, type TemplateDto } from "$lib/api";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const editingBase = data.base ?? null;

  let yamlError = $state<string | null>(null);
  let previewPdfUrl = $state<string>("");
  let isValidYaml = $state(true);
  let isCreating = $state(false);
  let createdId = $state<string | null>(null);
  let toast = $state<string | null>(null);
  let isPreviewLoading = $state(false);
  let lastPreviewData = $state<string>("");

  // Available base templates for the visual picker. The human fixes the
  // template here once; child resumes always inherit it (never tailorable).
  let templates = $state<TemplateDto[]>([]);

  // New bases start on a full template gallery; once a template is picked the
  // YAML editor opens. Editing an existing base skips straight to the editor.
  let step = $state<"gallery" | "editor">(editingBase ? "editor" : "gallery");
  let templatesLoading = $state(false);
  let templatesError = $state<string | null>(null);

  /** Load the available templates for the gallery/picker, tracking errors so a
   *  failed/expired session shows a retry instead of an endless spinner. */
  // Increments on every load call so a stale auto-retry loop (e.g. after the
  // component unmounts or a newer load starts) bails instead of clobbering state.
  let loadToken = 0;

  /** Load the gallery templates. The first request right after navigating here
   *  can transiently fail before it even reaches the server, yet a slightly
   *  later attempt (what the manual "Load templates" button does) succeeds — so
   *  we auto-retry on that same path with widening gaps, staying on the spinner,
   *  and only show the error if every attempt fails. */
  async function loadTemplates(force = false) {
    const token = ++loadToken;
    templatesLoading = true;
    templatesError = null;

    // 0ms first try (instant from cache when warm), then space out retries to
    // ride out the connection blip — mirroring a user clicking the button again.
    const delaysMs = [0, 800, 1500, 2500];
    for (let i = 0; i < delaysMs.length; i++) {
      if (delaysMs[i] > 0) await new Promise((r) => setTimeout(r, delaysMs[i]));
      if (token !== loadToken) return; // superseded by a newer load / unmounted

      try {
        templates = await getTemplates(force || i > 0);
        if (token !== loadToken) return;
        templatesError = null;
        templatesLoading = false;
        return;
      } catch (e) {
        console.error(`Failed to load templates (attempt ${i + 1}):`, e);
        templatesError = e instanceof Error ? e.message : "Failed to load templates";
      }
    }
    if (token === loadToken) templatesLoading = false;
  }

  /** Content section ids whose YAML block order defines the render order. */
  const SECTION_KEYS = [
    "experience",
    "education",
    "skills",
    "projects",
    "certifications",
    "extracurriculars",
    "languages",
    "awards",
    "custom",
  ];

  function baseToYaml(base: NonNullable<typeof editingBase>): string {
    const data = { ...((base.data ?? {}) as Record<string, unknown>) };

    // The section order is expressed by the order of the blocks themselves, so
    // we lay them out in the saved `section_order` and drop the explicit field
    // rather than showing a separate `section_order:` line to hand-edit.
    const savedOrder = (Array.isArray(data.section_order) ? (data.section_order as string[]) : [])
      .filter((k) => SECTION_KEYS.includes(k));
    delete data.section_order;
    const orderedSections = [...savedOrder, ...SECTION_KEYS.filter((k) => !savedOrder.includes(k))];

    const doc: Record<string, unknown> = { name: base.name, template: base.template };
    // Non-section keys first (id, profile, …) in their existing order, then the
    // section blocks in the resolved order.
    for (const [k, v] of Object.entries(data)) {
      if (!SECTION_KEYS.includes(k)) doc[k] = v;
    }
    for (const key of orderedSections) {
      if (data[key] != null) doc[key] = data[key];
    }
    return YAML.stringify(doc, { lineWidth: 0 });
  }

  // Placeholder YAML template - based on stuxf/basic-typst-resume-template
  let yamlContent = $state(editingBase ? baseToYaml(editingBase) : `# Your resume - edit the values below
# Name is the display label for this base resume (e.g., "Software Engineer - US", "Full Stack - Europe")
name: Max Muster - Software Engineer
template: basic-resume

profile:
  name: Max Muster
  title: Software Engineer
  location: Berlin, Germany
  email: max@muster.dev
  phone: +49 30 12345678
  links:
    github: github.com/maxmuster
    linkedin: linkedin.com/in/maxmuster
    portfolio: muster.dev

education:
  - institution: Technische Universität Berlin
    degree: Bachelor of Science, Computer Science
    location: Berlin, Germany
    period: Oct 2020 – Sep 2024
    bullets:
      - "Cumulative GPA: 1.7/1.0 (German grading) | Dean's List, Deutschlandstipendium Scholarship"
      - "Relevant Coursework: Algorithms, Distributed Systems, Machine Learning, Software Engineering"
      - "Thesis: Scalable Distributed Key-Value Store with Consistent Hashing and Replication"

experience:
  - id: sap-intern
    role: Software Engineering Intern
    company: SAP SE
    location: Walldorf, Germany
    period: Mar 2024 – Aug 2024
    bullets:
      - "Developed microservices handling 5M+ daily requests using Kubernetes and Go"
      - "Reduced API latency by 35% through Redis caching and query optimization"
      - "Implemented CI/CD pipelines reducing deployment time from hours to minutes"
      - "Collaborated with team of 12 engineers in agile sprints, mentored 2 junior developers"
  - id: fraunhofer-research
    role: Research Assistant
    company: Fraunhofer Institute for AI
    location: Berlin, Germany
    period: Sep 2023 – Feb 2024
    bullets:
      - "Implemented transformer models for NLP achieving 92% F1 score on benchmark dataset"
      - "Published paper at German AI conference on efficient attention mechanisms"
      - "Open-sourced PyTorch toolkit with 300+ GitHub stars and 10+ contributors"
      - "Optimized distributed training pipeline reducing compute time by 25%"

projects:
  - name: StudySync
    role: Creator
    url: studysync.app
    period: Jan 2023 – Present
    bullets:
      - "Open-source study group platform used by 8,000+ students at 10+ universities"
      - "Built real-time collaboration using WebSockets, PostgreSQL, and Redis pub/sub"
      - "Implemented OAuth2 authentication with support for Google and GitHub login"
      - "Deployed on AWS with auto-scaling, achieving 99.9% uptime over 12 months"
  - name: Berlin Transit Viz
    role: Creator
    url: github.com/maxmuster/bvg-viz
    period: Jun 2024 – Aug 2024
    bullets:
      - "Interactive visualization of Berlin public transport using D3.js and Mapbox GL"
      - "Processes 1M+ daily data points from BVG API in real-time"
      - "Implemented efficient spatial indexing reducing query latency by 60%"
      - "Featured in Berlin Tech Weekly newsletter with 5,000+ subscribers"

extracurriculars:
  - activity: University Programming Contest Team
    period: Oct 2021 – Present
    bullets:
      - "Captain of TU Berlin ICPC team, qualified for regional finals 2023 and 2024"
      - "Organized weekly practice sessions for 30+ students on advanced algorithms"
      - "Created 200+ original problems for team training and internal competitions"

skills:
  - category: Programming Languages
    items: [Python, TypeScript, Go, Rust, Java, C/C++]
  - category: Frontend
    items: [React, Vue.js, Svelte, Tailwind CSS, WebGL]
  - category: Backend
    items: [Node.js, FastAPI, GraphQL, PostgreSQL, MongoDB, Redis]
  - category: Cloud & DevOps
    items: [Docker, Kubernetes, AWS, Terraform, GitHub Actions, CI/CD]

# Custom sections: a title with bullets under it. Add an optional
# "subtitle" and clickable "link". Optional "after" slots a section
# under a built-in one (top | education | experience | projects |
#  extracurriculars | certifications | skills | end). Omit it to render
# at the bottom. For several items under one heading (e.g. multiple
# projects), use "entries" — each gets its own title/subtitle/link/bullets.
custom:
  - id: publications
    title: Publications
    after: experience
    bullets:
      - "Muster, M. (2024). Efficient Attention Mechanisms. German AI Conf."
      - "Co-author of Scalable KV Stores, Journal of Distributed Systems."
  - id: oss
    title: Open Source Contributions
    entries:
      - title: OpenMetrics
        subtitle: Core Maintainer
        period: Oct 2021 – Present
        link: https://github.com/alex/openmetrics
        bullets:
          - "Reviewed 200+ PRs, mentored 5 contributors"
          - "Shipped v2.0 used by 1.2k+ projects"
      - title: Fastify
        subtitle: Contributor
        bullets:
          - "Added HTTP/2 support"
  - id: volunteering
    title: Volunteering
    bullets:
      - "Mentor at CoderDojo Berlin, teaching kids to code (2022 – Present)"`);

  const pageTitle = $derived(editingBase ? `Edit base — ${editingBase.name}` : "Create base resume");
  const submitLabel = $derived(editingBase ? "Save changes" : "Create base");

  /** The template id currently set in the YAML (drives the picker highlight). */
  const currentTemplate = $derived(yamlContent.match(/^template:\s*(.+)$/m)?.[1].trim() ?? "");

  /** Set the top-level `template:` line in the YAML to the given id. */
  function setTemplateLine(id: string) {
    if (/^template:\s*.+$/m.test(yamlContent)) {
      yamlContent = yamlContent.replace(/^template:\s*.+$/m, `template: ${id}`);
    } else {
      yamlContent = `template: ${id}\n${yamlContent}`;
    }
  }

  /** Rewrite the top-level `template:` line in the editor, then recompile. */
  function selectTemplate(id: string) {
    if (id === currentTemplate) return;
    setTemplateLine(id);
    if (validateYaml()) void compile();
  }

  /** Gallery step: pick a template, then open the editor and render once. */
  function chooseTemplate(id: string) {
    setTemplateLine(id);
    step = "editor";
    if (validateYaml()) void compile();
  }

  function showToast(msg: string) {
    toast = msg;
    setTimeout(() => (toast = null), 2000);
  }

  // Parse the editor YAML with the real YAML parser so value types are
  // preserved (booleans like template_lock, numbers, nested arrays/objects).
  // The previous hand-rolled parser stringified every value, which broke schema
  // validation — e.g. `template_lock: false` became the string "false", so the
  // API rejected the save with a 422 and the base looked "locked" / uneditable.
  function parseYamlToJson(yaml: string): Record<string, unknown> | null {
    try {
      const doc = YAML.parse(yaml);
      return doc && typeof doc === "object" && !Array.isArray(doc)
        ? (doc as Record<string, unknown>)
        : null;
    } catch (e) {
      console.error("Parse error:", e);
      return null;
    }
  }

  // Validate-only on input — the PDF render happens only when Compile is clicked.
  function validateYaml(): Record<string, unknown> | null {
    const data = parseYamlToJson(yamlContent);
    if (!data) {
      yamlError = 'Invalid YAML syntax';
      isValidYaml = false;
      return null;
    }

    const profile = data.profile as Record<string, unknown> | undefined;
    if (!data.template) {
      yamlError = 'Missing required field: template';
      isValidYaml = false;
      return null;
    }
    if (!profile || typeof profile !== 'object') {
      yamlError = 'Missing required section: profile';
      isValidYaml = false;
      return null;
    }
    if (!profile.name || !profile.email) {
      yamlError = 'Missing required profile fields: name or email';
      isValidYaml = false;
      return null;
    }
    if (!profile.title) {
      yamlError = 'Missing required profile field: title (e.g., Software Engineer)';
      isValidYaml = false;
      return null;
    }

    yamlError = null;
    isValidYaml = true;
    return data;
  }

  function onInput() {
    validateYaml();
  }

  function onKeydown(e: KeyboardEvent) {
    // Cmd/Ctrl+S compiles the preview (and prevents the browser save dialog).
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (isValidYaml && !isPreviewLoading) compile();
      return;
    }
    // Auto-indent on Enter, Tab to indent/outdent (the synthetic input event
    // it fires re-runs validation via the textarea's oninput). Clipboard
    // shortcuts (copy/cut/paste/select-all) are never intercepted.
    handleYamlKeydown(e);
  }

  async function compile() {
    const data = validateYaml();
    if (!data) return;

    isPreviewLoading = true;

    // Avoid re-rendering identical content
    const dataStr = JSON.stringify(data);
    if (dataStr === lastPreviewData && previewPdfUrl) {
      isPreviewLoading = false;
      return;
    }
    lastPreviewData = dataStr;

    try {
      const response = await fetch(`${getApiUrl()}/api/v1/resumes/preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': getApiKey()
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const text = await response.text();
        let err;
        try { err = JSON.parse(text); } catch { err = { error: text }; }
        throw new Error(err.error || `Failed to generate preview (${response.status})`);
      }

      const pdfBlob = await response.blob();

      // Revoke old URL to prevent memory leaks
      if (previewPdfUrl) {
        URL.revokeObjectURL(previewPdfUrl);
      }

      previewPdfUrl = URL.createObjectURL(pdfBlob);
      // Keep isPreviewLoading true until the iframe's onload fires, so the
      // loading overlay masks the iframe reload — no white flash of the new PDF.
    } catch (e) {
      console.error('Preview error:', e);
      yamlError = String(e).replace(/^Error: /, '');
      isValidYaml = false;
      isPreviewLoading = false;
    }
  }

  // Render once automatically when the editor opens; after that it's manual.
  // The returned teardown revokes the preview blob URL on unmount (using
  // onMount's cleanup rather than a separate onDestroy, which resolves to the
  // SSR lifecycle and crashes on client-side navigation).
  onMount(() => {
    // New bases render only after a template is chosen in the gallery; when
    // editing we open straight into the editor, so render immediately.
    if (step === "editor") void compile();
    void loadTemplates();

    return () => {
      loadToken++; // stop any in-flight auto-retry loop
      if (previewPdfUrl) {
        URL.revokeObjectURL(previewPdfUrl);
      }
    };
  });

  async function createBase() {
    const parsed = parseYamlToJson(yamlContent);
    if (!parsed || !isValidYaml) return;

    const profile = parsed.profile as Record<string, unknown>;
    if (!profile.title) profile.title = 'Software Engineer';

    // The order the section blocks appear in the YAML *is* the render order.
    // Persist it as an explicit `section_order` array (order-stable through the
    // API's schema validation, unlike object key order), so the base — and the
    // child resumes derived from it — render sections in this order. A
    // hand-typed `section_order` wins.
    if (parsed.section_order == null) {
      const blockOrder = Object.keys(parsed).filter((k) => SECTION_KEYS.includes(k));
      if (blockOrder.length) parsed.section_order = blockOrder;
    }

    isCreating = true;
    try {
      let response: Response;

      if (editingBase) {
        // Update existing base via PATCH
        response = await fetch(`${getApiUrl()}/api/v1/bases/${editingBase.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': getApiKey() },
          body: JSON.stringify(parsed),
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to update base');
        }
        showToast('Base resume updated');
        await new Promise(r => setTimeout(r, 800));
        goto(`/base/${editingBase.id}`);
        return;
      }

      // Create new base via POST
      if (!parsed.id) {
        const nameSlug = (profile.name as string || 'resume')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        parsed.id = `${nameSlug}-${Date.now().toString(36).slice(-4)}`;
      }
      if (Array.isArray(parsed.experience)) {
        parsed.experience = (parsed.experience as Record<string, unknown>[]).map((exp, idx) => {
          if (!exp.id) exp.id = `exp-${idx}-${Date.now().toString(36).slice(-4)}`;
          return exp;
        });
      }

      response = await fetch(`${getApiUrl()}/api/v1/bases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': getApiKey() },
        body: JSON.stringify(parsed),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create base');
      }

      const result = await response.json();
      createdId = result.id;
      showToast('Base resume created');
    } catch (e) {
      yamlError = String(e);
    } finally {
      isCreating = false;
    }
  }

  function goBack() {
    goto('/');
  }

  function goHome() {
    createdId = null;
    goto('/');
  }
</script>

<div class="detail">
  {#if toast}
    <div class="toast"><Icon name="check" size={16} />{toast}</div>
  {/if}

  {#if createdId}
    <!-- Handoff screen -->
    <header class="detail-head">
      <button class="btn back" onclick={goHome}>
        <Icon name="chevron-left" size={16} /> Back
      </button>
      <div class="detail-title">
        <span class="t-company">Base resume created!</span>
        <span class="t-role">Your canonical profile is ready</span>
      </div>
      <div class="detail-actions">
        <button class="btn primary" onclick={goHome}>
          <Icon name="check" size={15} /> Done
        </button>
      </div>
    </header>

    <div class="detail-body single">
      <div class="handoff-content">
        <div class="handoff-section">
          <div class="handoff-label">Base resume ID</div>
          <code class="handoff-code">{createdId}</code>
        </div>
        <div class="handoff-section">
          <div class="handoff-label">API endpoint</div>
          <code class="handoff-code">POST {getApiUrl()}/api/v1/resumes</code>
        </div>
        <div class="handoff-hint">
          Your base is ready. Create tailored resumes via the dashboard or API.
        </div>
      </div>
    </div>
  {:else}
    <!-- Create base wizard -->
    {#if step === "gallery"}
      <!-- Step 1: pick a template -->
      <header class="detail-head">
        <button class="btn back" onclick={goBack}>
          <Icon name="chevron-left" size={16} /> Back
        </button>
        <div class="detail-title">
          <span class="t-company">Choose a template</span>
          <span class="t-role">Pick a layout for your base resume</span>
        </div>
      </header>

      <div class="gallery">
        {#if templates.length}
          <div class="gallery-grid">
            {#each templates as t (t.id)}
              <button
                type="button"
                class="gallery-card"
                onclick={() => chooseTemplate(t.id)}
                title={t.description ?? t.name}
              >
                <div class="gallery-thumb-wrap">
                  <img
                    class="gallery-thumb"
                    src={`${getApiUrl()}${t.thumbnail_url}`}
                    alt={t.name}
                    loading="lazy"
                  />
                </div>
                <div class="gallery-meta">
                  <span class="gallery-name">{t.name}</span>
                  {#if t.description}<span class="gallery-desc">{t.description}</span>{/if}
                </div>
              </button>
            {/each}
          </div>
        {:else if templatesLoading}
          <div class="gallery-loading">
            <span class="spin"><Icon name="refresh" size={28} /></span>
            <span>Loading templates…</span>
          </div>
        {:else}
          <div class="gallery-loading">
            <Icon name="alert" size={28} />
            <span>Couldn't load templates.</span>
            {#if templatesError}<span class="gallery-err">{templatesError}</span>{/if}
            <span class="gallery-err-hint">API: {getApiUrl()} — if your session expired, reload the page or log in again.</span>
            <button class="btn" onclick={() => loadTemplates(true)}>
              <Icon name="refresh" size={15} /> Load templates
            </button>
          </div>
        {/if}
      </div>
    {:else}
    <header class="detail-head">
      <button class="btn back" onclick={goBack}>
        <Icon name="chevron-left" size={16} /> Back
      </button>
      <div class="detail-title">
        <span class="t-company">{pageTitle}</span>
        <span class="t-role">Your canonical profile</span>
      </div>
      <div class="detail-actions">
        {#if !editingBase}
          <button class="btn" onclick={() => (step = "gallery")} title="Pick a different template">
            <Icon name="grid" size={15} /> Change template
          </button>
        {/if}
        <button class="btn primary" onclick={createBase} disabled={isCreating || !isValidYaml}>
          {#if isCreating}
            <span class="spin"><Icon name="refresh" size={15} /></span> {editingBase ? "Saving…" : "Creating…"}
          {:else}
            <Icon name="check" size={15} /> {submitLabel}
          {/if}
        </button>
      </div>
    </header>

    {#if templates.length}
      <div class="template-strip">
        <span class="template-strip-label">Template</span>
        <div class="template-cards">
          {#each templates as t (t.id)}
            <button
              type="button"
              class="template-card"
              class:selected={t.id === currentTemplate}
              onclick={() => selectTemplate(t.id)}
              title={t.description ?? t.name}
            >
              <img
                class="template-thumb"
                src={`${getApiUrl()}${t.thumbnail_url}`}
                alt={t.name}
                loading="lazy"
              />
              <span class="template-name">{t.name}</span>
              {#if t.id === currentTemplate}
                <span class="template-check"><Icon name="check" size={13} /></span>
              {/if}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <div class="detail-body">
      <aside class="diff-pane">
        <div class="pane-head">
          <span class="label">Base YAML</span>
          <div class="pane-head-right">
            {#if yamlError}
              <span class="label error" title={yamlError}>{yamlError.length > 36 ? yamlError.slice(0, 36) + '…' : yamlError}</span>
            {:else}
              <span class="label ok">Valid</span>
            {/if}
            <button
              class="btn primary compile"
              onclick={compile}
              disabled={!isValidYaml || isPreviewLoading}
              title="Compile preview (⌘/Ctrl + S)"
            >
              {#if isPreviewLoading}
                <span class="spin"><Icon name="refresh" size={13} /></span> Compiling…
              {:else}
                <Icon name="braces" size={13} /> Compile
              {/if}
            </button>
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
          {#if isPreviewLoading}
            <span class="label loading">
              <span class="spin-inline"><Icon name="refresh" size={12} /></span>
              Compiling…
            </span>
          {/if}
        </div>
        <div class="pdf-stage">
          {#if previewPdfUrl}
            <iframe
              class="pdf-frame"
              src={previewPdfUrl}
              title="Resume Preview"
              onload={() => (isPreviewLoading = false)}
            ></iframe>
          {/if}
          {#if isPreviewLoading || !previewPdfUrl}
            <div
              class="preview-placeholder"
              class:error={Boolean(yamlError) && !previewPdfUrl}
              out:fade={{ duration: 200 }}
            >
              {#if isPreviewLoading}
                <span class="spin"><Icon name="refresh" size={34} /></span>
                <span>Compiling…</span>
              {:else if yamlError && !previewPdfUrl}
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
    {/if}
  {/if}
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
  }

  .btn.back {
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
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

  /* Step 1 — full-size template gallery. */
  .gallery {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 28px 24px 48px;
  }

  .gallery-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 22px;
    max-width: 1100px;
    margin-inline: auto;
  }

  .gallery-card {
    display: flex;
    flex-direction: column;
    text-align: left;
    padding: 0;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    cursor: pointer;
    transition: border-color 0.12s, box-shadow 0.12s, transform 0.12s;
  }

  .gallery-card:hover {
    border-color: var(--accent);
    box-shadow: var(--shadow-lg);
    transform: translateY(-2px);
  }

  .gallery-thumb-wrap {
    aspect-ratio: 17 / 22;
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
    overflow: hidden;
  }

  .gallery-thumb {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top;
    display: block;
  }

  .gallery-meta {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 12px 14px 14px;
  }

  .gallery-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }

  .gallery-desc {
    font-size: 12px;
    line-height: 1.4;
    color: var(--muted);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .gallery-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 80px 24px;
    color: var(--muted);
  }

  .gallery-loading .spin {
    color: var(--accent);
  }

  .gallery-err {
    font-size: 12.5px;
    color: var(--badge-red-text);
    max-width: 420px;
    text-align: center;
    word-break: break-word;
  }

  .gallery-err-hint {
    font-size: 12px;
    color: var(--text-soft);
    max-width: 420px;
    text-align: center;
  }

  .template-strip {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 10px 18px;
    border-bottom: 1px solid var(--border);
    background: var(--surface-2);
    flex-shrink: 0;
    overflow-x: auto;
  }

  .template-strip-label {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    flex-shrink: 0;
  }

  .template-cards {
    display: flex;
    gap: 10px;
  }

  .template-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 6px;
    width: 86px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    flex-shrink: 0;
    transition: all 0.12s;
  }

  .template-card:hover {
    border-color: var(--border-strong);
  }

  .template-card.selected {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }

  .template-thumb {
    width: 100%;
    aspect-ratio: 17 / 22;
    object-fit: cover;
    object-position: top;
    border-radius: 3px;
    background: var(--surface-2);
    border: 1px solid var(--border);
  }

  .template-name {
    font-size: 11.5px;
    font-weight: 500;
    color: var(--text-soft);
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .template-check {
    position: absolute;
    top: 4px;
    right: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-contrast);
  }

  .detail-body {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1.25fr;
    min-height: 0;
  }

  .detail-body.single {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: 48px 24px;
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
    padding: 8px 12px 8px 16px;
    border-bottom: 1px solid var(--border);
    background: var(--surface-2);
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

  .handoff-content {
    width: 100%;
    max-width: 600px;
  }

  .handoff-section {
    margin-bottom: 24px;
  }

  .handoff-label {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    margin-bottom: 8px;
  }

  .handoff-code {
    display: block;
    padding: 12px 16px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    font-family: var(--mono);
    font-size: 13px;
    color: var(--code);
    word-break: break-all;
  }

  .handoff-hint {
    color: var(--text-soft);
    font-size: 14px;
    text-align: center;
    padding: 24px;
    background: var(--surface);
    border-radius: var(--radius);
    border: 1px solid var(--border);
    margin-top: 32px;
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

  .spin {
    animation: spin 0.8s linear infinite;
    display: inline-flex;
  }

  .spin-inline {
    animation: spin 0.8s linear infinite;
    display: inline-flex;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
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

  .btn.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-contrast);
  }

  .btn.primary:hover:not(:disabled) {
    background: var(--accent-hover);
    border-color: var(--accent-hover);
  }
</style>
