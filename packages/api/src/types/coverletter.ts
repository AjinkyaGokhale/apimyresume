import { z } from "zod";

/**
 * Cover letter schema — a cover letter is a sub-resource of a child resume
 * (stored in resumes.cover_letter). The author identity (name, contacts,
 * location) is NOT stored here: it is derived from the resume's merged profile
 * at render time, so the resume and its cover letter always share one identity.
 * The caller (AI agent / dashboard) supplies only the recipient and the letter
 * content. Body text is rendered as literal text — never evaluated as markup.
 */

/** The letter recipient. Only `name` is required; the rest fill the address block. */
export const addresseeSchema = z.object({
  name: z.string(),
  institution: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  zip: z.string().optional(),
});
export type Addressee = z.infer<typeof addresseeSchema>;

/** The letter content, in reading order. Rendered between an auto salutation and sign-off. */
export const coverLetterBodySchema = z.object({
  intro: z.string().default(""),
  paragraphs: z.array(z.string()).default([]),
  closing: z.string().default(""),
  signoff: z.string().default("Sincerely"),
});
export type CoverLetterBody = z.infer<typeof coverLetterBodySchema>;

/** Full cover letter payload stored per child resume. */
export const coverLetterSchema = z.object({
  addressee: addresseeSchema,
  body: coverLetterBodySchema,
  /** Optional pre-formatted date string (e.g. "June 16, 2026"). Defaults to today. */
  date: z.string().optional(),
});
export type CoverLetter = z.infer<typeof coverLetterSchema>;
