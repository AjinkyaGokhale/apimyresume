<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { authLogin, authState } from "$lib/auth";

  let username = $state("");
  let password = $state("");
  let submitting = $state(false);
  let error = $state<string | null>(null);

  // If the instance still needs setup, bounce to /setup.
  $effect(() => {
    (async () => {
      try {
        const s = await authState();
        if (s.needs_setup) {
          await goto("/setup", { replaceState: true });
        }
      } catch {
        // network down — let the form render anyway
      }
    })();
  });

  async function submit(e: Event) {
    e.preventDefault();
    if (submitting) return;
    error = null;
    submitting = true;
    try {
      await authLogin(username.trim(), password);
      const next = $page.url.searchParams.get("next") || "/";
      await goto(next, { replaceState: true });
    } catch (e) {
      error = e instanceof Error ? e.message : "Login failed";
    } finally {
      submitting = false;
    }
  }
</script>

<div class="auth-page">
  <div class="auth-card">
    <div class="brand">
      <span class="brand-name">apimyresume</span>
    </div>
    <h1>Sign in</h1>
    <p class="hint">Welcome back. Sign in to manage your resumes and API keys.</p>

    <form onsubmit={submit}>
      <label class="form-label" for="username">Username</label>
      <input
        id="username"
        class="form-input"
        type="text"
        autocomplete="username"
        required
        minlength="3"
        maxlength="40"
        bind:value={username}
        disabled={submitting}
      />

      <label class="form-label" for="password">Password</label>
      <input
        id="password"
        class="form-input"
        type="password"
        autocomplete="current-password"
        required
        minlength="8"
        maxlength="200"
        bind:value={password}
        disabled={submitting}
      />

      {#if error}
        <p class="form-hint warn">{error}</p>
      {/if}

      <button class="btn primary block" type="submit" disabled={submitting}>
        {submitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  </div>
</div>

<style>
  .auth-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--canvas);
    padding: 24px;
    box-sizing: border-box;
  }
  .auth-card {
    width: 100%;
    max-width: 380px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 28px;
    box-sizing: border-box;
  }
  .brand {
    margin-bottom: 18px;
  }
  .brand-name {
    font-family: "Figtree", system-ui, sans-serif;
    font-weight: 600;
    font-size: 18px;
    color: var(--text);
  }
  h1 {
    font-size: 22px;
    font-weight: 600;
    margin: 0 0 6px 0;
    color: var(--text);
  }
  .hint {
    font-size: 13px;
    color: var(--muted);
    margin: 0 0 22px 0;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .form-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-soft);
    margin-top: 6px;
  }
  .form-hint.warn {
    color: var(--danger);
    font-size: 12px;
  }
  .btn.primary {
    background: var(--accent);
    color: var(--accent-contrast);
    border: 1px solid var(--accent);
    border-radius: var(--radius-sm);
    padding: 10px 14px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
  }
  .btn.primary:hover:not(:disabled) {
    background: var(--accent-hover);
  }
  .btn.primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .btn.block {
    width: 100%;
    margin-top: 10px;
  }
</style>
