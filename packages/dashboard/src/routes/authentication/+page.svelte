<script lang="ts">
  import Icon from "$lib/Icon.svelte";
  import { authChangePassword } from "$lib/auth";

  let current = $state("");
  let next = $state("");
  let confirm = $state("");
  let submitting = $state(false);
  let error = $state<string | null>(null);
  let toast = $state<string | null>(null);

  const minMet = $derived(next ? next.length >= 8 : null);
  const match = $derived(confirm ? next === confirm : null);
  const canSubmit = $derived(
    !submitting && current.length > 0 && next.length >= 8 && next === confirm,
  );

  function showToast(msg: string) {
    toast = msg;
    setTimeout(() => (toast = null), 2500);
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    error = null;
    if (next !== confirm) {
      error = "New passwords do not match";
      return;
    }
    if (next.length < 8) {
      error = "Password must be at least 8 characters";
      return;
    }
    submitting = true;
    try {
      await authChangePassword(current, next);
      current = "";
      next = "";
      confirm = "";
      showToast("Password changed");
    } catch (err) {
      error = err instanceof Error ? err.message : "Failed to change password";
    } finally {
      submitting = false;
    }
  }
</script>

<div class="page-wrap">
  <div class="page-head">
    <div class="page-heading">
      <h1 class="page-title">Authentication</h1>
      <p class="page-subline">
        Change the password for your owner account. Changing it signs out any other
        active sessions.
      </p>
    </div>
  </div>

  <div class="auth-card">
    <form onsubmit={submit}>
      <label class="form-label" for="current">Current password</label>
      <input
        id="current"
        class="form-input"
        type="password"
        autocomplete="current-password"
        required
        bind:value={current}
        disabled={submitting}
      />

      <label class="form-label" for="next">New password</label>
      <input
        id="next"
        class="form-input"
        type="password"
        autocomplete="new-password"
        required
        minlength="8"
        maxlength="200"
        bind:value={next}
        disabled={submitting}
      />
      {#if minMet !== null}
        <p class="hint" class:ok={minMet} class:bad={!minMet}>
          {minMet ? "Minimum 8 characters met" : "Minimum 8 characters required"}
        </p>
      {/if}

      <label class="form-label" for="confirm">Confirm new password</label>
      <input
        id="confirm"
        class="form-input"
        type="password"
        autocomplete="new-password"
        required
        minlength="8"
        maxlength="200"
        bind:value={confirm}
        disabled={submitting}
      />
      {#if match !== null}
        <p class="hint" class:ok={match} class:bad={!match}>
          {match ? "Passwords match" : "Passwords do not match"}
        </p>
      {/if}

      {#if error}
        <p class="hint bad">{error}</p>
      {/if}

      <button class="btn primary" type="submit" disabled={!canSubmit}>
        {#if submitting}
          <span class="spin"><Icon name="refresh" size={15} /></span> Saving…
        {:else}
          Change password
        {/if}
      </button>
    </form>
  </div>
</div>

{#if toast}
  <div class="toast">{toast}</div>
{/if}

<style>
  .page-wrap {
    padding: 24px 28px 64px;
    max-width: 560px;
  }
  .page-head {
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
    margin: 6px 0 0;
    font-size: 14px;
    color: var(--muted);
    line-height: 1.5;
  }

  .auth-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 22px;
  }

  .form-label {
    display: block;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-soft);
    margin: 16px 0 6px;
  }
  .form-label:first-of-type {
    margin-top: 0;
  }
  .form-input {
    width: 100%;
    box-sizing: border-box;
    padding: 10px 12px;
    font-size: 14px;
    color: var(--text);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    outline: none;
  }
  .form-input:focus {
    border-color: var(--border-strong);
  }

  .hint {
    margin: 6px 0 0;
    font-size: 12.5px;
  }
  .hint.ok {
    color: #4ade80;
  }
  .hint.bad {
    color: var(--danger);
  }

  .btn.primary {
    margin-top: 22px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px;
    font-size: 14px;
    font-weight: 600;
    color: var(--accent-contrast);
    background: var(--accent);
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
  }
  .btn.primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .spin {
    display: inline-flex;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  :global(.toast) {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--surface-3);
    color: var(--text);
    padding: 10px 18px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    font-size: 14px;
    z-index: 100;
  }
</style>
