<script lang="ts">
  import { goto } from "$app/navigation";
  import { authState, authSetup } from "$lib/auth";

  let username = $state("");
  let password = $state("");
  let confirm = $state("");
  let submitting = $state(false);
  let error = $state<string | null>(null);
  let createdKey = $state<string | null>(null);
  let copied = $state(false);

  // If an owner already exists, bounce to /login.
  $effect(() => {
    (async () => {
      try {
        const s = await authState();
        if (!s.needs_setup) {
          await goto("/login", { replaceState: true });
        }
      } catch {
        // network down — let the form render
      }
    })();
  });

  async function submit(e: Event) {
    e.preventDefault();
    if (submitting) return;
    error = null;
    if (password !== confirm) {
      error = "Passwords do not match";
      return;
    }
    submitting = true;
    try {
      const res = await authSetup(username.trim(), password);
      createdKey = res.api_key;
      try {
        await navigator.clipboard.writeText(res.api_key);
        copied = true;
      } catch {
        copied = false;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Setup failed";
    } finally {
      submitting = false;
    }
  }

  function enterDashboard() {
    void goto("/", { replaceState: true });
  }

  async function copyAgain() {
    if (!createdKey) return;
    try {
      await navigator.clipboard.writeText(createdKey);
      copied = true;
    } catch {
      copied = false;
    }
  }
</script>

<div class="auth-page">
  <div class="auth-card">
    <div class="brand">
      <span class="brand-name">apimyresume</span>
    </div>

    {#if createdKey}
      <h1>Welcome to apimyresume</h1>
      <p class="hint">
        Your account <strong>{username}</strong> is ready. An API key has been created
        for programmatic access (n8n, Zapier, curl). Copy it now — it will not be
        shown again.
      </p>

      <div class="key-box">
        <code>{createdKey}</code>
        <button class="btn ghost" type="button" onclick={copyAgain}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <button class="btn primary block" type="button" onclick={enterDashboard}>
        Enter the dashboard
      </button>
    {:else}
      <h1>Set up apimyresume</h1>
      <p class="hint">
        Create the owner account. This is a one-time step — the first person to
        reach this page becomes the instance admin.
      </p>

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
          pattern="[a-zA-Z0-9_.\-]+"
          bind:value={username}
          disabled={submitting}
        />

        <label class="form-label" for="password">Password</label>
        <input
          id="password"
          class="form-input"
          type="password"
          autocomplete="new-password"
          required
          minlength="8"
          maxlength="200"
          bind:value={password}
          disabled={submitting}
        />

        <label class="form-label" for="confirm">Confirm password</label>
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

        {#if error}
          <p class="form-hint warn">{error}</p>
        {/if}

        <button class="btn primary block" type="submit" disabled={submitting}>
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>
    {/if}
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
    max-width: 440px;
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
    line-height: 1.5;
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
  .key-box {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 8px 10px;
    margin-bottom: 16px;
  }
  .key-box code {
    flex: 1;
    font-family: var(--mono);
    font-size: 12px;
    color: var(--text);
    overflow-x: auto;
    white-space: nowrap;
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
  .btn.ghost {
    background: transparent;
    color: var(--text-soft);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 6px 10px;
    font-size: 12px;
    cursor: pointer;
  }
  .btn.ghost:hover {
    color: var(--text);
    border-color: var(--border-strong);
  }
  .btn.block {
    width: 100%;
    margin-top: 10px;
  }
</style>
