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
  // AUTH MODEL: base resumes are created and edited only by the human owner via
  // the dashboard (owner session). All base *writes* below require that session
  // and return 403 `owner_only` for API-key clients. API keys may READ bases and
  // create/tailor child resumes (POST /api/v1/resumes) — that is their surface.
  const ownerOnly = "Owner session (dashboard) — returns 403 for API keys";
  const baseEndpoints = [
    {
      method: "GET",
      path: "/api/v1/bases/{id}/content",
      summary:
        "Read a base resume's tailorable content (experience, skills, profile summary) " +
        "in an AI-friendly shape — call this before creating a tailored child.",
      auth: "X-API-Key",
    },
    {
      method: "GET",
      path: "/api/v1/bases/{id}",
      summary: "Read a base resume. The full KB document is returned under `data`.",
      auth: "X-API-Key",
    },
    {
      method: "PATCH",
      path: "/api/v1/bases/{id}",
      summary: "Update a base resume (owner only — structural edits are a human action).",
      auth: ownerOnly,
      content_type: "application/json",
      body: "A partial KB — every top-level field is optional except `id`, which is immutable.",
      notes: [
        "Shallow merge: each top-level field you send REPLACES that whole field. " +
          "To change one item in an array (e.g. a single experience bullet), read the base first, " +
          "edit the array locally, then PATCH the full array back.",
        "The base's display name is always derived from `profile.name` — a top-level `name` in the body is ignored on update, so rename via `profile.name`.",
        "Editing a base does NOT re-render existing child resumes (they keep their stored PDFs). " +
          "Use POST /api/v1/bases/{id}/regenerate-children to re-render them all with the updated base.",
      ],
      example: {
        request: {
          profile: {
            name: "Max Muster",
            title: "Senior Software Engineer",
            email: "max@example.com",
            summary: "Updated summary line.",
          },
          skills: [{ category: "Languages", items: ["TypeScript", "Go", "Rust"] }],
        },
      },
    },
    {
      method: "POST",
      path: "/api/v1/bases/{id}/regenerate-children",
      summary: "Re-render every child resume using the current base + each child's stored overrides.",
      auth: ownerOnly,
      returns: { regenerated: "number", children: ["{ id, pdf_url, version }"] },
    },
    {
      method: "DELETE",
      path: "/api/v1/bases/{id}",
      summary: "Delete a base. Rejected with 409 if it has children unless `?cascade=true`, which also deletes every child resume and its PDF.",
      auth: ownerOnly,
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
    // Human-readable reference for the base-resume management endpoints.
    endpoints: baseEndpoints,
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
