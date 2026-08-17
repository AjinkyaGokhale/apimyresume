import { z } from "zod";

/**
 * Canonical Knowledge Base (KB) schema — the single source of truth for all
 * resume content (spec §3, Appendix A).
 *
 * Optional fields may be absent; Typst templates handle missing values with the
 * `.at("field", default: "")` pattern. Dates are pre-formatted strings on the JS
 * side (Typst cannot parse date strings from sys.inputs — Appendix E).
 */

export const linksSchema = z
  .object({
    linkedin: z.string().optional(),
    github: z.string().optional(),
    portfolio: z.string().optional(),
  })
  // arbitrary extra links: { [key]: string }
  .catchall(z.string());

export const profileSchema = z.object({
  name: z.string(),
  title: z.string(),
  email: z.string(),
  phone: z.string().optional(),
  location: z.string().optional(),
  summary: z.string().optional(),
  links: linksSchema.optional().default({}),
});

/**
 * One role held at a company. An experience entry carrying several of these
 * renders as a single company block with the roles nested beneath it — the way
 * a promotion inside one job is normally shown. Each role keeps its own stable
 * `id` so bullet targeting stays as granular as it is for a flat entry.
 */
export const experienceRoleSchema = z.object({
  id: z.string(), // stable key, e.g. "acme-intern" — used for inject_bullets targeting
  role: z.string(),
  period: z.string(),
  current: z.boolean().optional(),
  bullets: z.array(z.string()).default([]),
});

/**
 * A stint at one company. Either flat (`role` + `period` on the entry itself)
 * or a progression (a non-empty `roles` list). When `roles` is present it wins:
 * the entry's own `role`, `period` and `bullets` are not rendered, because the
 * roles carry them.
 */
export const experienceSchema = z
  .object({
    id: z.string(), // stable key, e.g. "acme" — used for inject_bullets targeting
    company: z.string(),
    // Optional only so a progression entry need not repeat them; the refine
    // below still requires them on every entry without nested roles.
    role: z.string().optional(),
    location: z.string().optional(),
    period: z.string().optional(),
    current: z.boolean().optional(),
    bullets: z.array(z.string()).default([]),
    tags: z.array(z.string()).optional(),
    roles: z.array(experienceRoleSchema).optional(),
  })
  .refine((e) => (e.roles?.length ?? 0) > 0 || (Boolean(e.role) && Boolean(e.period)), {
    message: "experience entry needs either `role` and `period`, or a non-empty `roles` list",
  });

/**
 * The experience list, with the id rule bullet targeting depends on: every
 * entry id and every nested role id must be unique across the whole list, so
 * `experience.<id>` can never resolve to two different bullet owners.
 */
export const experienceListSchema = z
  .array(experienceSchema)
  .superRefine((entries, ctx) => {
    const seen = new Set<string>();
    entries.forEach((entry, i) => {
      const ids: [string, (string | number)[]][] = [[entry.id, [i, "id"]]];
      entry.roles?.forEach((role, j) => ids.push([role.id, [i, "roles", j, "id"]]));
      for (const [id, path] of ids) {
        if (seen.has(id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path,
            message: `duplicate experience id '${id}' — entry and role ids must be unique`,
          });
        }
        seen.add(id);
      }
    });
  });

export const educationSchema = z.object({
  institution: z.string(),
  degree: z.string(),
  field: z.string().optional(),
  period: z.string(),
  location: z.string().optional(),
  thesis: z.string().optional(),
  gpa: z.string().optional(),
  honors: z.string().optional(),
  // Optional detail lines under the entry (e.g. relevant coursework). Templates
  // render these as bullets; absent when the entry has none.
  bullets: z.array(z.string()).optional(),
});

export const skillSchema = z.object({
  category: z.string(),
  items: z.array(z.string()).default([]),
  featured: z.boolean().optional(),
});

export const projectSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  role: z.string().optional(),
  description: z.string().optional(),
  url: z.string().optional(),
  period: z.string().optional(),
  bullets: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

export const certificationSchema = z.object({
  name: z.string(),
  issuer: z.string().optional(),
  year: z.union([z.string(), z.number()]).optional(),
  url: z.string().optional(),
});

export const languageSchema = z.object({
  language: z.string(),
  level: z.string(),
});

export const awardSchema = z.object({
  name: z.string(),
  issuer: z.string().optional(),
  year: z.union([z.string(), z.number()]).optional(),
  description: z.string().optional(),
});

/**
 * A free-form section: any title with a list of bullets under it. `after` slots
 * it directly beneath a built-in section (e.g. "experience"); omit it (or use
 * "end") to render at the bottom, or "top" to render before everything.
 * Built-in placement keys: top | education | experience | projects |
 * extracurriculars | certifications | skills | end.
 */
export const customSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  // Optional entry detail lines shown under the heading, above the bullets:
  // `subtitle` (e.g. a role) and `link` (a complete URL, rendered clickable).
  subtitle: z.string().optional(),
  link: z.string().optional(),
  bullets: z.array(z.string()).default([]),
  after: z.string().optional(),
  // Multiple sub-entries rendered under the section `title`, each with its own
  // heading. When present, templates render these instead of the section-level
  // `subtitle`/`link`/`bullets`; when absent the section stays a single entry.
  entries: z
    .array(
      z.object({
        title: z.string(),
        subtitle: z.string().optional(),
        // Free-form date range shown alongside the entry, e.g. "Oct 2021 – Present".
        period: z.string().optional(),
        link: z.string().optional(),
        bullets: z.array(z.string()).default([]),
      }),
    )
    .optional(),
});

export const extracurricularSchema = z.object({
  activity: z.string(),
  period: z.string().optional(),
  bullets: z.array(z.string()).default([]),
});

/** Full KB document (a base resume). */
export const kbSchema = z.object({
  id: z.string(),
  name: z.string().optional(), // display label for the base resume
  template: z.string(),
  template_lock: z.boolean().default(false),
  profile: profileSchema,
  experience: experienceListSchema.default([]),
  education: z.array(educationSchema).default([]),
  skills: z.array(skillSchema).default([]),
  projects: z.array(projectSchema).optional(),
  certifications: z.array(certificationSchema).optional(),
  extracurriculars: z.array(extracurricularSchema).optional(),
  languages: z.array(languageSchema).optional(),
  awards: z.array(awardSchema).optional(),
  custom: z.array(customSectionSchema).optional(),

  // Order the content sections render in for this base. Values are section ids
  // (e.g. "experience", "education"); unknown ids are ignored at map time and
  // the header is always pinned first. Inherited by child resumes as their
  // default order (a child can still override it). The base editor derives this
  // from the order the section blocks appear in the YAML.
  section_order: z.array(z.string()).optional(),
});

export type KB = z.infer<typeof kbSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type Experience = z.infer<typeof experienceSchema>;
export type ExperienceRole = z.infer<typeof experienceRoleSchema>;
export type Skill = z.infer<typeof skillSchema>;

/**
 * Normalise an experience entry to the roles it holds: the nested `roles` when
 * it is a progression, otherwise the entry's own role as a single-element list.
 * Callers that only need to *read* roles (the agent-facing content view) go
 * through here so flat and grouped entries look identical to them.
 */
export function experienceRoles(entry: Experience): ExperienceRole[] {
  if (entry.roles?.length) return entry.roles;
  return [
    {
      id: entry.id,
      role: entry.role ?? "",
      period: entry.period ?? "",
      ...(entry.current === undefined ? {} : { current: entry.current }),
      bullets: entry.bullets,
    },
  ];
}

/**
 * Resolve a bullet target id to the object that actually owns those bullets —
 * a nested role on a progression entry, or the entry itself when flat. Returns
 * a live reference into `experience`, so callers may mutate `.bullets` in place.
 * A progression entry's own id owns no bullets and resolves to undefined; ids
 * are unique across entries and roles, so at most one owner ever matches.
 */
export function findBulletTarget(
  experience: Experience[],
  id: string,
): { bullets: string[] } | undefined {
  for (const entry of experience) {
    if (entry.roles?.length) {
      const role = entry.roles.find((r) => r.id === id);
      if (role) return role;
    } else if (entry.id === id) {
      return entry;
    }
  }
  return undefined;
}

/** Input shape for creating a base — `id` required, rest validated against KB. */
export const createBaseSchema = kbSchema;

/** PATCH payload for a base: any subset of KB fields (id/template immutable here). */
export const updateBaseSchema = kbSchema
  .omit({ id: true })
  .partial();
