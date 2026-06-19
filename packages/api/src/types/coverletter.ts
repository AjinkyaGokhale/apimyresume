import { z } from "zod";

/**
 * Cover letter schemas. A cover letter is a *partial* document: the base resume
 * may define a default letter and each child resume stores an override diff.
 * Fields therefore carry NO defaults — an absent field means "inherit from the
 * base", and a default value here would clobber the base during merge. Final
 * defaults (e.g. signoff "Sincerely") live in the Typst template's
 * `.at(key, default:)` calls. Author identity is never stored here: it is
 * derived from the resume's merged profile at render time. Body text is
 * rendered as literal data — never evaluated as markup.
 */

/** The letter recipient. Every field is optional (a base default has no name). */
export const addresseePartialSchema = z.object({
  name: z.string().optional(),
  institution: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  zip: z.string().optional(),
});
export type Addressee = z.infer<typeof addresseePartialSchema>;

/** The letter content. All optional, NO defaults — defaults live in the template. */
export const coverLetterBodyPartialSchema = z.object({
  intro: z.string().optional(),
  paragraphs: z.array(z.string()).optional(),
  closing: z.string().optional(),
  signoff: z.string().optional(),
});
export type CoverLetterBody = z.infer<typeof coverLetterBodyPartialSchema>;

/**
 * Stored cover letter shape — used for both the base default and the child
 * override diff. Unknown keys are stripped (no `.passthrough()`) so an API-key
 * client can only set the known recipient/body fields.
 */
export const coverLetterInputSchema = z.object({
  addressee: addresseePartialSchema.optional(),
  body: coverLetterBodyPartialSchema.optional(),
  /** Optional pre-formatted date string (e.g. "June 16, 2026"). Defaults to today. */
  date: z.string().optional(),
});
export type CoverLetter = z.infer<typeof coverLetterInputSchema>;

/** Alias for backward compatibility during migration. */
export const coverLetterSchema = coverLetterInputSchema;
