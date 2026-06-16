<script lang="ts">
  import { page } from "$app/stores";
  import Icon from "$lib/Icon.svelte";
  import type { SchemaProp } from "$lib/api";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const publicApiUrl = $derived(($page.data.publicApiUrl as string) ?? "");
  const schema = $derived(data.schema);

  const typeLabel = (def: SchemaProp): string => {
    if (def.type === "array") return `array<${def.items?.type ?? "any"}>`;
    return def.type ?? "any";
  };

  const pretty = (v: unknown) => JSON.stringify(v, null, 2);
</script>

<div class="docs">
  <header class="docs-head">
    <h1>API Reference</h1>
    <p class="lead">
      A KB-driven resume API: one canonical <strong>base resume</strong> per person, with tailored
      <strong>child resumes</strong> created on top of it and rendered to PDF.
    </p>
    {#if publicApiUrl}
      <div class="baseurl">
        <span class="baseurl-label">Base URL</span>
        <code>{publicApiUrl}/api/v1</code>
      </div>
    {/if}
  </header>

  {#if data.apiDown || !schema}
    <div class="banner">
      <Icon name="alert" size={18} />
      Cannot reach the API — start it to load the live schema.
    </div>
  {:else}
    <!-- Authentication -->
    <section class="card">
      <h2><Icon name="lock" size={16} /> Authentication</h2>
      <p>
        Send your key in the <code>X-API-Key</code> header. API keys have full control of
        <strong>child resumes</strong> — create, read, tailor, <strong>update</strong>, re-render
        and delete them — and can <strong>read</strong> base resumes. The base resume itself is
        managed only by the owner in the dashboard (create / edit / delete); those base-write
        endpoints and API-key management return <code>403 owner_only</code> for API keys. Public,
        no auth: <code>GET /health</code>, <code>GET /schema</code>. Rendered PDFs and
        <code>*/thumbnail.svg</code> previews require auth (owner session or API key).
      </p>
      <pre class="code"><code>curl -H "X-API-Key: YOUR_KEY" {publicApiUrl}/api/v1/bases</code></pre>
    </section>

    <!-- Base resume endpoints -->
    {#if schema.endpoints?.length}
      <section>
        <h2 class="section-title">Base resume (read-only via API)</h2>
        <p class="section-sub">
          The base resume is the canonical knowledge base. API keys can read it to learn what is
          tailorable; creating and editing a base is done by the owner in the dashboard.
        </p>

        {#each schema.endpoints as ep (ep.method + ep.path)}
          <article class="endpoint">
            <div class="endpoint-head">
              <span class="method {ep.method.toLowerCase()}">{ep.method}</span>
              <code class="path">{ep.path}</code>
              {#if ep.auth}
                <span class="auth-chip"><Icon name="lock" size={11} /> {ep.auth}</span>
              {/if}
            </div>

            <p class="endpoint-summary">{ep.summary}</p>

            {#if ep.content_type}
              <div class="kv"><span class="k">Content-Type</span><code>{ep.content_type}</code></div>
            {/if}
            {#if ep.body}
              <div class="kv"><span class="k">Body</span><span class="v">{ep.body}</span></div>
            {/if}

            {#if ep.notes?.length}
              <ul class="notes">
                {#each ep.notes as note}
                  <li>{note}</li>
                {/each}
              </ul>
            {/if}

            {#if ep.example?.request}
              <div class="block-label">Example request</div>
              <pre class="code"><code>{pretty(ep.example.request)}</code></pre>
            {/if}

            {#if ep.returns}
              <div class="block-label">Returns</div>
              <pre class="code"><code>{pretty(ep.returns)}</code></pre>
            {/if}
          </article>
        {/each}
      </section>
    {/if}

    <!-- Create resume tool -->
    <section>
      <h2 class="section-title">Child resume</h2>
      <p class="section-sub">
        Child resumes are the main API surface: a child is a base plus a content-only
        <code>overrides</code> diff, rendered to its own PDF. Create, list, read, update, re-render
        and delete them with your API key — see each endpoint below, then the full create/update body.
      </p>

      {#if schema.child_endpoints?.length}
        {#each schema.child_endpoints as ep (ep.method + ep.path)}
          <article class="endpoint">
            <div class="endpoint-head">
              <span class="method {ep.method.toLowerCase()}">{ep.method}</span>
              <code class="path">{ep.path}</code>
              {#if ep.auth}
                <span class="auth-chip"><Icon name="lock" size={11} /> {ep.auth}</span>
              {/if}
            </div>

            <p class="endpoint-summary">{ep.summary}</p>

            {#if ep.content_type}
              <div class="kv"><span class="k">Content-Type</span><code>{ep.content_type}</code></div>
            {/if}
            {#if ep.body}
              <div class="kv"><span class="k">Body</span><span class="v">{ep.body}</span></div>
            {/if}

            {#if ep.notes?.length}
              <ul class="notes">
                {#each ep.notes as note}
                  <li>{note}</li>
                {/each}
              </ul>
            {/if}

            {#if ep.example?.request}
              <div class="block-label">Example request</div>
              <pre class="code"><code>{pretty(ep.example.request)}</code></pre>
            {/if}

            {#if ep.returns}
              <div class="block-label">Returns</div>
              <pre class="code"><code>{pretty(ep.returns)}</code></pre>
            {/if}
          </article>
        {/each}
      {/if}

      <article class="endpoint">
        <div class="endpoint-head">
          <span class="method post">POST</span>
          <code class="path">/api/v1/resumes</code>
          <span class="auth-chip"><Icon name="lock" size={11} /> X-API-Key</span>
        </div>
        <p class="endpoint-summary">{schema.description}</p>

        <div class="block-label">Create / update body (the <code>overrides</code> object and meta)</div>
        <div class="params">
          {@render propList(schema.parameters.properties ?? {}, schema.parameters.required ?? [])}
        </div>
      </article>

      {#if schema["x-aliases"]}
        <article class="endpoint">
          <div class="block-label">Field aliases</div>
          <p class="aliases-intro">Loose field names are normalised to these canonical paths.</p>
          <div class="alias-table">
            {#each Object.entries(schema["x-aliases"]) as [canonical, aliases]}
              <div class="alias-row">
                <code class="alias-canonical">{canonical}</code>
                <div class="alias-list">
                  {#each aliases as a}<code>{a}</code>{/each}
                </div>
              </div>
            {/each}
          </div>
        </article>
      {/if}
    </section>
  {/if}
</div>

<!-- Recursive renderer for a JSON-schema property map -->
{#snippet propList(props: Record<string, SchemaProp>, required: string[])}
  {#each Object.entries(props) as [name, def]}
    <div class="param">
      <div class="param-head">
        <code class="param-name">{name}</code>
        <span class="param-type">{typeLabel(def)}</span>
        {#if required.includes(name)}<span class="req">required</span>{/if}
      </div>
      {#if def.description}<p class="param-desc">{def.description}</p>{/if}
      {#if def.enum}
        <div class="param-enum">
          {#each def.enum as e}<code>{e}</code>{/each}
        </div>
      {/if}
      {#if def.example !== undefined}
        <div class="param-ex">e.g. <code>{JSON.stringify(def.example)}</code></div>
      {/if}
      {#if def.properties}
        <div class="param-children">
          {@render propList(def.properties, def.required ?? [])}
        </div>
      {:else if def.items?.properties}
        <div class="param-children">
          {@render propList(def.items.properties, def.items.required ?? [])}
        </div>
      {/if}
    </div>
  {/each}
{/snippet}

<style>
  .docs {
    max-width: 880px;
    margin-inline: auto;
    padding: 4px 6px 48px;
  }

  .docs-head {
    margin-bottom: 28px;
  }

  .docs-head h1 {
    font-size: 26px;
    font-weight: 700;
    margin: 0 0 8px;
    color: var(--text);
    letter-spacing: -0.02em;
  }

  .lead {
    font-size: 15px;
    line-height: 1.6;
    color: var(--text-soft);
    margin: 0 0 16px;
  }

  .lead strong {
    color: var(--text);
    font-weight: 600;
  }

  .baseurl {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }

  .baseurl-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }

  .baseurl code {
    font-size: 13px;
    color: var(--code);
  }

  .banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px;
    background: var(--badge-red-bg);
    border: 1px solid var(--badge-red-text);
    color: var(--badge-red-text);
    border-radius: var(--radius-sm);
    font-size: 13px;
  }

  .section-title {
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    margin: 36px 0 4px;
  }

  .section-sub {
    font-size: 14px;
    color: var(--text-soft);
    margin: 0 0 16px;
    line-height: 1.55;
  }

  .card,
  .endpoint {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 18px 20px;
    margin-bottom: 14px;
  }

  .card h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 16px;
    font-weight: 600;
    margin: 0 0 10px;
    color: var(--text);
  }

  .card p {
    font-size: 14px;
    line-height: 1.6;
    color: var(--text-soft);
    margin: 0 0 12px;
  }

  /* Endpoint header */
  .endpoint-head {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 10px;
  }

  .method {
    font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.03em;
    padding: 3px 8px;
    border-radius: 6px;
    border: 1px solid transparent;
    background: var(--surface-2);
    color: var(--text);
  }
  .method.get {
    background: var(--badge-green-bg);
    color: var(--badge-green-text);
  }
  .method.delete {
    background: var(--badge-red-bg);
    color: var(--badge-red-text);
  }
  .method.post,
  .method.patch,
  .method.put {
    background: var(--surface-2);
    color: var(--text);
    border-color: var(--border);
  }

  .path {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
  }

  .auth-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
    font-size: 11px;
    color: var(--muted);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 2px 8px;
  }

  .endpoint-summary {
    font-size: 14px;
    line-height: 1.55;
    color: var(--text-soft);
    margin: 0 0 12px;
  }

  .kv {
    display: flex;
    gap: 10px;
    font-size: 13px;
    margin-bottom: 8px;
  }

  .kv .k {
    flex-shrink: 0;
    min-width: 96px;
    font-weight: 600;
    color: var(--muted);
  }

  .kv .v {
    color: var(--text-soft);
  }

  .notes {
    margin: 10px 0 12px;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .notes li {
    font-size: 13px;
    line-height: 1.55;
    color: var(--text-soft);
  }

  .block-label {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    margin: 12px 0 6px;
  }

  /* Code blocks */
  .code {
    background: var(--canvas);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 12px 14px;
    overflow-x: auto;
    margin: 0;
  }

  .code code {
    font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
    font-size: 12.5px;
    line-height: 1.6;
    color: var(--code);
    white-space: pre;
  }

  code {
    font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
  }

  /* inline code chips inside prose */
  p code,
  .kv code,
  .baseurl code {
    background: var(--surface-2);
    border-radius: 5px;
    padding: 1px 6px;
    font-size: 12.5px;
    color: var(--code);
  }

  /* Parameter tree */
  .param {
    padding: 12px 0;
    border-top: 1px solid var(--divider);
  }
  .param:first-child {
    border-top: none;
    padding-top: 4px;
  }

  .param-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .param-name {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--text);
  }

  .param-type {
    font-size: 12px;
    color: var(--muted);
    font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
  }

  .req {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--badge-red-text);
    background: var(--badge-red-bg);
    border-radius: 999px;
    padding: 1px 7px;
  }

  .param-desc {
    font-size: 13px;
    line-height: 1.5;
    color: var(--text-soft);
    margin: 6px 0 0;
  }

  .param-enum,
  .param-ex {
    margin-top: 6px;
    font-size: 12px;
    color: var(--muted);
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
  }

  .param-enum code,
  .param-ex code {
    background: var(--surface-2);
    border-radius: 5px;
    padding: 1px 6px;
    font-size: 12px;
    color: var(--code);
  }

  .param-children {
    margin-top: 10px;
    margin-left: 14px;
    padding-left: 14px;
    border-left: 2px solid var(--divider);
  }

  /* Aliases */
  .aliases-intro {
    font-size: 13px;
    color: var(--text-soft);
    margin: 0 0 12px;
  }

  .alias-table {
    display: flex;
    flex-direction: column;
  }

  .alias-row {
    display: flex;
    gap: 14px;
    padding: 10px 0;
    border-top: 1px solid var(--divider);
    flex-wrap: wrap;
  }
  .alias-row:first-child {
    border-top: none;
  }

  .alias-canonical {
    flex-shrink: 0;
    min-width: 220px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }

  .alias-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .alias-list code {
    background: var(--surface-2);
    border-radius: 5px;
    padding: 2px 7px;
    font-size: 12px;
    color: var(--text-soft);
  }

  @media (max-width: 720px) {
    .alias-canonical {
      min-width: 0;
    }
    .kv {
      flex-direction: column;
      gap: 2px;
    }
  }
</style>
