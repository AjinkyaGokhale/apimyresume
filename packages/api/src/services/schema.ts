import { templateRegistry } from "../templates/registry.ts";

/**
 * AI discovery schema (spec §17). Returns a draft-07 JSON Schema describing the
 * POST /api/v1/resumes body. The same document is shaped to drop straight into
 * OpenAI function calling (name/description/parameters) and Anthropic tool_use
 * (input_schema), and advertises the normalizer aliases via x-aliases.
 */
export function buildSchemaDocument() {
  const templateIds = templateRegistry.list().map((t) => t.id);
  // basic-resume listed first / default when present (spec §17).
  const ordered = [
    ...templateIds.filter((id) => id === "basic-resume"),
    ...templateIds.filter((id) => id !== "basic-resume"),
  ];

  const parameters = {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      base_id: {
        type: "string",
        description: "Id of the base resume to derive from (required).",
        example: "base-andy",
      },
      template: {
        type: "string",
        description:
          "Read-only — do NOT set. Child resumes always inherit the base's template; " +
          "any value here is ignored (with a warning). The template is part of the " +
          "base structure the human owner fixes, never tailorable per child.",
        ...(ordered.length ? { enum: ordered } : {}),
      },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Free-form labels for organising the resume.",
        example: ["google", "backend", "2026"],
      },
      meta: {
        type: "object",
        description: "Application metadata.",
        properties: {
          company: { type: "string", description: "Target company name.", example: "Google" },
          role: { type: "string", description: "Target role / job title.", example: "Senior Software Engineer" },
        },
      },
      overrides: {
        type: "object",
        description:
          "Content-only diff applied on top of the base KB to tailor this resume. " +
          "Only the content sections and directives below are accepted — `profile` " +
          "(name, title, contact, links) and `template` are inherited from the base " +
          "and are NOT overridable, and any other/unknown keys are silently dropped. " +
          "A section you send REPLACES that whole section for this child; read the base " +
          "via GET /api/v1/bases/{id}/content first, then send back the edited section.",
        properties: {
          // Replaceable content sections (each mirrors the base KB section).
          experience: {
            type: "array",
            description: "Replace the experience list (rewrite bullets, reorder, trim) for this child.",
          },
          skills: {
            type: "array",
            description:
              "Replace the skills list for this child.",
            example: [{ category: "Languages", items: ["Go", "Python"] }],
          },
          projects: { type: "array", description: "Replace the projects list for this child." },
          education: { type: "array", description: "Replace the education list for this child." },
          certifications: { type: "array", description: "Replace the certifications list for this child." },
          extracurriculars: { type: "array", description: "Replace the extracurriculars list for this child." },
          languages: { type: "array", description: "Replace the languages list for this child." },
          awards: { type: "array", description: "Replace the awards list for this child." },
          custom: { type: "array", description: "Replace the custom sections for this child." },

          // Tailoring directives.
          keywords: {
            type: "array",
            items: { type: "string" },
            description: "Tailoring keywords rendered as a separate block.",
            example: ["Kubernetes", "Go"],
          },
          inject_bullets: {
            type: "array",
            description:
              "Append/prepend/replace bullets on an experience entry by id — the surgical " +
              "way to rewrite work-experience bullets without resending the whole section.",
            items: {
              type: "object",
              properties: {
                target: { type: "string", example: "experience.nineti" },
                mode: { type: "string", enum: ["append", "prepend", "replace"], default: "append" },
                bullets: { type: "array", items: { type: "string" } },
              },
              required: ["target", "bullets"],
            },
          },
          skills_highlight: {
            type: "array",
            items: { type: "string" },
            description: "Skill names to emphasise for this role.",
            example: ["Go", "Kubernetes"],
          },
        },
      },
    },
    required: ["base_id"],
  } as const;

  // Human-readable reference for managing the base resume (the canonical KB
  // that child resumes derive from). Kept alongside the create_resume tool so
  // both live under the single /api/v1/schema discovery document.
  //
  // AUTH MODEL: child resumes are the API surface — API keys create, read,
  // tailor, update, re-render and delete them (endpoints below). The base resume
  // is the canonical source: API keys may READ it (the two GETs below), but it is
  // created, edited and deleted only by the human owner in the dashboard.
  const baseEndpoints = [
    {
      method: "GET",
      path: "/api/v1/bases/{id}/content",
      summary:
        "Read a base resume's tailorable content (experience, skills, profile summary) " +
        "in an AI-friendly shape — call this before creating or updating a tailored child.",
      auth: "X-API-Key",
    },
    {
      method: "GET",
      path: "/api/v1/bases/{id}",
      summary: "Read a base resume. The full KB document is returned under `data`.",
      auth: "X-API-Key",
    },
  ];

  // Child-resume lifecycle — the primary API surface for AI agents / n8n / Zapier.
  // All accept the X-API-Key header. A child is a base_id + a content-only
  // `overrides` diff; every create/update/regenerate re-renders a PDF.
  const childEndpoints = [
    {
      method: "POST",
      path: "/api/v1/resumes",
      summary:
        "Create a tailored child resume from a base and render a PDF. This is the main " +
        "endpoint — see the full request body under “Child resume” below.",
      auth: "X-API-Key",
      content_type: "application/json",
      returns: { id: "string", pdf_url: "string", version: "number" },
    },
    {
      method: "GET",
      path: "/api/v1/resumes",
      summary:
        "List child resumes. Filter with ?company= , ?tag= , ?base_id= ; paginate with " +
        "?page= & ?limit= (default 20). Returns { data, pagination }.",
      auth: "X-API-Key",
    },
    {
      method: "GET",
      path: "/api/v1/resumes/{id}",
      summary:
        "Read one child resume (its stored `overrides` + meta). Add ?expand=true to get the " +
        "fully merged base+overrides KB that was rendered.",
      auth: "X-API-Key",
    },
    {
      method: "PATCH",
      path: "/api/v1/resumes/{id}",
      summary: "Update a child's overrides / meta / tags, then re-render a new PDF version.",
      auth: "X-API-Key",
      content_type: "application/json",
      body: "Any of: `overrides`, `meta` { company, role }, `tags`. All optional.",
      notes: [
        "`overrides` is REPLACED wholesale — it is NOT deep-merged. To change one directive, " +
          "GET the resume first, edit the complete `overrides` object, then PATCH it all back. " +
          "Sending `overrides: {}` clears every tailoring and renders the plain base.",
        "`meta.company`, `meta.role` and `tags` are applied individually — omit a field to leave it unchanged.",
        "Every successful PATCH re-renders the PDF and bumps `version`; the new file is in `pdf_url`.",
        "`profile` and `template` are inherited from the base and cannot be changed here.",
      ],
      example: {
        request: {
          meta: { company: "Acme Corp", role: "Senior Backend Engineer" },
          overrides: {
            keywords: ["Go", "Kubernetes"],
            skills_highlight: ["Go", "Kubernetes"],
            inject_bullets: [
              { target: "experience.acme", mode: "replace", bullets: ["Scaled Go services on Kubernetes to 10k+ req/s."] },
            ],
          },
        },
      },
    },
    {
      method: "POST",
      path: "/api/v1/resumes/{id}/regenerate",
      summary: "Re-render the child's PDF from its current data (no content change). Bumps `version`.",
      auth: "X-API-Key",
      returns: { id: "string", pdf_url: "string", version: "number" },
    },
    {
      method: "GET",
      path: "/api/v1/resumes/{id}/pdf",
      summary: "302-redirect to the latest rendered PDF for this child (auth still required).",
      auth: "X-API-Key",
    },
    {
      method: "DELETE",
      path: "/api/v1/resumes/{id}",
      summary: "Delete a child resume and its stored PDF. Returns 204.",
      auth: "X-API-Key",
    },
  ];

  return {
    name: "create_resume",
    description:
      "Create a tailored CHILD resume from a base resume and return a rendered PDF url. " +
      "This is the API surface for AI agents / n8n / Zapier: tailor content (rewrite " +
      "bullets via inject_bullets, swap skills/projects, inject keywords). The base's " +
      "template and profile are inherited and cannot be changed here, and base resumes " +
      "themselves are created/edited only by the human owner in the dashboard. " +
      "Loose field names are normalised — see x-aliases.",
    // OpenAI function-calling shape:
    parameters,
    // Anthropic tool_use shape:
    input_schema: parameters,
    // Human-readable reference for the base-resume READ endpoints.
    endpoints: baseEndpoints,
    // Human-readable reference for the child-resume lifecycle (the API surface).
    child_endpoints: childEndpoints,
    // Normalizer aliases (spec §17, Appendix D):
    "x-aliases": {
      "overrides.keywords": ["keywords", "key_skills", "skills", "highlight_skills"],
      "overrides.inject_bullets": ["inject_bullets", "bullets", "new_bullets", "add_bullets"],
      "overrides.skills_highlight": ["skills_highlight", "highlight_skills", "featured_skills"],
      "meta.company": ["company", "company_name", "employer"],
      "meta.role": ["role", "job_title", "position", "title"],
      tags: ["tags", "labels", "categories"],
    },
  };
}
