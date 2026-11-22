<script lang="ts">
  import Icon from "$lib/Icon.svelte";
  import { ApiError, deleteJob, getJob, updateJob } from "$lib/api";
  import { fmtDate } from "$lib/format";
  import { JOB_STATUSES, type JobDto } from "$lib/types";
  import StatusBadge from "./StatusBadge.svelte";

  let { id, onclose, onchanged }: { id: string; onclose: () => void; onchanged: () => void } = $props();

  let job = $state<JobDto | null>(null);
  let loadError = $state("");
  let status = $state("");
  let statusNote = $state("");
  let notes = $state("");
  let saving = $state(false);
  let saveError = $state("");

  $effect(() => {
    const current = id;
    job = null;
    loadError = "";
    getJob(current)
      .then((j) => {
        job = j;
        status = j.status;
        notes = j.notes ?? "";
        statusNote = "";
      })
      .catch((err) => (loadError = err instanceof ApiError ? err.message : "Couldn't load this job."));
  });

  const dirty = $derived(!!job && (status !== job.status || notes !== (job.notes ?? "")));

  async function save() {
    if (!job) return;
    const payload: Record<string, unknown> = {};
    if (status !== job.status) {
      payload.status = status;
      if (statusNote.trim()) payload.status_note = statusNote.trim();
    }
    if (notes !== (job.notes ?? "")) payload.notes = notes || null;
    saving = true;
    saveError = "";
    try {
      await updateJob(job.id, payload);
      job = await getJob(job.id);
      statusNote = "";
      onchanged();
    } catch (err) {
      saveError = err instanceof ApiError ? err.message : "Couldn't save changes.";
    } finally {
      saving = false;
    }
  }

  async function remove() {
    if (!job || !confirm(`Delete ${job.company} – ${job.role} and its history?`)) return;
    try {
      await deleteJob(job.id);
      onchanged();
      onclose();
    } catch (err) {
      saveError = err instanceof ApiError ? err.message : "Couldn't delete this job.";
    }
  }

  const salary = $derived.by(() => {
    if (!job || (job.salary_min == null && job.salary_max == null)) return "";
    const f = (n: number | null) => (n == null ? "?" : n.toLocaleString());
    return `${f(job.salary_min)} – ${f(job.salary_max)} ${job.salary_currency ?? ""}`.trim();
  });
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && onclose()} />

<div class="jd-backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div class="jd-modal" role="dialog" aria-modal="true" aria-label="Job details">
    <div class="modal-head">
      {#if job}
        <div class="head-title">
          <div class="title">{job.company}</div>
          <div class="sub">{job.role}</div>
        </div>
      {:else}
        <div class="title">Job</div>
      {/if}
      <button class="btn ghost-icon" type="button" aria-label="Close" onclick={onclose}><Icon name="x" size={18} /></button>
    </div>

    <div class="modal-body">
      {#if loadError}
        <p class="form-hint warn">{loadError}</p>
      {:else if !job}
        <p class="muted">Loading…</p>
      {:else}
        <dl class="facts">
          <div><dt>Status</dt><dd><StatusBadge status={job.status} /></dd></div>
          <div><dt>Location</dt><dd>{job.location ?? "—"}{job.work_mode ? ` · ${job.work_mode}` : ""}</dd></div>
          <div><dt>Applied</dt><dd>{fmtDate(job.applied_at) || "—"}</dd></div>
          <div><dt>Posted</dt><dd>{fmtDate(job.posted_at) || "—"}</dd></div>
          <div><dt>Source</dt><dd>{job.source ?? "—"}</dd></div>
          <div><dt>Match</dt><dd>{job.match_score ?? "—"}</dd></div>
          {#if salary}<div><dt>Salary</dt><dd>{salary}</dd></div>{/if}
          {#if job.tags.length}<div><dt>Tags</dt><dd>{job.tags.join(", ")}</dd></div>{/if}
        </dl>

        <div class="jd-links">
          {#if job.job_url}
            <a class="btn" href={job.job_url} target="_blank" rel="noopener noreferrer"><Icon name="link" size={14} /> Posting</a>
          {/if}
          {#if job.resume_id}
            <a class="btn" href="/resume/{job.resume_id}"><Icon name="file-text" size={14} /> Tailored resume</a>
          {/if}
        </div>

        <div class="form-row">
          <div class="form-section">
            <label class="form-label" for="jd-status">Move to status</label>
            <select id="jd-status" class="form-select" bind:value={status}>
              {#each JOB_STATUSES as s (s)}<option value={s}>{s}</option>{/each}
            </select>
          </div>
          <div class="form-section">
            <label class="form-label" for="jd-note">Note for this change</label>
            <input id="jd-note" class="form-input" bind:value={statusNote} disabled={status === job.status} placeholder="Optional" maxlength="1000" />
          </div>
        </div>
        <div class="form-section">
          <label class="form-label" for="jd-notes">Notes</label>
          <textarea id="jd-notes" class="form-input" rows="4" bind:value={notes} maxlength="10000"></textarea>
        </div>
        {#if saveError}<p class="form-hint warn">{saveError}</p>{/if}

        <h3 class="history-title">History</h3>
        <ol class="history">
          {#each job.events ?? [] as ev (ev.id)}
            <li>
              <span class="dot"></span>
              <div>
                <div>
                  {#if ev.from_status}<span class="muted">{ev.from_status} →</span>{/if}
                  <StatusBadge status={ev.to_status} />
                  <span class="muted small">{fmtDate(ev.created_at)} · {ev.actor === "apikey" ? "agent" : "you"}</span>
                </div>
                {#if ev.note}<div class="ev-note">{ev.note}</div>{/if}
              </div>
            </li>
          {/each}
        </ol>
      {/if}
    </div>

    {#if job}
      <div class="modal-foot">
        <button class="btn danger" type="button" onclick={remove}><Icon name="trash" size={14} /> Delete</button>
        <span class="spacer"></span>
        <button class="btn" type="button" onclick={onclose}>Close</button>
        <button class="btn primary" type="button" disabled={!dirty || saving} onclick={save}>{saving ? "Saving…" : "Save"}</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .jd-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    z-index: 50;
  }
  .jd-modal {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-xl);
    width: 100%;
    max-width: 640px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .modal-body {
    padding: 20px;
    overflow-y: auto;
  }
  .head-title .title {
    font-weight: 600;
    font-size: 15px;
  }
  .head-title .sub {
    color: var(--muted);
    font-size: 12.5px;
  }
  .facts {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 12px 16px;
    margin: 0 0 16px;
  }
  .facts dt {
    font-size: 12px;
    color: var(--muted);
    margin-bottom: 4px;
  }
  .facts dd {
    margin: 0;
    font-size: 13.5px;
    text-transform: none;
  }
  .jd-links {
    display: flex;
    gap: 8px;
    margin-bottom: 18px;
  }
  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .form-section {
    margin-bottom: 14px;
  }
  .history-title {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    margin: 18px 0 10px;
  }
  .history {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .history li {
    display: grid;
    grid-template-columns: 14px 1fr;
    gap: 10px;
    padding: 6px 0;
    font-size: 13px;
  }
  .dot {
    width: 8px;
    height: 8px;
    margin-top: 6px;
    border-radius: 50%;
    background: var(--border-strong);
  }
  .ev-note {
    color: var(--text-soft);
    margin-top: 4px;
  }
  .muted {
    color: var(--muted);
  }
  .small {
    font-size: 12px;
    margin-left: 6px;
  }
  .spacer {
    flex: 1;
  }
  .modal-foot {
    justify-content: stretch;
  }
  @media (max-width: 560px) {
    .form-row {
      grid-template-columns: 1fr;
    }
  }
</style>
