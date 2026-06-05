<script lang="ts">
  import Icon from "$lib/Icon.svelte";
  import type { Stat } from "$lib/types";

  let { stats }: { stats: Stat[] } = $props();
</script>

<div class="stats">
  {#each stats as s (s.label)}
    <div class="stat">
      <div class="stat-label">{s.label}</div>
      <div class="stat-row">
        <span class="stat-value">{s.value}</span>
        {#if s.delta && s.plain}
          <span class="stat-delta plain" class:up={s.dir === "up"} class:down={s.dir === "down"}>
            {s.dir === "down" ? "v" : "^"}{s.delta}
          </span>
        {:else if s.delta}
          <span class="stat-delta" class:up={s.dir === "up"} class:down={s.dir === "down"}>
            {#if s.dir === "up"}<Icon name="arrow-up" size={12} stroke={2.4} />
            {:else if s.dir === "down"}<Icon name="arrow-down" size={12} stroke={2.4} />{/if}
            {s.delta}
          </span>
        {/if}
      </div>
    </div>
  {/each}
</div>
