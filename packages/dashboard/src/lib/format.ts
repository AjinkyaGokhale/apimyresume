/** Short locale date, e.g. "Oct 24, 2026". Empty string for null. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  // Bare YYYY-MM-DD is parsed as UTC midnight; pin it so it never shifts a day.
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

/** 0.314 → "31%". */
export const pct = (r: number) => `${Math.round(r * 100)}%`;

/** Today minus `days`, as YYYY-MM-DD in local time. */
export function daysAgo(days: number, from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() - days);
  return localDate(d);
}

export function localDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
