# APIMyResume

**Open-source resume generation API.** Build tailored, job-specific PDF resumes programmatically — connect to n8n, Zapier, or any AI agent to automate your job application workflow.

Create one base resume. Generate unlimited targeted versions per company and role, each rendered as a pixel-perfect PDF via [Typst](https://typst.app).

---

## What you can do

- **Generate PDFs via API** — POST a job description, get a tailored PDF back
- **Manage base resumes** — one canonical profile, many targeted versions
- **Inject keywords per job** — update skills and experience bullets without rewriting everything
- **Connect to n8n / Zapier** — full REST API with API key auth, ready for automation
- **Self-host in one command** — single Docker image, SQLite, no external dependencies
- **Browse via dashboard** — built-in web UI to manage resumes, preview PDFs, manage API keys

---

## Self-host with Docker

```bash
docker compose up -d
```

API and dashboard run at **http://localhost:3000**.

Your API key is auto-generated on first start:

```bash
docker compose logs api | grep "API key"
```

---

## Local development

Requires [Bun](https://bun.sh) 1.3+

```bash
cd packages/api && bun install
bun run src/index.ts
```

Build and serve the dashboard alongside the API:

```bash
cd packages/dashboard && bun install && bun run build
cd ../api && bun run src/index.ts   # dashboard now served at localhost:3000
```

---

## Configuration

```bash
cp .env.example .env
```

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port for API and dashboard |
| `API_KEY` | auto-generated | Override with your own key |
| `DATA_DIR` | `./data` | Storage location for DB and PDFs |
| `STORAGE_DRIVER` | `local` | `local` or `s3` for S3-compatible storage |

---

## API usage

All requests require an `X-API-Key` header. Public PDF downloads require no auth.

### Create a base resume

```bash
curl -X POST http://localhost:3000/api/v1/bases \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe - Software Engineer",
    "template": "basic-resume",
    "profile": {
      "name": "John Doe",
      "title": "Software Engineer",
      "email": "john@example.com",
      "links": { "github": "github.com/johndoe", "linkedin": "linkedin.com/in/johndoe" }
    },
    "experience": [...],
    "skills": [...]
  }'
```

### Generate a tailored resume

```bash
curl -X POST http://localhost:3000/api/v1/resumes \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "base_id": "john-doe-xxxx",
    "company": "Acme Corp",
    "role": "Senior Backend Engineer",
    "tags": ["backend", "acme"]
  }'
# → { "id": "...", "pdf_url": "/pdfs/resume_xxx_v1.pdf" }
```

### Download the PDF

```bash
curl http://localhost:3000/pdfs/resume_xxx_v1.pdf -o resume.pdf
```

### Full schema reference

```bash
curl http://localhost:3000/api/v1/schema
```

---

## n8n & AI agent integration

APIMyResume is designed to work inside automated workflows. An AI agent can read your resume, suggest targeted updates based on a job description, and write the changes back — all via REST.

**Read resume content (AI-optimised endpoint):**
```
GET /api/v1/bases/{id}/content
```
Returns experience, skills, and profile in a clean format with instructions for how to update.

**Update skills and experience (replace, never append):**
```
PATCH /api/v1/bases/{id}
{ "skills": [...], "experience": [...] }
```

**Update a single job's bullet points:**
```
PATCH /api/v1/bases/{id}/experience/{entryId}/bullets
["Led backend migration to microservices", "Reduced latency by 40%..."]
```

**Re-render all child PDFs after updating:**
```
POST /api/v1/bases/{id}/regenerate-children
```

**Typical n8n workflow:**
1. HTTP Request → `GET /api/v1/bases/{id}/content` — read current resume
2. AI Agent (Claude / GPT) — rewrite bullets and inject keywords for the job
3. HTTP Request → `PATCH /api/v1/bases/{id}` — save updates
4. HTTP Request → `POST /api/v1/bases/{id}/regenerate-children` — get fresh PDFs

---

## API key management

Create and revoke API keys from the dashboard at `/api-keys`, or via the API:

```bash
# Create a key
curl -X POST http://localhost:3000/api/v1/api-keys \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{"name": "n8n integration"}'
# → { "key": "amr_live_xxxx" }  ← shown once, store it securely

# List keys
curl http://localhost:3000/api/v1/api-keys -H "X-API-Key: your-key"

# Revoke a key
curl -X DELETE http://localhost:3000/api/v1/api-keys/{id} -H "X-API-Key: your-key"
```

Keys are stored as SHA-256 hashes. The full key is shown exactly once at creation.

---

## License

MIT
