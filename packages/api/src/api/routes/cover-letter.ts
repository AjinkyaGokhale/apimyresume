import { Hono } from "hono";
import { readBody } from "../body.ts";
import { coverLetterDto } from "../dto.ts";
import { notFound } from "../../lib/errors.ts";
import {
  deleteCoverLetter,
  getCoverLetter,
  previewCoverLetter,
  renderStoredCoverLetter,
  setCoverLetter,
} from "../../services/coverletter.ts";

/**
 * Cover letter routes — a sub-resource of a child resume. Mounted under
 * `/resumes/:id/cover-letter`, so `:id` is the parent resume id (propagated
 * from the parent router, hence read with a non-null assertion). Inherits the
 * same auth/rate-limit middleware as the rest of the v1 API.
 */
export const coverLetter = new Hono();

/** The stored cover letter (404 when none has been set). */
coverLetter.get("/", (c) => {
  const id = c.req.param("id")!;
  const cl = getCoverLetter(id);
  if (!cl) throw notFound(`Resume '${id}' has no cover letter`, "cover_letter_not_found");
  return c.json(coverLetterDto(cl));
});

/** Set or replace the cover letter (addressee + body). */
coverLetter.put("/", async (c) => {
  const cl = setCoverLetter(c.req.param("id")!, await readBody(c));
  return c.json(coverLetterDto(cl));
});

/** Remove the cover letter. */
coverLetter.delete("/", (c) => {
  deleteCoverLetter(c.req.param("id")!);
  return c.body(null, 204);
});

/** Render the stored cover letter to a PDF. */
coverLetter.get("/pdf", async (c) => {
  const { pdf, warnings } = await renderStoredCoverLetter(c.req.param("id")!);
  c.header("Content-Type", "application/pdf");
  c.header("Cache-Control", "no-store");
  if (warnings.length) c.header("X-Render-Warnings", warnings.join("; "));
  return c.body(pdf.buffer as ArrayBuffer);
});

/** Render supplied (unsaved) cover letter data to a PDF — live preview. */
coverLetter.post("/preview", async (c) => {
  const { pdf, warnings } = await previewCoverLetter(c.req.param("id")!, await readBody(c));
  c.header("Content-Type", "application/pdf");
  c.header("Cache-Control", "no-store");
  if (warnings.length) c.header("X-Render-Warnings", warnings.join("; "));
  return c.body(pdf.buffer as ArrayBuffer);
});
