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

export const experienceSchema = z.object({
  id: z.string(), // stable key, e.g. "nineti" — used for inject_bullets targeting
  company: z.string(),
  role: z.string(),
  location: z.string().optional(),
  period: z.string(),
  current: z.boolean().optional(),
  bullets: z.array(z.string()).default([]),
  tags: z.array(z.string()).optional(),
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
  experience: z.array(experienceSchema).default([]),
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
export type Skill = z.infer<typeof skillSchema>;

/** Input shape for creating a base — `id` required, rest validated against KB. */
export const createBaseSchema = kbSchema;

/** PATCH payload for a base: any subset of KB fields (id/template immutable here). */
export const updateBaseSchema = kbSchema
  .omit({ id: true })
  .partial();
