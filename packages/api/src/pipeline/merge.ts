import type { KB } from "../types/kb.ts";
import type { InjectBullets, Overrides } from "../types/overrides.ts";
import type { MergedDoc } from "../mapper/index.ts";
import { log } from "../lib/log.ts";

/**
 * Override + merge pipeline (spec §7). Deep-merges a base KB with an override
 * diff to produce the full document the mapper consumes. The base is never
 * mutated — all work happens on a structured clone. Child resumes store only
 * the diff; the merged result is computed at render time.
 */

const DIRECTIVE_KEYS = new Set(["keywords", "inject_bullets", "skills_highlight"]);

/**
 * Keys always inherited from the base verbatim — never overridable per child.
 * `profile` (name, title, contact, links) is the person's fixed identity;
 * children tailor sections/bullets, not who they are.
 */
const INHERITED_KEYS = new Set(["profile"]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Recursive deep merge: objects merge key-by-key, scalars/arrays replace. */
function deepMerge<T>(base: T, override: unknown): T {
  if (override === undefined) return base;
  if (isPlainObject(base) && isPlainObject(override)) {
    const out: Record<string, unknown> = { ...base };
    for (const [k, v] of Object.entries(override)) {
      out[k] = deepMerge((base as Record<string, unknown>)[k], v);
    }
    return out as T;
  }
  // Scalars and arrays: the override value replaces the base value wholesale.
  return override as T;
}

/**
 * Apply an inject_bullets directive to the merged experience array. Targets are
 * resolved by stable id ("experience.<id>"), robust to array reordering (§7).
 */
function applyInjectBullets(merged: MergedDoc, directives: InjectBullets[]): void {
  for (const d of directives) {
    const [section, targetId] = d.target.split(".");
    if (section !== "experience" || !targetId) {
      log.warn("inject_bullets: unsupported target, skipping", { target: d.target });
      continue;
    }
    const entry = merged.experience.find((e) => e.id === targetId);
    if (!entry) {
      log.warn("inject_bullets: target not found, skipping", { target: d.target });
      continue;
    }
    const existing = entry.bullets ?? [];
    switch (d.mode) {
      case "prepend":
        entry.bullets = [...d.bullets, ...existing];
        break;
      case "replace":
        entry.bullets = [...d.bullets];
        break;
      case "append":
      default:
        entry.bullets = [...existing, ...d.bullets];
        break;
    }
  }
}

/**
 * Merge a base KB with an override diff into the final render document.
 * Returns a fresh object; `base` is left untouched.
 */
export function mergeResume(base: KB, overrides: Overrides): MergedDoc {
  // Structured clone keeps the base immutable across concurrent renders.
  const clone: KB = structuredClone(base);

  // Merge overridable section keys (experience, skills, …). Directive keys are
  // handled below; inherited keys (profile) are skipped so the base always wins.
  for (const [key, value] of Object.entries(overrides)) {
    if (DIRECTIVE_KEYS.has(key) || INHERITED_KEYS.has(key)) continue;
    (clone as Record<string, unknown>)[key] = deepMerge(
      (clone as Record<string, unknown>)[key],
      value,
    );
  }

  const merged = clone as MergedDoc;

  if (overrides.inject_bullets?.length) {
    applyInjectBullets(merged, overrides.inject_bullets);
  }

  // Directives surface as their own top-level fields for the mapper (§5, §7).
  if (overrides.keywords?.length) merged.keywords = overrides.keywords;
  if (overrides.skills_highlight?.length) merged.skills_highlight = overrides.skills_highlight;

  return merged;
}
