<script lang="ts">
  import Icon from "$lib/Icon.svelte";
  import { fmtDate } from "$lib/format";
  import type { JobDto } from "$lib/types";
  import StatusBadge from "./StatusBadge.svelte";

  let {
    jobs,
    sort,
    order,
    onsort,
    onopen,
  }: {
    jobs: JobDto[];
    sort: string;
    order: "asc" | "desc";
    onsort: (field: string) => void;
    onopen: (id: string) => void;
  } = $props();

  const columns: Array<{ key: string; label: string; sortable?: boolean }> = [
    { key: "company", label: "Company", sortable: true },
    { key: "role", label: "Role" },
    { key: "location", label: "Location" },
    { key: "status", label: "Status", sortable: true },
    { key: "applied_at", label: "Applied", sortable: true },
    { key: "source", label: "Source" },
    { key: "match_score", label: "Match", sortable: true },
    { key: "updated_at", label: "Updated", sortable: true },
  ];
</script>

<div class="table-wrap">
  <table class="jobs-table">
    <thead>
      <tr>
        {#each columns as col (col.key)}
          <th scope="col" aria-sort={sort === col.key ? (order === "asc" ? "ascending" : "descending") : undefined}>
            {#if col.sortable}
              <button type="button" class="th-sort" class:active={sort === col.key} onclick={() => onsort(col.key)}>
                {col.label}
                {#if sort === col.key}
                  <Icon name={order === "asc" ? "arrow-up" : "arrow-down"} size={12} stroke={2.4} />
                {/if}
              </button>
            {:else}
              {col.label}
            {/if}
          </th>
        {/each}
        <th scope="col"><span class="sr-only">Links</span></th>
      </tr>
    </thead>
    <tbody>
      {#each jobs as job (job.id)}
        <tr
          tabindex="0"
          onclick={() => onopen(job.id)}
          onkeydown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onopen(job.id))}
        >
          <td class="strong">{job.company}</td>
          <td>{job.role}</td>
          <td class="muted">
            {job.location ?? ""}{#if job.work_mode}<span class="mode">{job.work_mode}</span>{/if}
          </td>
          <td><StatusBadge status={job.status} /></td>
          <td class="muted nowrap">{fmtDate(job.applied_at)}</td>
          <td class="muted">{job.source ?? ""}</td>
          <td class="num">{job.match_score ?? ""}</td>
          <td class="muted nowrap">{fmtDate(job.updated_at)}</td>
          <td class="links">
            {#if job.job_url}
              <a href={job.job_url} target="_blank" rel="noopener noreferrer" title="Open posting" onclick={(e) => e.stopPropagation()}>
                <Icon name="link" size={15} />
              </a>
            {/if}
            {#if job.resume_id}
              <a href="/resume/{job.resume_id}" title="Open tailored resume" onclick={(e) => e.stopPropagation()}>
                <Icon name="file-text" size={15} />
              </a>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .table-wrap {
    overflow-x: auto;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .jobs-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13.5px;
  }
  th {
    text-align: left;
    font-size: 12px;
    font-weight: 600;
    color: var(--muted);
    padding: 11px 14px;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  .th-sort {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: 0;
    padding: 0;
    font: inherit;
    color: inherit;
    cursor: pointer;
  }
  .th-sort:hover,
  .th-sort.active {
    color: var(--text);
  }
  td {
    padding: 11px 14px;
    border-bottom: 1px solid var(--divider);
    color: var(--text-soft);
    vertical-align: middle;
  }
  tbody tr {
    cursor: pointer;
    transition: background 0.1s;
  }
  tbody tr:last-child td {
    border-bottom: 0;
  }
  tbody tr:hover,
  tbody tr:focus-visible {
    background: var(--surface-2);
    outline: none;
  }
  .strong {
    color: var(--text);
    font-weight: 600;
  }
  .muted {
    color: var(--muted);
  }
  .nowrap {
    white-space: nowrap;
  }
  .num {
    font-variant-numeric: tabular-nums;
    text-align: right;
  }
  .mode {
    margin-left: 6px;
    font-size: 11.5px;
    padding: 1px 6px;
    border-radius: 6px;
    background: var(--surface-2);
    text-transform: capitalize;
  }
  .links {
    white-space: nowrap;
    text-align: right;
  }
  .links a {
    display: inline-grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    color: var(--muted);
  }
  .links a:hover {
    background: var(--surface-3);
    color: var(--text);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
</style>
