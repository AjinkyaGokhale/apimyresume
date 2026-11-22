<script lang="ts">
  import { goto, invalidateAll } from "$app/navigation";
  import { page } from "$app/stores";
  import Icon from "$lib/Icon.svelte";
  import StatsBar from "$lib/StatsBar.svelte";
  import Chart from "$lib/jobs/Chart.svelte";
  import JobDetail from "$lib/jobs/JobDetail.svelte";
  import JobForm from "$lib/jobs/JobForm.svelte";
  import JobTable from "$lib/jobs/JobTable.svelte";
  import { pct } from "$lib/format";
  import { JOB_STATUSES, WORK_MODES, type Stat } from "$lib/types";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const params = $derived(data.params);
  const stats = $derived(data.stats);

  let openId = $state<string | null>(null);
  let adding = $state(false);

  // --- URL is the single source of truth for filters, sort and page ----------
  function setParams(updates: Record<string, string | null>, resetPage = true) {
    const q = new URLSearchParams($page.url.searchParams);
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "") q.delete(k);
      else q.set(k, v);
    }
    if (resetPage) q.delete("page");
    const s = q.toString();
    goto(s ? `?${s}` : $page.url.pathname, { keepFocus: true, noScroll: true, replaceState: true });
  }

  // Search is debounced so each keystroke doesn't refetch.
  let search = $state("");
  $effect(() => {
    search = params.q;
  });
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  function onSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => setParams({ q: search.trim() }), 300);
  }

  function toggleStatus(s: string) {
    const next = params.status.includes(s) ? params.status.filter((x) => x !== s) : [...params.status, s];
    setParams({ status: next.join(",") });
  }

  function setRange(range: string) {
    setParams(range === "custom" ? { range } : { range: range === "all" ? null : range, from: null, to: null });
  }

  function onSort(field: string) {
    const order = params.sort === field && params.order === "desc" ? "asc" : "desc";
    setParams({ sort: field, order });
  }

  const hasFilters = $derived(
    !!(params.q || params.status.length || params.location || params.work_mode || params.source || params.tag) ||
      params.range !== "all",
  );

  function clearFilters() {
    search = "";
    goto($page.url.pathname, { keepFocus: true, noScroll: true, replaceState: true });
  }

  // --- Metrics ----------------------------------------------------------------
  const tiles = $derived.by((): Stat[] => {
    if (!stats) return [];
    return [
      { label: "Jobs tracked", value: stats.total },
      { label: "Applied (30 days)", value: stats.applied_last_30d },
      { label: "Response rate", value: stats.applied_total ? pct(stats.rates.response_rate) : "—" },
      { label: "Interview rate", value: stats.applied_total ? pct(stats.rates.interview_rate) : "—" },
      { label: "Offers", value: stats.funnel.offered },
      { label: "Avg. days to reply", value: stats.avg_days_to_response ?? "—" },
    ];
  });

  function periodLabel(p: string): string {
    // Weekly buckets are a Monday (YYYY-MM-DD); monthly are YYYY-MM.
    const d = new Date(p.length === 7 ? `${p}-01T12:00:00` : `${p}T12:00:00`);
    return p.length === 7
      ? d.toLocaleDateString(undefined, { month: "short", year: "numeric" })
      : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  const totalPages = $derived(Math.max(Math.ceil(data.pagination.total / data.pagination.limit), 1));
</script>

<div class="page-head">
  <div class="page-heading">
    <h1 class="page-title">Job tracker</h1>
    <p class="page-subline">
      {#if stats}{stats.total} {stats.total === 1 ? "job" : "jobs"}{hasFilters ? " match these filters" : " tracked"}{/if}
    </p>
  </div>
  <button class="btn red new-resume" type="button" onclick={() => (adding = true)}>
    <Icon name="plus" size={16} /> Add job
  </button>
</div>

{#if data.apiDown}
  <div class="banner"><Icon name="alert" size={18} /> The API isn't reachable right now. Try again in a moment.</div>
{/if}

{#if stats}
  <StatsBar stats={tiles} />
{/if}

<!-- Filters sit in one row above the charts so metrics and table always agree. -->
<div class="toolbar">
  <div class="search">
    <Icon name="search" size={16} />
    <input type="search" placeholder="Search company, role, location, notes…" bind:value={search} oninput={onSearch} aria-label="Search jobs" />
  </div>

  <select class="select" value={params.range} onchange={(e) => setRange(e.currentTarget.value)} aria-label="Date range">
    <option value="all">All time</option>
    <option value="7d">Last 7 days</option>
    <option value="30d">Last 30 days</option>
    <option value="90d">Last 90 days</option>
    <option value="ytd">This year</option>
    <option value="custom">Custom range…</option>
  </select>

  {#if params.range === "custom"}
    <div class="date-range">
      <input type="date" class="select date" value={params.from} max={params.to || undefined} onchange={(e) => setParams({ from: e.currentTarget.value })} aria-label="From date" />
      <span class="muted">to</span>
      <input type="date" class="select date" value={params.to} min={params.from || undefined} onchange={(e) => setParams({ to: e.currentTarget.value })} aria-label="To date" />
    </div>
  {/if}

  {#if params.range !== "all"}
    <select class="select" value={params.date_field} onchange={(e) => setParams({ date_field: e.currentTarget.value === "applied_at" ? null : e.currentTarget.value })} aria-label="Date field">
      <option value="applied_at">by applied date</option>
      <option value="created_at">by date added</option>
      <option value="posted_at">by posted date</option>
      <option value="updated_at">by last update</option>
    </select>
  {/if}

  <select class="select" value={params.location} onchange={(e) => setParams({ location: e.currentTarget.value })} aria-label="Location">
    <option value="">All locations</option>
    {#each stats?.facets.locations ?? [] as l (l)}<option value={l}>{l}</option>{/each}
  </select>

  <select class="select" value={params.work_mode} onchange={(e) => setParams({ work_mode: e.currentTarget.value })} aria-label="Work mode">
    <option value="">Any work mode</option>
    {#each WORK_MODES as m (m)}<option value={m}>{m}</option>{/each}
  </select>

  {#if stats?.facets.sources.length}
    <select class="select" value={params.source} onchange={(e) => setParams({ source: e.currentTarget.value })} aria-label="Source">
      <option value="">All sources</option>
      {#each stats.facets.sources as s (s)}<option value={s}>{s}</option>{/each}
    </select>
  {/if}

  {#if stats?.facets.tags.length}
    <select class="select" value={params.tag} onchange={(e) => setParams({ tag: e.currentTarget.value })} aria-label="Tag">
      <option value="">All tags</option>
      {#each stats.facets.tags as t (t)}<option value={t}>{t}</option>{/each}
    </select>
  {/if}
</div>

<div class="chips" role="group" aria-label="Filter by status">
  {#each JOB_STATUSES as s (s)}
    <button type="button" class="chip" class:active={params.status.includes(s)} aria-pressed={params.status.includes(s)} onclick={() => toggleStatus(s)}>
      {s}<span class="chip-count">{stats?.by_status[s] ?? 0}</span>
    </button>
  {/each}
  {#if hasFilters}
    <button type="button" class="chip clear" onclick={clearFilters}><Icon name="x" size={13} /> Clear filters</button>
  {/if}
</div>

{#if stats && stats.total === 0 && !hasFilters}
  <div class="empty onboarding">
    <div class="empty-icon large"><Icon name="briefcase" size={30} /></div>
    <h2>No jobs tracked yet</h2>
    <p class="empty-sub">
      Have your agent call <code>POST /api/v1/jobs</code> after it tailors a resume, or add one by hand.
    </p>
    <div class="empty-actions">
      <button class="btn primary" type="button" onclick={() => (adding = true)}><Icon name="plus" size={15} /> Add job</button>
      <a class="btn" href="/docs">API docs</a>
    </div>
  </div>
{:else if stats}
  <section class="charts" aria-label="Job metrics">
    <div class="chart-card wide">
      <h2 class="chart-title">Applications &amp; replies over time</h2>
      {#if stats.timeline.length}
        <Chart
          type="line"
          label="Applications and replies per period"
          labels={stats.timeline.map((t) => periodLabel(t.period))}
          series={[
            { label: "Applied", data: stats.timeline.map((t) => t.applied) },
            { label: "Replies", data: stats.timeline.map((t) => t.responses) },
          ]}
        />
      {:else}
        <p class="chart-empty">No applications in this range yet.</p>
      {/if}
    </div>

    <div class="chart-card">
      <h2 class="chart-title">Funnel</h2>
      <Chart
        type="bar"
        horizontal
        height={200}
        label="Jobs reaching each stage"
        labels={["Applied", "Got a reply", "Interviewed", "Offer"]}
        series={[{ label: "Jobs", data: [stats.funnel.applied, stats.funnel.responded, stats.funnel.interviewed, stats.funnel.offered] }]}
      />
    </div>

    <div class="chart-card">
      <h2 class="chart-title">Current status</h2>
      <Chart
        type="bar"
        horizontal
        height={200}
        label="Jobs by current status"
        labels={JOB_STATUSES.filter((s) => stats.by_status[s] > 0)}
        series={[{ label: "Jobs", data: JOB_STATUSES.filter((s) => stats.by_status[s] > 0).map((s) => stats.by_status[s]) }]}
      />
    </div>

    <div class="chart-card">
      <h2 class="chart-title">Top locations</h2>
      {#if stats.by_location.length}
        <Chart
          type="bar"
          horizontal
          height={200}
          label="Jobs per location"
          labels={stats.by_location.map((l) => l.key)}
          series={[{ label: "Jobs", data: stats.by_location.map((l) => l.count) }]}
        />
      {:else}
        <p class="chart-empty">No locations recorded.</p>
      {/if}
    </div>

    <div class="chart-card">
      <h2 class="chart-title">By source</h2>
      {#if stats.by_source.length}
        <Chart
          type="bar"
          horizontal
          height={200}
          label="Jobs per source"
          labels={stats.by_source.map((l) => l.key)}
          series={[{ label: "Jobs", data: stats.by_source.map((l) => l.count) }]}
        />
      {:else}
        <p class="chart-empty">No sources recorded.</p>
      {/if}
    </div>
  </section>

  {#if data.jobs.length}
    <div class="results-info">
      Showing {(data.pagination.page - 1) * data.pagination.limit + 1}–{(data.pagination.page - 1) * data.pagination.limit + data.jobs.length}
      of {data.pagination.total}
    </div>
    <JobTable jobs={data.jobs} sort={params.sort} order={params.order} onsort={onSort} onopen={(id) => (openId = id)} />
    {#if totalPages > 1}
      <nav class="pager" aria-label="Pagination">
        <button class="page-btn" type="button" disabled={data.pagination.page <= 1} onclick={() => setParams({ page: String(data.pagination.page - 1) }, false)} aria-label="Previous page">
          <Icon name="chevron-left" size={16} />
        </button>
        <span class="muted">Page {data.pagination.page} of {totalPages}</span>
        <button class="page-btn" type="button" disabled={!data.pagination.has_next} onclick={() => setParams({ page: String(data.pagination.page + 1) }, false)} aria-label="Next page">
          <Icon name="chevron-right" size={16} />
        </button>
      </nav>
    {/if}
  {:else}
    <div class="empty">
      <div class="empty-icon"><Icon name="search" size={24} /></div>
      No jobs match these filters.
    </div>
  {/if}
{/if}

{#if openId}
  <JobDetail id={openId} onclose={() => (openId = null)} onchanged={() => invalidateAll()} />
{/if}
{#if adding}
  <JobForm onclose={() => (adding = false)} oncreated={() => invalidateAll()} />
{/if}

<style>
  .toolbar {
    margin-bottom: 12px;
  }
  .search {
    min-width: 220px;
  }
  .search input::-webkit-search-cancel-button {
    filter: invert(0.6);
  }
  .date-range {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .select.date {
    padding-right: 10px;
    background-image: none;
    color-scheme: dark;
  }
  .select {
    text-transform: none;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 20px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 11px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-soft);
    font: inherit;
    font-size: 12.5px;
    text-transform: capitalize;
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s, color 0.12s;
  }
  .chip:hover {
    border-color: var(--border-strong);
    color: var(--text);
  }
  .chip.active {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-contrast);
  }
  .chip-count {
    font-size: 11.5px;
    opacity: 0.7;
    font-variant-numeric: tabular-nums;
  }
  .chip.clear {
    text-transform: none;
    color: var(--muted);
    border-style: dashed;
  }
  .charts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }
  .chart-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px 18px;
    min-width: 0;
  }
  .chart-card.wide {
    grid-column: 1 / -1;
  }
  .chart-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-soft);
    margin: 0 0 12px;
  }
  .chart-empty {
    color: var(--muted);
    font-size: 13px;
    margin: 24px 0;
    text-align: center;
  }
  .results-info {
    margin: 0 0 10px;
  }
  .pager {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin: 16px 0 8px;
    font-size: 13px;
  }
  .muted {
    color: var(--muted);
  }
  .empty-sub code {
    font-family: var(--mono);
    font-size: 12.5px;
    color: var(--code);
  }
  @media (max-width: 860px) {
    .charts {
      grid-template-columns: 1fr;
    }
    .search {
      flex-basis: 100%;
    }
  }
</style>
