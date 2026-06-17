import type { KB } from "../types/kb.ts";
import type { MapSection, TemplateMap } from "../templates/types.ts";

/**
 * Field mapper (spec §5). Translates a merged KB document into a
 * template-specific, fully JSON-serialisable context object keyed by the
 * section ids declared in map.json. Templates only ever read `ctx.<sectionId>`
 * paths — they never touch raw KB paths, keeping them decoupled from the KB
 * schema. The result is serialised with JSON.stringify and injected via
 * sys.inputs.resume (Appendix E).
 */

/** A merged base+overrides document, plus directive-derived extras. */
export type MergedDoc = KB & {
  keywords?: string[];
  skills_highlight?: string[];
  section_order?: string[];
};

export interface MappedSection {
  label: string;
  data: unknown;
}

export interface TemplateContext {
  [sectionId: string]: unknown;
  /** Layout hints readable inside Typst as ctx.__layout (spec §5). */
  __layout: { type: string; order: string[] };
  /** Tailoring keywords, kept as a separate top-level array (spec §7). */
  keywords?: string[];
}

/** Resolve a dot path like "profile.summary" against the merged document. */
function resolvePath(obj: unknown, dotted: string): unknown {
  return dotted.split(".").reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

/**
 * Evaluate a map.json `show_if` guard against the merged document. Supports the
 * small expression vocabulary used in the spec:
 *   - "<path>.length > N" / ">= N" / "< N" / "== N"
 *   - "<path>"            → truthiness (non-empty array / non-empty string)
 */
function evalShowIf(expr: string, doc: MergedDoc): boolean {
  const trimmed = expr.trim();
  const cmp = trimmed.match(/^(.+?)\.length\s*(>=|<=|>|<|==)\s*(\d+)$/);
  if (cmp) {
    const [, path, op, nStr] = cmp;
    const value = resolvePath(doc, path!.trim());
    const len = Array.isArray(value) ? value.length : typeof value === "string" ? value.length : 0;
    const n = Number(nStr);
    switch (op) {
      case ">":
        return len > n;
      case ">=":
        return len >= n;
      case "<":
        return len < n;
      case "<=":
        return len <= n;
      case "==":
        return len === n;
    }
  }
  const value = resolvePath(doc, trimmed);
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.length > 0;
  return Boolean(value);
}

/** Apply featured_first + max_items transforms to a resolved array. */
function transformArray(arr: unknown[], section: MapSection): unknown[] {
  let out = arr;
  if (section.featured_first) {
    // Stable partition: featured:true entries first, original order preserved.
    out = [...out].sort((a, b) => Number(isFeatured(b)) - Number(isFeatured(a)));
  }
  if (section.max_items != null && section.max_items >= 0) {
    out = out.slice(0, section.max_items);
  }
  return out;
}

function isFeatured(item: unknown): boolean {
  return typeof item === "object" && item !== null && (item as { featured?: boolean }).featured === true;
}

export function mapContext(doc: MergedDoc, map: TemplateMap): TemplateContext {
  const ctx: TemplateContext = {
    __layout: { type: map.layout.type, order: map.layout.order },
  };

  for (const section of map.sections) {
    // Guarded sections are omitted entirely when their condition is false,
    // so the Typst template renders no empty heading (spec §5, §8).
    if (section.show_if && !evalShowIf(section.show_if, doc)) continue;

    let data = resolvePath(doc, section.source);
    if (data === undefined) {
      // Required sections still appear (with empty data) so the template can
      // surface a clear gap; optional sources are simply skipped.
      if (!section.required) continue;
      data = Array.isArray(data) ? [] : null;
    }
    if (Array.isArray(data)) data = transformArray(data, section);

    ctx[section.id] = { label: section.label, data } satisfies MappedSection;
  }

  // Keywords are a directive, not KB content — surface them as their own array.
  if (Array.isArray(doc.keywords) && doc.keywords.length > 0) {
    ctx.keywords = doc.keywords;
  }

  return ctx;
}

/** Serialise the context for sys.inputs.resume (string-only constraint). */
export function serializeContext(ctx: TemplateContext): string {
  return JSON.stringify(ctx);
}
