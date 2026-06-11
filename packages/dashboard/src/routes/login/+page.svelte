<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import { fade } from "svelte/transition";
  import { authLogin, authState } from "$lib/auth";
  import Icon from "$lib/Icon.svelte";

  let username = $state("");
  let password = $state("");
  let submitting = $state(false);
  let redirecting = $state(false);
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
      // Hold a loading overlay through the dashboard's data load — the layout
      // and home `load` make several API calls before the page can render.
      redirecting = true;
      const next = $page.url.searchParams.get("next") || "/";
      await goto(next, { replaceState: true });
    } catch (e) {
      error = e instanceof Error ? e.message : "Login failed";
      submitting = false;
      redirecting = false;
    }
  }
</script>

{#if redirecting}
  <div class="auth-loading" transition:fade={{ duration: 150 }} role="status" aria-live="polite">
    <span class="spinner"><Icon name="refresh" size={28} /></span>
    <span class="msg">Signing you in…</span>
  </div>
{/if}

<div class="auth-page">
  <div class="brand">
    <img class="brand-logo" src="/logo/logo-apimyresume.png" alt="apimyresume" />
  </div>
  <div class="auth-card">
    <h1>Sign in</h1>

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
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 24px;
    background: var(--canvas);
    padding: 12vh 24px 24px;
    box-sizing: border-box;
  }
  /* Full-screen overlay shown after auth succeeds, while the dashboard's
     load functions fetch data — masks the gap so the swap feels intentional. */
  .auth-loading {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    background: var(--canvas);
    color: var(--muted);
  }
  .auth-loading .spinner {
    display: inline-flex;
    color: var(--accent);
    animation: auth-spin 0.8s linear infinite;
  }
  .auth-loading .msg {
    font-size: 13.5px;
    font-weight: 500;
    letter-spacing: 0.01em;
  }
  @keyframes auth-spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .auth-loading .spinner {
      animation: none;
    }
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
    margin-bottom: 0;
  }
  .brand-logo {
    height: 38px;
    width: auto;
    display: block;
  }
  h1 {
    font-size: 22px;
    font-weight: 600;
    margin: 0 0 6px 0;
    color: var(--text);
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
