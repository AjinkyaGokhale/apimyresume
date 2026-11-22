<script lang="ts">
  import Icon from "$lib/Icon.svelte";
  import { ApiError, createJob } from "$lib/api";
  import { JOB_STATUSES, WORK_MODES } from "$lib/types";

  let { onclose, oncreated }: { onclose: () => void; oncreated: () => void } = $props();

  let company = $state("");
  let role = $state("");
  let jobUrl = $state("");
  let location = $state("");
  let workMode = $state("");
  let status = $state("applied");
  let source = $state("");
  let notes = $state("");
  let saving = $state(false);
  let error = $state("");

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = { company: company.trim(), role: role.trim(), status };
    if (jobUrl.trim()) payload.job_url = jobUrl.trim();
    if (location.trim()) payload.location = location.trim();
    if (workMode) payload.work_mode = workMode;
    if (source.trim()) payload.source = source.trim();
    if (notes.trim()) payload.notes = notes.trim();
    saving = true;
    error = "";
    try {
      await createJob(payload);
      oncreated();
      onclose();
    } catch (err) {
      error = err instanceof ApiError ? err.message : "Couldn't add this job.";
    } finally {
      saving = false;
    }
  }
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && onclose()} />

<div class="jf-backdrop" role="presentation" onclick={(e) => e.target === e.currentTarget && onclose()}>
  <div role="dialog" aria-modal="true" aria-label="Add job" class="jf-dialog">
  <form class="jf-modal" onsubmit={submit}>
    <div class="modal-head">
      <span class="modal-title">Add job</span>
      <button class="btn ghost-icon" type="button" aria-label="Close" onclick={onclose}><Icon name="x" size={18} /></button>
    </div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-section">
          <label class="form-label" for="jf-company">Company</label>
          <input id="jf-company" class="form-input" bind:value={company} required maxlength="200" />
        </div>
        <div class="form-section">
          <label class="form-label" for="jf-role">Role</label>
          <input id="jf-role" class="form-input" bind:value={role} required maxlength="200" />
        </div>
      </div>
      <div class="form-section">
        <label class="form-label" for="jf-url">Posting URL</label>
        <input id="jf-url" class="form-input" type="url" bind:value={jobUrl} placeholder="https://…" maxlength="2048" />
      </div>
      <div class="form-row">
        <div class="form-section">
          <label class="form-label" for="jf-location">Location</label>
          <input id="jf-location" class="form-input" bind:value={location} maxlength="200" />
        </div>
        <div class="form-section">
          <label class="form-label" for="jf-mode">Work mode</label>
          <select id="jf-mode" class="form-select" bind:value={workMode}>
            <option value="">—</option>
            {#each WORK_MODES as m (m)}<option value={m}>{m}</option>{/each}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-section">
          <label class="form-label" for="jf-status">Status</label>
          <select id="jf-status" class="form-select" bind:value={status}>
            {#each JOB_STATUSES as s (s)}<option value={s}>{s}</option>{/each}
          </select>
        </div>
        <div class="form-section">
          <label class="form-label" for="jf-source">Source</label>
          <input id="jf-source" class="form-input" bind:value={source} placeholder="linkedin, referral…" maxlength="100" />
        </div>
      </div>
      <div class="form-section">
        <label class="form-label" for="jf-notes">Notes</label>
        <textarea id="jf-notes" class="form-input" rows="3" bind:value={notes} maxlength="10000"></textarea>
      </div>
      {#if error}<p class="form-hint warn">{error}</p>{/if}
    </div>
    <div class="modal-foot">
      <button class="btn" type="button" onclick={onclose}>Cancel</button>
      <button class="btn primary" type="submit" disabled={saving}>{saving ? "Adding…" : "Add job"}</button>
    </div>
  </form>
  </div>
</div>

<style>
  .jf-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    z-index: 50;
  }
  .jf-dialog {
    width: 100%;
    max-width: 560px;
  }
  .jf-modal {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-xl);
    width: 100%;
    max-width: 560px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .modal-body {
    padding: 20px;
    overflow-y: auto;
  }
  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .form-section {
    margin-bottom: 14px;
  }
  @media (max-width: 560px) {
    .form-row {
      grid-template-columns: 1fr;
    }
  }
</style>
