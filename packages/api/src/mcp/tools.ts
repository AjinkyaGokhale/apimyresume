import { mkdirSync } from "node:fs";
import path from "node:path";
import { z, ZodError } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { config } from "../config.ts";
import { baseDto, jobDto, jobEventDto, resumeDto } from "../api/dto.ts";
import { jobRepo, resumeRepo } from "../db/repo.ts";
import type { ResumeRow } from "../db/schema.ts";
import { AppError, notFound } from "../lib/errors.ts";
import { log } from "../lib/log.ts";
import { createBase, getBase, listBases, updateBase } from "../services/base.ts";
import { renderStoredCoverLetter, setCoverLetter } from "../services/coverletter.ts";
import { createOrUpsertJob, getJob, jobStats, parseJobQuery, updateJob } from "../services/jobs.ts";
import { previewFromData } from "../services/preview.ts";
import { createResume, expandResume, updateResume } from "../services/resume.ts";
import { templateRegistry } from "../templates/registry.ts";
import type { CoverLetter } from "../types/coverletter.ts";
import { coverLetterInputSchema } from "../types/coverletter.ts";
import {
  JOB_DATE_FIELDS,
  JOB_SORT_FIELDS,
  JOB_STATUSES,
  WORK_MODES,
  jobCreateSchema,
  jobPatchSchema,
} from "../types/jobs.ts";
import { kbSchema } from "../types/kb.ts";
import { createResumeSchema, updateResumeSchema } from "../types/overrides.ts";

/**
 * MCP tool layer. Transport-agnostic: the stdio server (Claude Code plugin,
 * local owner) and a future remote endpoint (API keys) register the same tools.
 * Handlers call the services directly, so validation and business rules are
 * identical to the REST API. Errors come back as `isError` results carrying the
 * usual `{ error, code, errors? }` envelope, so the model can fix its input.
 */

export interface ToolOptions {
  /** Creating/replacing base resumes. True only for the local owner process. */
  canWriteBases: boolean;
}

const GUIDE = `# APIMyResume workflow

**Concepts**
- **Base resume**: the complete, truthful profile: experience, education, skills, projects and more. It fixes the template and section order. Every tailored resume derives from it.
- **Tailored (child) resume**: a base plus an \`overrides\` diff for one job. A section you send REPLACES that whole section, so read the base first and send the edited section back. Use \`inject_bullets\` to add a few bullets to one experience entry without resending the section, \`skills_highlight\` and \`keywords\` for emphasis. \`profile\` and \`template\` cannot be overridden.
- **Job**: a tracked application. \`track_job\` with an existing \`job_url\` updates that job instead of creating a duplicate. Every status change is kept in a history.

**Typical flows**
1. *First run*: \`list_bases\`. If empty, gather the user's real history (ask them, or read a resume file they point to), pick a template with \`list_templates\`, then \`preview_base\`, then \`create_base\`. Iterate with the user, then \`update_base\` with the full document.
2. *Apply to a job*: \`get_base\`, compare it with the posting, then \`create_resume\` with \`meta.company\`/\`meta.role\` and overrides that re-order, trim or re-word **existing** facts. Then \`set_cover_letter\` and \`render_cover_letter\` if wanted. Then \`track_job\` with \`resume_id\` and status \`applied\` once the user has applied (\`saved\` before that).
3. *Progress*: \`update_job\` with a new status and a short \`status_note\` (screening, interviewing, offer, rejected, ghosted, withdrawn). \`job_stats\` gives funnel, response rates and timelines.

**Rules**
- Never invent employers, dates, degrees, metrics or skills. Tailoring re-frames true facts; it doesn't add new ones.
- Experience entries need a stable \`id\` (e.g. \`acme-2023\`). Keep ids unchanged when editing.
- PDFs are written to local files. Give the user the returned \`pdf_path\`.
- Statuses: ${JOB_STATUSES.join(", ")}. Work modes: ${WORK_MODES.join(", ")}.`;

// --- Result helpers -----------------------------------------------------------

function ok(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function fail(envelope: Record<string, unknown>): CallToolResult {
  return { isError: true, content: [{ type: "text", text: JSON.stringify(envelope, null, 2) }] };
}

/** Run a handler and map thrown errors to the API's error envelope. */
async function run(fn: () => unknown): Promise<CallToolResult> {
  try {
    return ok(await fn());
  } catch (err) {
    if (err instanceof AppError) return fail(err.toEnvelope());
    if (err instanceof ZodError) {
      return fail({
        error: "Validation failed",
        code: "validation_error",
        errors: err.issues.map((i) => ({ field: i.path.join(".") || "(root)", message: i.message })),
      });
    }
    log.error("MCP tool failed", { error: String(err) });
    return fail({ error: "Internal error", code: "internal_error" });
  }
}

/** Write a rendered PDF under the data dir and return its absolute path. */
async function savePdf(folder: string, name: string, pdf: Uint8Array): Promise<string> {
  const dir = path.join(config.dataDir, folder);
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name.replace(/[^A-Za-z0-9_.-]/g, "_")}.pdf`);
  await Bun.write(file, pdf);
  return file;
}

function resumeView(row: ResumeRow, warnings: string[] = []) {
  return {
    ...resumeDto(row),
    pdf_path: row.pdfPath,
    ...(warnings.length ? { warnings } : {}),
  };
}

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

// --- Registration -------------------------------------------------------------

export function registerTools(server: McpServer, opts: ToolOptions): void {
  server.registerTool(
    "get_guide",
    {
      title: "How to use APIMyResume",
      description: "Workflow, concepts and rules. Call this first in a new session.",
      annotations: READ,
    },
    () => ({ content: [{ type: "text", text: GUIDE }] }),
  );

  server.registerTool(
    "list_templates",
    {
      title: "List resume templates",
      description: "Resume designs a base can use, and the cover-letter designs.",
      annotations: READ,
    },
    () =>
      run(() => ({
        resume_templates: templateRegistry.summaries().map(({ thumbnail_url: _, ...t }) => t),
        cover_letter_templates: templateRegistry.letterTemplateSummaries(),
      })),
  );

  // --- Base resumes ---

  server.registerTool(
    "list_bases",
    { title: "List base resumes", description: "All base resumes with their child counts.", annotations: READ },
    () => run(() => listBases()),
  );

  server.registerTool(
    "get_base",
    {
      title: "Get a base resume",
      description: "The full base resume document. Read it before tailoring or editing.",
      inputSchema: { base_id: z.string() },
      annotations: READ,
    },
    ({ base_id }) => run(() => baseDto(getBase(base_id))),
  );

  server.registerTool(
    "preview_base",
    {
      title: "Preview a base resume",
      description:
        "Render a base resume document to a PDF without saving it. Use it to check layout " +
        "before create_base / update_base. Returns the PDF file path.",
      inputSchema: { base: kbSchema },
      annotations: READ,
    },
    ({ base }) =>
      run(async () => {
        const { pdf, warnings } = await previewFromData(base);
        return { pdf_path: await savePdf("previews", `${base.id}-preview`, pdf), warnings };
      }),
  );

  if (opts.canWriteBases) {
    server.registerTool(
      "create_base",
      {
        title: "Create a base resume",
        description:
          "Create a base resume from the user's real history. `id` is a short slug " +
          "(e.g. `base-jane`). Experience entries need stable ids.",
        inputSchema: { base: kbSchema },
        annotations: WRITE,
      },
      ({ base }) => run(() => baseDto(createBase(base))),
    );

    server.registerTool(
      "update_base",
      {
        title: "Replace a base resume",
        description:
          "Replace a base resume with the full edited document (from get_base). Sections " +
          "left out are removed. Existing tailored resumes are not re-rendered.",
        inputSchema: { base_id: z.string(), base: kbSchema.omit({ id: true }) },
        annotations: { ...WRITE, idempotentHint: true },
      },
      ({ base_id, base }) => run(() => baseDto(updateBase(base_id, base))),
    );
  }

  // --- Tailored resumes ---

  server.registerTool(
    "list_resumes",
    {
      title: "List tailored resumes",
      description: "Tailored resumes, newest first. Filter by base, company or tag.",
      inputSchema: {
        base_id: z.string().optional(),
        company: z.string().optional(),
        tag: z.string().optional(),
        page: z.number().int().min(1).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
      annotations: READ,
    },
    ({ base_id, ...rest }) =>
      run(() => {
        const { rows, total, page, limit, hasNext } = resumeRepo.list({ ...rest, baseId: base_id });
        return { data: rows.map((r) => resumeView(r)), pagination: { total, page, limit, has_next: hasNext } };
      }),
  );

  server.registerTool(
    "get_resume",
    {
      title: "Get a tailored resume",
      description:
        "A tailored resume with its overrides, cover letter and PDF path. Set `expand` " +
        "for the fully merged document (base + overrides).",
      inputSchema: { resume_id: z.string(), expand: z.boolean().optional() },
      annotations: READ,
    },
    ({ resume_id, expand }) =>
      run(() => {
        const row = resumeRepo.get(resume_id);
        if (!row) throw notFound(`Resume '${resume_id}' not found`, "resume_not_found");
        return {
          ...resumeView(row),
          cover_letter: (row.coverLetter as CoverLetter | null) ?? null,
          ...(expand ? { merged: expandResume(resume_id) } : {}),
        };
      }),
  );

  server.registerTool(
    "create_resume",
    {
      title: "Create a tailored resume",
      description:
        "Derive a resume for one job from a base and render its PDF. Set meta.company and " +
        "meta.role. Overrides replace whole sections; only re-frame facts from the base.",
      inputSchema: createResumeSchema.shape,
      annotations: WRITE,
    },
    (args) =>
      run(async () => {
        const { resume, warnings } = await createResume(args);
        return resumeView(resume, warnings);
      }),
  );

  server.registerTool(
    "update_resume",
    {
      title: "Update a tailored resume",
      description: "Change a tailored resume's overrides, meta or tags and re-render its PDF.",
      inputSchema: { resume_id: z.string(), ...updateResumeSchema.shape },
      annotations: WRITE,
    },
    ({ resume_id, ...body }) =>
      run(async () => {
        const { resume, warnings } = await updateResume(resume_id, body);
        return resumeView(resume, warnings);
      }),
  );

  // --- Cover letters ---

  server.registerTool(
    "set_cover_letter",
    {
      title: "Set a cover letter",
      description:
        "Save (replace) the cover letter of a tailored resume: addressee, body paragraphs, " +
        "optional date, language and letter design. Sender details come from the base profile.",
      inputSchema: { resume_id: z.string(), cover_letter: coverLetterInputSchema },
      annotations: { ...WRITE, idempotentHint: true },
    },
    ({ resume_id, cover_letter }) => run(() => ({ cover_letter: setCoverLetter(resume_id, cover_letter) })),
  );

  server.registerTool(
    "render_cover_letter",
    {
      title: "Render a cover letter PDF",
      description: "Render the saved cover letter of a tailored resume. Returns the PDF file path.",
      inputSchema: { resume_id: z.string() },
      annotations: READ,
    },
    ({ resume_id }) =>
      run(async () => {
        const { pdf, warnings } = await renderStoredCoverLetter(resume_id);
        return { pdf_path: await savePdf("cover-letters", resume_id, pdf), warnings };
      }),
  );

  // --- Job tracker ---

  server.registerTool(
    "track_job",
    {
      title: "Track a job",
      description:
        "Add a job to the tracker. If `job_url` is already tracked, that job is updated " +
        "instead (no duplicates). Link the tailored resume with `resume_id`.",
      inputSchema: jobCreateSchema.innerType().shape,
      annotations: WRITE,
    },
    (args) =>
      run(() => {
        const { job, created } = createOrUpsertJob(args, "apikey");
        return { ...jobDto(job), created };
      }),
  );

  server.registerTool(
    "update_job",
    {
      title: "Update a tracked job",
      description:
        "Change any field of a tracked job. A status change is recorded in its history " +
        "with the optional `status_note`; moving to `applied` sets applied_at.",
      inputSchema: { job_id: z.string(), ...jobPatchSchema.innerType().shape },
      annotations: WRITE,
    },
    ({ job_id, ...patch }) => run(() => jobDto(updateJob(job_id, patch, "apikey"))),
  );

  server.registerTool(
    "get_job",
    {
      title: "Get a tracked job",
      description: "A tracked job with its full status history (newest first).",
      inputSchema: { job_id: z.string() },
      annotations: READ,
    },
    ({ job_id }) =>
      run(() => {
        const { job, events } = getJob(job_id);
        return { ...jobDto(job), events: events.map(jobEventDto) };
      }),
  );

  const jobFilter = {
    q: z.string().optional().describe("Search company, role, location and notes."),
    status: z.array(z.enum(JOB_STATUSES)).optional(),
    location: z.string().optional(),
    work_mode: z.enum(WORK_MODES).optional(),
    source: z.string().optional(),
    tag: z.string().optional(),
    from: z.string().optional().describe("YYYY-MM-DD, inclusive."),
    to: z.string().optional().describe("YYYY-MM-DD, inclusive."),
    date_field: z.enum(JOB_DATE_FIELDS).optional().describe("Date the range applies to. Default applied_at."),
  };

  /** Tool args → the string query the REST routes parse, so filtering is identical. */
  const toQuery = (args: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(args)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, Array.isArray(v) ? v.join(",") : String(v)]),
    );

  server.registerTool(
    "list_jobs",
    {
      title: "List tracked jobs",
      description: "Tracked jobs with filters, sorting and paging.",
      inputSchema: {
        ...jobFilter,
        sort: z.enum(JOB_SORT_FIELDS).optional(),
        order: z.enum(["asc", "desc"]).optional(),
        page: z.number().int().min(1).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      },
      annotations: READ,
    },
    (args) =>
      run(() => {
        const { rows, total, page, limit, hasNext } = jobRepo.list(parseJobQuery(toQuery(args)));
        return { data: rows.map(jobDto), pagination: { total, page, limit, has_next: hasNext } };
      }),
  );

  server.registerTool(
    "job_stats",
    {
      title: "Job search metrics",
      description:
        "Funnel, response/interview/offer rates, average days to response, timeline and " +
        "breakdowns by location, work mode, source and company, for the filtered jobs.",
      inputSchema: jobFilter,
      annotations: READ,
    },
    (args) => run(() => jobStats(parseJobQuery(toQuery(args)))),
  );
}
