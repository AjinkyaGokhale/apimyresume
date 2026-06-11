<script lang="ts">
  import { goto } from "$app/navigation";
  import { authState, authSetup } from "$lib/auth";
  import {
    Zap,
    Clock,
    Timer,
    Hourglass,
    Calendar,
    User,
    Heart,
    Shield,
    ShieldCheck,
    ShieldAlert,
    Lock,
    Unlock,
    Skull,
    Flame,
    Sun,
    Globe,
    Diamond,
    AlertCircle
  } from "@lucide/svelte";

  let username = $state("");
  let password = $state("");
  let confirm = $state("");
  let submitting = $state(false);
  let error = $state<string | null>(null);

  // Password strength calculator based on Moore's Law formula
  // Crack time formula: t = 2 * log2(95^n / (k * 2^(t0/2)))
  // Where t0 = years since 2013, n = password entropy, k = attacks/year constant
  type IconComponent = typeof Zap;

  function getPasswordStrength(pwd: string): { text: string; color: string; icon: IconComponent; crackTimeYears: number } {
    if (!pwd || pwd.length < 8) {
      return { text: "A sleepy toddler could guess this", color: "var(--danger)", icon: Unlock, crackTimeYears: 0 };
    }

    // Calculate effective alphabet size based on character types used
    let alphabetSize = 0;
    if (/[a-z]/.test(pwd)) alphabetSize += 26;
    if (/[A-Z]/.test(pwd)) alphabetSize += 26;
    if (/[0-9]/.test(pwd)) alphabetSize += 10;
    if (/[^A-Za-z0-9]/.test(pwd)) alphabetSize += 33; // Standard keyboard symbols

    if (alphabetSize === 0) alphabetSize = 95; // Fallback

    // Calculate entropy: n = password length * log2(alphabet size)
    const entropyBits = pwd.length * Math.log2(alphabetSize);

    // t0 = years since January 2013
    const t0 = (new Date().getFullYear() - 2013) + (new Date().getMonth() / 12);

    // k = 10^12 attacks/second converted to attacks/year
    // 10^12 * 60 * 60 * 24 * 365.25 ≈ 3.156 × 10^19 attacks/year
    const k = 1e12 * 60 * 60 * 24 * 365.25;

    // Moore's Law formula: t = 2 * log2(alphabetSize^length / (k * 2^(t0/2)))
    // Using: alphabetSize^length = 2^(length * log2(alphabetSize)) = 2^entropyBits
    const attacksPossible = Math.pow(2, entropyBits);
    const mooreFactor = k * Math.pow(2, t0 / 2);
    const crackTimeYears = 2 * Math.log2(attacksPossible / mooreFactor);

    // Format the crack time into human-readable message
    const result = formatCrackTime(Math.max(0, crackTimeYears));
    return { ...result, crackTimeYears };
  }

  function formatCrackTime(years: number): { text: string; color: string; icon: IconComponent } {
    if (years < 1/365/24/60) { // Less than a minute
      return { text: "Instant crack time. A potato could guess this", color: "var(--danger)", icon: Zap };
    }
    if (years < 1/365/24) { // Less than an hour
      const mins = Math.round(years * 365 * 24 * 60);
      return { text: `${mins} minute${mins === 1 ? '' : 's'} to crack. Blink and it's gone`, color: "var(--danger)", icon: Clock };
    }
    if (years < 1/365) { // Less than a day
      const hours = Math.round(years * 365 * 24);
      return { text: `${hours} hour${hours === 1 ? '' : 's'} to crack. A good nap's work`, color: "var(--danger)", icon: Timer };
    }
    if (years < 1/52) { // Less than a week
      const days = Math.round(years * 365);
      return { text: `${days} day${days === 1 ? '' : 's'} to crack. A long weekend for hackers`, color: "#ff6b35", icon: Hourglass };
    }
    if (years < 1) { // Less than a year
      const weeks = Math.round(years * 52);
      return { text: `${weeks} week${weeks === 1 ? '' : 's'} to crack. Seasonal hacking project`, color: "#ffa500", icon: Calendar };
    }
    if (years < 10) {
      return { text: `${Math.round(years)} years to crack. A toddler becomes a child`, color: "#c7d930", icon: User };
    }
    if (years < 100) {
      return { text: `${Math.round(years)} years to crack. Outlives a pet tortoise`, color: "#c7d930", icon: Heart };
    }
    if (years < 1000) {
      return { text: `${Math.round(years)} years to crack. Medieval times to now`, color: "#90d930", icon: Shield };
    }
    if (years < 10000) {
      return { text: `${Math.round(years).toLocaleString()} years to crack. Neanderthal era proof`, color: "var(--success)", icon: Skull };
    }
    if (years < 1000000) {
      return { text: `${Math.round(years/1000)}K years to crack. Older than humanity`, color: "var(--success)", icon: Flame };
    }
    if (years < 1e9) {
      return { text: `${Math.round(years/1e6)}M years to crack. Outlives the Sun`, color: "var(--success)", icon: Sun };
    }
    if (years < 1e13) { // ~age of universe
      return { text: `${Math.round(years/1e9)}B years to crack. Age-of-the-universe proof`, color: "var(--success)", icon: Globe };
    }
    return { text: "Heat death of the universe resistant", color: "var(--success)", icon: Diamond };
  }

  let strength = $derived(getPasswordStrength(password));

  // Passwords match indicator
  let passwordsMatch = $derived(confirm ? password === confirm : null);

  // Password minimum length indicator
  let passwordMinMet = $derived(password ? password.length >= 8 : null);

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
      await authSetup(username.trim(), password);
      await goto("/", { replaceState: true });
    } catch (e) {
      error = e instanceof Error ? e.message : "Setup failed";
      submitting = false;
    }
  }
</script>

<div class="auth-page">
  <div class="auth-card">
    <div class="brand">
      <img class="brand-logo" src="/logo/logo-apimyresume.png" alt="apimyresume" />
    </div>

    <h1>Setup Admin Account</h1>
    <p class="hint">
      Create the owner account. This is a one-time step — the first person to
      reach this page becomes the instance admin. You can create API keys for
      programmatic access from the dashboard afterwards.
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
        {#if password}
          <p class="strength-hint" style="color: {strength.color}">
            <span class="strength-icon">
              <strength.icon size={16} />
            </span>
            {strength.text}
          </p>
        {/if}
        {#if passwordMinMet !== null}
          <p class="match-hint" class:match={passwordMinMet} class:mismatch={!passwordMinMet}>
            <span class="match-icon">
              {#if passwordMinMet}
                <ShieldCheck size={16} />
              {:else}
                <ShieldAlert size={16} />
              {/if}
            </span>
            {passwordMinMet ? "Minimum 8 characters met" : "Minimum 8 characters required"}
          </p>
        {/if}

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
        {#if passwordsMatch !== null}
          <p class="match-hint" class:match={passwordsMatch} class:mismatch={!passwordsMatch}>
            <span class="match-icon">
              {#if passwordsMatch}
                <ShieldCheck size={16} />
              {:else}
                <ShieldAlert size={16} />
              {/if}
            </span>
            {passwordsMatch ? "Passwords match" : "Passwords do not match"}
          </p>
        {/if}

        {#if error}
          <p class="form-hint warn">{error}</p>
        {/if}

        <button class="btn primary block" type="submit" disabled={submitting}>
          {submitting ? "Creating account…" : "Create account"}
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
  .brand-logo {
    height: 24px;
    width: auto;
    display: block;
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
  .strength-hint {
    font-size: 12px;
    margin: 4px 0 0 0;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 6px;
    animation: fadeIn 0.2s ease-out;
  }
  .strength-icon {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .match-hint {
    font-size: 12px;
    margin: 4px 0 0 0;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 6px;
    animation: fadeIn 0.2s ease-out;
  }
  .match-hint.match {
    color: var(--success);
  }
  .match-hint.mismatch {
    color: var(--danger);
  }
  .match-icon {
    display: flex;
    align-items: center;
    justify-content: center;
  }
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-2px); }
    to { opacity: 1; transform: translateY(0); }
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
