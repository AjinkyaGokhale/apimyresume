import { Hono } from "hono";
import { readBody } from "../body.ts";
import { resumeDto } from "../dto.ts";
import { resumeRepo } from "../../db/repo.ts";
import { notFound } from "../../lib/errors.ts";
import { previewFromData } from "../../services/preview.ts";
import {
  createResume,
  deleteResume,
  expandResume,
  regenerateResume,
  resumeThumbnail,
  updateResume,
} from "../../services/resume.ts";

/** Child resume routes (spec §6). */
export const resumes = new Hono();

function withWarnings(dto: object, warnings: string[]) {
  return warnings.length ? { ...dto, warnings } : dto;
}

resumes.post("/", async (c) => {
  const { resume, warnings } = await createResume(await readBody(c));
  return c.json(withWarnings(resumeDto(resume), warnings), 201);
});

resumes.get("/", (c) => {
  const q = c.req.query();
  const { rows, total, page, limit, hasNext } = resumeRepo.list({
    company: q.company,
    tag: q.tag,
    baseId: q.base_id,
    page: q.page ? Number(q.page) : undefined,
    limit: q.limit ? Number(q.limit) : undefined,
  });
  return c.json({
    data: rows.map(resumeDto),
    pagination: { total, page, limit, has_next: hasNext },
  });
});

resumes.get("/:id", (c) => {
  const id = c.req.param("id");
  if (c.req.query("expand") === "true") return c.json(expandResume(id));
  const row = resumeRepo.get(id);
  if (!row) throw notFound(`Resume '${id}' not found`, "resume_not_found");
  return c.json(resumeDto(row));
});

resumes.patch("/:id", async (c) => {
  const { resume, warnings } = await updateResume(c.req.param("id"), await readBody(c));
  return c.json(withWarnings(resumeDto(resume), warnings));
});

resumes.delete("/:id", async (c) => {
  await deleteResume(c.req.param("id"));
  return c.body(null, 204);
});

// Authenticated (owner session via dashboard <img>, or API key) — the rendered
// resume itself, used as the card thumbnail. Personal data, so not public.
resumes.get("/:id/thumbnail.svg", async (c) => {
  const svg = await resumeThumbnail(c.req.param("id"));
  c.header("Content-Type", "image/svg+xml");
  c.header("Cache-Control", "public, max-age=300");
  return c.body(svg);
});

resumes.get("/:id/pdf", (c) => {
  const row = resumeRepo.get(c.req.param("id"));
  if (!row?.pdfUrl) throw notFound(`PDF for resume '${c.req.param("id")}' not found`, "pdf_not_found");
  return c.redirect(row.pdfUrl, 302);
});

resumes.post("/:id/regenerate", async (c) => {
  const { resume, warnings } = await regenerateResume(c.req.param("id"));
  return c.json(withWarnings(resumeDto(resume), warnings));
});

/** Preview endpoint — renders data to PDF without saving (for live preview). */
resumes.post("/preview", async (c) => {
  const { pdf, warnings } = await previewFromData(await readBody(c));
  c.header("Content-Type", "application/pdf");
  c.header("Cache-Control", "no-store");
  // Return PDF with warnings in header for debugging
  if (warnings.length) {
    c.header("X-Render-Warnings", warnings.join("; "));
  }
  return c.body(pdf.buffer as ArrayBuffer);
});
