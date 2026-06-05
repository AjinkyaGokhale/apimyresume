/**
 * AI / n8n payload normalizer (spec §16, Appendix D). Maps loose, flat field
 * names produced by AI models into the canonical create-resume shape before
 * validation and merge. Unknown fields are silently dropped.
 *
 * Canonical output shape:
 *   { base_id, template?, tags[], meta{company,role}, overrides{...} }
 */

type Raw = Record<string, unknown>;

/** Coerce a value into a string array; comma-separated strings are split. */
function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function isObject(v: unknown): v is Raw {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Set a value only if the target slot is still empty (canonical wins). */
function setIfEmpty<T extends Raw>(obj: T, key: string, value: unknown) {
  if (value === undefined) return;
  if (obj[key] === undefined || obj[key] === null) (obj as Raw)[key] = value;
}

export function normalizePayload(raw: unknown): Raw {
  const input: Raw = isObject(raw) ? raw : {};

  // Start from any canonical structures already present; flat aliases fill gaps.
  const out: Raw = {
    base_id: input.base_id,
    ...(input.template !== undefined ? { template: input.template } : {}),
  };

  const meta: Raw = isObject(input.meta) ? { ...input.meta } : {};
  const overrides: Raw = isObject(input.overrides) ? { ...input.overrides } : {};

  // --- tags: tags | labels | categories ---
  const tags = input.tags ?? input.labels ?? input.categories;
  out.tags = toStringArray(tags ?? []);

  // --- meta.company: company | company_name | employer ---
  setIfEmpty(meta, "company", input.company ?? input.company_name ?? input.employer);
  // --- meta.role: position | job_title | role ---
  setIfEmpty(meta, "role", input.position ?? input.job_title ?? input.role);

  // NOTE: profile fields (title, summary, contact, links) are intentionally NOT
  // mapped here — profile is inherited from the base resume and is not overridable.

  // --- overrides.keywords: keywords | key_skills | skills | highlight_skills ---
  if (overrides.keywords === undefined) {
    const kw = input.keywords ?? input.key_skills ?? input.skills ?? input.highlight_skills;
    if (kw !== undefined) overrides.keywords = toStringArray(kw);
  } else {
    overrides.keywords = toStringArray(overrides.keywords);
  }

  // --- overrides.inject_bullets: inject_bullets | bullets | new_bullets | add_bullets ---
  if (overrides.inject_bullets === undefined) {
    const ib = input.inject_bullets ?? input.bullets ?? input.new_bullets ?? input.add_bullets;
    if (Array.isArray(ib)) overrides.inject_bullets = ib;
  }

  // --- overrides.skills_highlight: skills_highlight | featured_skills ---
  if (overrides.skills_highlight === undefined) {
    const sh = input.skills_highlight ?? input.featured_skills;
    if (sh !== undefined) overrides.skills_highlight = toStringArray(sh);
  }

  if (Object.keys(meta).length > 0) out.meta = meta;
  out.overrides = overrides;

  return out;
}
