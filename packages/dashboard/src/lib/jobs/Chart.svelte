<script lang="ts">
  import {
    BarController,
    BarElement,
    CategoryScale,
    Chart,
    Legend,
    LinearScale,
    LineController,
    LineElement,
    PointElement,
    Tooltip,
    type ChartDataset,
  } from "chart.js";

  Chart.register(BarController, BarElement, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend);

  // Categorical slots validated against the dark card surface (#1e1e1e):
  // blue, orange — fixed order, never cycled.
  const SERIES = ["#3987e5", "#d95926"];

  let {
    type,
    labels,
    series,
    horizontal = false,
    height = 240,
    label,
  }: {
    type: "bar" | "line";
    labels: string[];
    series: Array<{ label: string; data: number[] }>;
    horizontal?: boolean;
    height?: number;
    /** Accessible description of the chart. */
    label: string;
  } = $props();

  let canvas: HTMLCanvasElement;

  $effect(() => {
    const css = getComputedStyle(document.documentElement);
    const muted = css.getPropertyValue("--muted").trim() || "#9ca3af";
    const grid = css.getPropertyValue("--divider").trim() || "#1f2937";
    const surface = css.getPropertyValue("--surface").trim() || "#1e1e1e";
    const font = { family: css.getPropertyValue("--font").trim() || undefined, size: 12 };

    const datasets = $state.snapshot(series).map((s, i): ChartDataset<"bar" | "line"> => {
      const color = SERIES[i] ?? SERIES[0]!;
      return type === "bar"
        ? {
            ...s,
            backgroundColor: color,
            borderRadius: 4,
            borderSkipped: "start",
            maxBarThickness: 18,
          }
        : {
            ...s,
            borderColor: color,
            backgroundColor: color,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 5,
            pointHoverBorderColor: surface,
            pointHoverBorderWidth: 2,
            cubicInterpolationMode: "monotone",
          };
    });

    const valueAxis = { beginAtZero: true, ticks: { color: muted, font, precision: 0 }, grid: { color: grid }, border: { display: false } };
    const catAxis = { ticks: { color: muted, font, autoSkip: true, maxRotation: 0 }, grid: { display: false }, border: { color: grid } };

    const chart = new Chart(canvas, {
      type,
      data: { labels: [...labels], datasets: datasets as ChartDataset<typeof type>[] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        indexAxis: horizontal ? "y" : "x",
        interaction: type === "line" ? { mode: "index", intersect: false } : { mode: "nearest", intersect: false, axis: horizontal ? "y" : "x" },
        scales: horizontal ? { x: valueAxis, y: catAxis } : { x: catAxis, y: valueAxis },
        plugins: {
          // A single series is named by the card title; 2+ get a legend.
          legend: {
            display: series.length > 1,
            position: "top",
            align: "end",
            labels: { color: muted, font, boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 2 },
          },
          tooltip: { backgroundColor: "#0f0f0f", borderColor: grid, borderWidth: 1, titleFont: font, bodyFont: font, padding: 10 },
        },
      },
    });
    return () => chart.destroy();
  });
</script>

<div class="chart" style:height="{height}px" role="img" aria-label={label}>
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .chart {
    position: relative;
    width: 100%;
  }
</style>
