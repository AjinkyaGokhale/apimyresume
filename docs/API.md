# API Reference

This guide explains how to use the APIMyResume API to generate tailored PDF resumes — from
a simple `curl` command, an AI agent, n8n, or Zapier.

If you're new here, read the **[two big ideas](#the-two-big-ideas)** first. Everything else
builds on them.

- [The two big ideas](#the-two-big-ideas)
- [Authentication](#authentication)
- [Child resumes (what the API does)](#child-resumes-what-the-api-does)
  - [Create a resume](#create-a-resume)
  - [Update a resume](#update-a-resume)
  - [List, read, regenerate, delete](#list-read-regenerate-delete)
  - [Download the PDF](#download-the-pdf)
- [Cover letters](#cover-letters)
- [Reading the base resume](#reading-the-base-resume)
- [Use it with n8n / AI agents](#use-it-with-n8n--ai-agents)
- [API keys](#api-keys)
- [Full schema (machine-readable)](#full-schema-machine-readable)

> Examples use `http://localhost:3000`. If you deployed to a domain, swap in your own URL.

---

## The two big ideas

**1. The base resume = your master profile.**
It holds everything about you: your name, contact details, work experience, skills, and the
PDF design (the "template"). You create and edit the base **in the dashboard** (the website
UI). It is your source of truth.

**2. The child resume = one resume for one job.**
A child is a *copy of the base with small tweaks* for a specific job — different keywords,
reworded bullet points, a reordered skills list. Each child renders to its own PDF.

**The API is all about child resumes.** With an API key you can create, update, and manage as
many children as you want. You can also *read* the base (to know what's in it), but you can't
change the base with an API key — that keeps your master profile safe from accidental edits.

```
            base resume (master, edited in dashboard)
                 │  read-only via API
     ┌───────────┼───────────┐
   child         child       child      ← created & edited via API key
  (Google)      (Acme)      (Stripe)
     │            │           │
   PDF          PDF         PDF
```

---

## Authentication

Every API request needs your API key in the `X-API-Key` header:

```bash
curl http://localhost:3000/api/v1/resumes -H "X-API-Key: your-key"
```

| Who | How they log in | What they can do |
|---|---|---|
| **You (the owner)** | Dashboard website (a login cookie) | Everything, including creating/editing the base resume |
| **An API key** | `X-API-Key` header | Full control of child resumes + read the base |

If you try to edit the base with an API key, you'll get `403 owner_only` — that's expected.

> The PDFs and preview images are private (they contain personal data), so they also need the
> `X-API-Key` header or an owner login. They aren't open to the public.

---

## Child resumes (what the API does)

A child resume is just two things:

1. `base_id` — which base resume to copy from.
2. `overrides` — the tweaks you want for this job.

Everything you don't override is inherited from the base. The PDF is rendered automatically,
and **every create or update produces a new PDF version**.

### What can go in `overrides`?

**Content sections** (each one *replaces* that whole section for this child):
`experience`, `skills`, `projects`, `education`, `certifications`, `extracurriculars`,
`languages`, `awards`, `custom`.

**Tailoring directives:**

| Directive | What it does |
|---|---|
| `keywords` | Adds a separate keyword block (handy for getting past resume screeners / ATS). |
| `section_order` | Reorders the resume's sections for this child, e.g. `["experience", "education", "skills"]`. Sections you omit keep their template order behind the ones you list; the header always stays at the top. |
| `skills_highlight` | Marks certain skills as important for this role. |
| `inject_bullets` | Rewrites the bullet points of **one** job entry, without resending the whole experience list. |

`inject_bullets` is the surgical tool. Each item looks like this:

```jsonc
{
  "target": "experience.<id>",   // the id of the experience entry to change
  "mode": "append",              // "append", "prepend", or "replace"
  "bullets": ["New bullet point here."]
}
```

> `profile` (your name, contact, links) and `template` (the design) **cannot** be changed in a
> child — they always come from the base. Any unknown keys you send are quietly ignored.

### Create a resume

`POST /api/v1/resumes`

```bash
curl -X POST http://localhost:3000/api/v1/resumes \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "base_id": "john-doe-xxxx",
    "meta": { "company": "Acme Corp", "role": "Senior Backend Engineer" },
    "tags": ["backend", "acme"],
    "overrides": {
      "keywords": ["Go", "Kubernetes"],
      "skills_highlight": ["Go", "Kubernetes"],
      "inject_bullets": [
        { "target": "experience.acme", "mode": "replace",
          "bullets": ["Scaled Go services on Kubernetes to 10k+ req/s."] }
      ],
      "skills": [{ "category": "Backend", "items": ["Go", "Kubernetes", "PostgreSQL"] }]
    }
  }'

# → 201 { "id": "resume_xxx", "pdf_url": "/pdfs/resume_xxx_v1.pdf", "version": 1 }
```

The response gives you the new resume's `id` and `pdf_url`. Done — that's your tailored resume.

### Update a resume

`PATCH /api/v1/resumes/{id}`

Send any of `overrides`, `meta` (`company` / `role`), or `tags`. A new PDF is rendered and the
`version` number goes up.

> ⚠️ **Important: `overrides` is replaced, not merged.**
> Whatever `overrides` object you send becomes the *entire* new override. So to change one
> little thing, first **read** the resume (`GET /api/v1/resumes/{id}`), edit the full
> `overrides` object on your side, then send the whole thing back.
> Sending `"overrides": {}` removes all tweaks and renders the plain base.
> (`meta.company`, `meta.role`, and `tags` are different — those update one at a time, and
> anything you leave out stays the same.)

```bash
curl -X PATCH http://localhost:3000/api/v1/resumes/resume_xxx \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "meta": { "role": "Staff Backend Engineer" },
    "overrides": {
      "keywords": ["Go", "Kubernetes", "gRPC"],
      "inject_bullets": [
        { "target": "experience.acme", "mode": "replace",
          "bullets": ["Led a 4-engineer team building gRPC services on Kubernetes."] }
      ]
    }
  }'

# → 200 { "id": "resume_xxx", "pdf_url": "/pdfs/resume_xxx_v2.pdf", "version": 2 }
```

### List, read, regenerate, delete

```bash
# List your resumes — filter by company / tag / base, and page through results
curl "http://localhost:3000/api/v1/resumes?company=Acme&tag=backend&page=1&limit=20" \
  -H "X-API-Key: your-key"

# Read one resume (shows its saved overrides + meta)
curl http://localhost:3000/api/v1/resumes/resume_xxx -H "X-API-Key: your-key"

# Read the FULL merged content (base + overrides) that was used to render the PDF
curl "http://localhost:3000/api/v1/resumes/resume_xxx?expand=true" -H "X-API-Key: your-key"

# Re-render the PDF without changing anything (bumps the version)
curl -X POST http://localhost:3000/api/v1/resumes/resume_xxx/regenerate -H "X-API-Key: your-key"

# Delete a resume and its PDF
curl -X DELETE http://localhost:3000/api/v1/resumes/resume_xxx -H "X-API-Key: your-key"
```

> **Friendly field names:** the API accepts loose names too. For example, `company` and `role`
> work at the top level (they map to `meta.*`), and `skills` / `bullets` map to the right
> `overrides` keys. The full alias list is in `GET /api/v1/schema` under `x-aliases`.

### Download the PDF

PDFs need your API key (they're private):

```bash
curl http://localhost:3000/pdfs/resume_xxx_v1.pdf -H "X-API-Key: your-key" -o resume.pdf
```

You can also use `GET /api/v1/resumes/{id}/pdf`, which redirects to the latest PDF.

---

## Cover letters

Each child resume can carry a **matching cover letter**, rendered to its own PDF. You supply
only the **recipient** and the **letter body** — the author block (your name, contact details,
location) is taken from the resume's profile, so the resume and its cover letter always share
one identity. The resume's `company` fills in the recipient's organisation if you don't.

> Cover letters only work when the resume's template ships a cover-letter variant (for example
> **Clickworthy Resume**). A resume on a template without one returns `422 cover_letter_unsupported`.
> `GET /api/v1/resumes/{id}` reports `has_cover_letter` so you can check first.

### Set or replace the cover letter

`PUT /api/v1/resumes/{id}/cover-letter`

```bash
curl -X PUT http://localhost:3000/api/v1/resumes/resume_xxx/cover-letter \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "addressee": {
      "name": "Dr. Jane Smith",
      "institution": "Acme Corp",
      "city": "Tech City", "state": "CA", "zip": "90210", "country": "USA"
    },
    "body": {
      "intro": "I am writing to apply for the Senior Backend Engineer position.",
      "paragraphs": [
        "At Acme I scaled Go services on Kubernetes to 10k+ req/s.",
        "I thrive in distributed-systems work and cross-team collaboration."
      ],
      "closing": "Thank you for considering my application.",
      "signoff": "Sincerely"
    }
  }'
```

- `addressee.name` is required; the rest of the address block is optional. `institution`
  defaults to the resume's `company`.
- `body` fields are plain text. `paragraphs` is a list; the salutation (“Dear …,”) and your
  signature are added automatically. `date` is optional and defaults to today.

### Read, render, remove

```bash
# Read the stored cover letter
curl http://localhost:3000/api/v1/resumes/resume_xxx/cover-letter -H "X-API-Key: your-key"

# Download the cover-letter PDF (rendered on demand)
curl http://localhost:3000/api/v1/resumes/resume_xxx/cover-letter/pdf \
  -H "X-API-Key: your-key" -o cover-letter.pdf

# Preview a letter without saving it (same body shape as PUT)
curl -X POST http://localhost:3000/api/v1/resumes/resume_xxx/cover-letter/preview \
  -H "X-API-Key: your-key" -H "Content-Type: application/json" \
  -d @cover-letter.json -o preview.pdf

# Remove the cover letter
curl -X DELETE http://localhost:3000/api/v1/resumes/resume_xxx/cover-letter -H "X-API-Key: your-key"
```

One identity, two documents — fully automatable: create the child resume, `PUT` its cover
letter, then `GET` both PDFs.

---

## Reading the base resume

You can't *edit* the base with an API key, but you can *read* it — useful so an AI agent knows
what it's working with before it creates a child.

```bash
# AI-friendly view: just the parts you can tailor (experience, skills, profile summary)
curl http://localhost:3000/api/v1/bases/{id}/content -H "X-API-Key: your-key"

# The full base document
curl http://localhost:3000/api/v1/bases/{id} -H "X-API-Key: your-key"
```

---

## Use it with n8n / AI agents

APIMyResume is built for automation. The usual flow:

1. **Read the base** → `GET /api/v1/bases/{id}/content`
   So the agent knows your real experience and skills.
2. **Let the AI tailor it** → ChatGPT / Claude reads the job description and rewrites bullets,
   picks keywords, etc.
3. **Create the child** → `POST /api/v1/resumes`
   The response has the `pdf_url` of the finished resume.
4. **(Optional) Add a cover letter** → `PUT /api/v1/resumes/{id}/cover-letter`
   The agent writes the recipient + body; the author identity comes from the resume. Then
   `GET /api/v1/resumes/{id}/cover-letter/pdf` for the letter PDF.
5. **(Optional) Refine it later** → `PATCH /api/v1/resumes/{id}`
   A new PDF version is rendered.

> Your base is never touched by automation. Creating or editing a base is an owner action in
> the dashboard and returns `403 owner_only` for API keys — so an agent can experiment freely
> on job-specific copies without any risk to your master profile.

---

## API keys

Create and revoke keys in the dashboard at `/api-keys`. This is an **owner action** — API
keys can't create or delete other keys.

```bash
# Done for you by the dashboard; shown here for reference (needs the owner login)
curl -X POST http://localhost:3000/api/v1/api-keys \
  -H "Cookie: amr_session=<owner-session>" \
  -H "Content-Type: application/json" \
  -d '{"name": "n8n integration"}'

# → { "key": "amr_live_xxxx" }   ← shown once, copy it now
```

Keys are stored hashed (SHA-256). The full key is shown **only once**, at creation — save it
somewhere safe.

---

## Full schema (machine-readable)

Want the complete, always-up-to-date list of fields, examples, and aliases? Ask the API:

```bash
curl http://localhost:3000/api/v1/schema
```

This same document is shaped to drop straight into OpenAI function calling and Anthropic
tool use, so an AI agent can discover everything on its own.
