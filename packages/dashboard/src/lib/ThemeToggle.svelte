<script lang="ts">
  import { onMount } from "svelte";
  import Icon from "$lib/Icon.svelte";

  let { variant = "full" }: { variant?: "full" | "icon" } = $props();
  let theme = $state<"light" | "dark">("light");

  onMount(() => {
    theme = (document.documentElement.dataset.theme as "light" | "dark") || "light";
  });

  function toggle() {
    theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("theme", theme);
    } catch {
      /* ignore */
    }
  }
</script>

{#if variant === "icon"}
  <button class="icon-btn" onclick={toggle} aria-label="Toggle theme">
    <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
  </button>
{:else}
  <button class="theme-toggle" onclick={toggle} aria-label="Toggle theme">
    <Icon name={theme === "dark" ? "sun" : "moon"} size={17} />
    <span>{theme === "dark" ? "Light" : "Dark"} mode</span>
  </button>
{/if}
