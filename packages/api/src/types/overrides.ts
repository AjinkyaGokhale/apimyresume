import { z } from "zod";
import {
  awardSchema,
  certificationSchema,
  customSectionSchema,
  educationSchema,
  experienceSchema,
  extracurricularSchema,
  languageSchema,
  projectSchema,
  skillSchema,
} from "./kb.ts";

/**
 * Canonical override (diff) shape stored per child resume (spec §6, §7).
 * The normalizer (spec §16, Appendix D) maps loose AI field names into this
 * structure before merge. Stored as a diff — never the merged result.
 */

export const injectBulletsSchema = z.object({
  /** e.g. "experience.nineti" — targets an experience entry by its stable id. */
  target: z.string(),
  mode: z.enum(["append", "prepend", "replace"]).default("append"),
  bullets: z.array(z.string()).default([]),
});

export type InjectBullets = z.infer<typeof injectBulletsSchema>;

// NOTE: this schema deliberately does NOT `.passthrough()` — unknown keys are
// stripped so an API-key client (AI agent) can only tailor the known content
// sections + directives below and can never inject a structural key that
// mergeResume would blindly merge onto the base. `profile` and `template` are
// likewise non-tailorable (profile is inherited verbatim in mergeResume;
// template is forced to the base's in resolveTemplate).
export const overridesSchema = z.object({
  experience: z.array(experienceSchema).optional(),
  education: z.array(educationSchema).optional(),
  skills: z.array(skillSchema).optional(),
  projects: z.array(projectSchema).optional(),
  certifications: z.array(certificationSchema).optional(),
  extracurriculars: z.array(extracurricularSchema).optional(),
  languages: z.array(languageSchema).optional(),
  awards: z.array(awardSchema).optional(),
  custom: z.array(customSectionSchema).optional(),

  // Tailoring directives.
  keywords: z.array(z.string()).optional(),
  // NOTE: section order is intentionally NOT overridable per child. The render
  // sequence is owned by the base resume's `section_order` and every child
  // inherits it unchanged, so a person's resumes stay visually consistent. Any
  // `section_order` sent on a child override is stripped here and ignored.
  inject_bullets: z.array(injectBulletsSchema).optional(),
  skills_highlight: z.array(z.string()).optional(),
});

export type Overrides = z.infer<typeof overridesSchema>;

/** Metadata block on a create-resume payload. */
export const metaSchema = z
  .object({
    company: z.string().optional(),
    role: z.string().optional(),
  })
  .passthrough();

/**
 * Canonical create-resume request body (spec §6). Loose AI payloads are run
 * through the normalizer first, which produces exactly this shape.
 */
export const createResumeSchema = z.object({
  base_id: z.string(),
  template: z.string().optional(),
  tags: z.array(z.string()).default([]),
  meta: metaSchema.default({}),
  overrides: overridesSchema.default({}),
});

export type CreateResume = z.infer<typeof createResumeSchema>;

/** PATCH payload for a resume — any subset of the create fields except base_id. */
export const updateResumeSchema = createResumeSchema.partial().omit({ base_id: true });
export type UpdateResume = z.infer<typeof updateResumeSchema>;
