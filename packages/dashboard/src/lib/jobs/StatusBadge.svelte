<script lang="ts">
  let { status }: { status: string } = $props();
</script>

<span class="status-badge s-{status}">{status}</span>

<style>
  .status-badge {
    display: inline-block;
    padding: 2px 9px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    text-transform: capitalize;
    white-space: nowrap;
    background: var(--surface-2);
    color: var(--text-soft);
    border: 1px solid var(--border);
  }
  .s-applied,
  .s-screening,
  .s-interviewing {
    background: rgba(57, 135, 229, 0.14);
    border-color: rgba(57, 135, 229, 0.4);
    color: #86b6ef;
  }
  .s-offer,
  .s-accepted {
    background: var(--badge-green-bg);
    border-color: transparent;
    color: var(--badge-green-text);
  }
  .s-rejected {
    background: var(--badge-red-bg);
    border-color: transparent;
    color: var(--badge-red-text);
  }
  .s-withdrawn,
  .s-ghosted {
    color: var(--muted);
  }
</style>
