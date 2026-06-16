import { z } from "zod";

/** Template config.json (spec §4, Appendix B). */
export const templateConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(""),
  engine: z.literal("typst").default("typst"),
  paperSize: z.string().default("us-letter"),
  fonts: z.array(z.string()).default([]),
  typstPackages: z.array(z.string()).default([]),
});
export type TemplateConfig = z.infer<typeof templateConfigSchema>;

/** A single section declaration in map.json (spec §5, Appendix B). */
export const mapSectionSchema = z.object({
  id: z.string(),
  source: z.string(),
  label: z.string().default(""),
  show_if: z.string().nullish(),
  max_items: z.number().nullish(),
  featured_first: z.boolean().default(false),
  required: z.boolean().default(false),
});
export type MapSection = z.infer<typeof mapSectionSchema>;

/** Template map.json. */
export const templateMapSchema = z.object({
  template: z.string(),
  sections: z.array(mapSectionSchema).default([]),
  layout: z
    .object({
      type: z.enum(["single_column", "two_column", "sidebar_left"]).default("single_column"),
      order: z.array(z.string()).default([]),
    })
    .default({ type: "single_column", order: [] }),
});
export type TemplateMap = z.infer<typeof templateMapSchema>;

/** A fully-loaded, renderable template held in the registry. */
export interface RegisteredTemplate {
  id: string;
  dir: string;
  config: TemplateConfig;
  map: TemplateMap;
  /** resume.typ content, read once at load time and reused via addSource. */
  source: string;
  /** Optional cover-letter.typ content — present only for templates that ship a
   * cover-letter variant. Drives the cover letter endpoints. */
  coverLetterSource?: string;
  /** Whether this template ships a renderable cover-letter variant. */
  hasCoverLetter: boolean;
  hasThumbnail: boolean;
  /** Vendored typst packages imported by resume.typ that are missing from cache. */
  missingPackages: string[];
  /** If a required vendored package is missing, the template may not render. */
  renderable: boolean;
}

/** Public-facing template summary (GET /api/v1/templates). */
export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  thumbnail_url: string;
  paper_size: string;
  engine: string;
  /** Whether this template can also render a cover letter. */
  has_cover_letter: boolean;
}
