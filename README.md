# APIMyResume

**A polished resume for every job.**

Keep one profile and turn it into beautiful, professional PDF resumes — then connect an AI agent, n8n, or Zapier to tailor each one to the job you want.

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

API and dashboard run at **http://localhost:3000** (bound to localhost — not exposed to the network).

Your API key is auto-generated on first start:

```bash
docker compose logs api | grep "API key"
```

---

## Public deployment with a custom domain + HTTPS

The default compose binds to `127.0.0.1` and serves plain HTTP — fine for local
use, but **do not expose port 3000 directly to the internet**. To run on your own
domain with automatic HTTPS, use the bundled production compose, which adds a
[Caddy](https://caddyserver.com) reverse proxy that obtains a free Let's Encrypt
certificate for you.

**Prerequisites:** a domain with a DNS `A`/`AAAA` record pointing at your server,
and ports 80 + 443 open.

```bash
DOMAIN=resume.example.com ACME_EMAIL=you@example.com \
  docker compose -f docker-compose.prod.yml up -d
```

That's it — `https://resume.example.com` now serves the dashboard and API with a
valid certificate. Caddy terminates TLS and forwards to the app, which is set up
to trust the proxy (`TRUST_PROXY=true`) so secure cookies and per-IP login
throttling work correctly.

Using a different proxy (Nginx, Traefik, Cloudflare Tunnel)? Point it at the app
and make sure it sets `X-Forwarded-Proto` and `X-Forwarded-For`, then run the app
with `TRUST_PROXY=true`.

### Security notes

- **Strong key by default** — leave `API_KEY` unset and a strong key is generated
  on first start. Never ship the dev placeholder to production.
- **Brute-force protection** — owner login/setup are throttled per client IP
  (`LOGIN_RATE_LIMIT`, default 10 / 15 min); the API is rate-limited per key
  (`RATE_LIMIT_PER_MINUTE`, default 120; `0` disables).
- **PDFs are private** — rendered resumes (`/pdfs/*.pdf`) and the resume/base
  thumbnail SVGs are personal data and require auth: the owner session (sent
  automatically by the dashboard) or an `X-API-Key` header. They are not openly
  accessible. To hand a single PDF to someone without an account, use `s3`
  storage and generate a presigned/expiring URL.
- **CORS** — the dashboard is same-origin and needs no config. Allow external
  browser clients with `ALLOWED_ORIGINS=https://your-domain` (comma-separated).

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

Two tiers of access, by design:

- **The human owner** creates and edits **base resumes** in the dashboard (logged-in
  owner session). The base fixes the template and the overall structure.
- **API keys** (AI agents / n8n / Zapier) can read bases and create & tailor **child
  resumes** — rewrite bullets, swap skills, inject keywords. They **cannot** change a
  base, its template, or the profile. Base-write endpoints return `403 owner_only`
  for API keys.

API requests send an `X-API-Key` header; the dashboard authenticates with the owner
session cookie. Rendered PDFs are personal data and require either — they are not
openly downloadable.

### Create a base resume (owner / dashboard)

Bases are created and edited by the human owner in the dashboard. The same endpoint
(`POST /api/v1/bases`) exists but requires the owner session — it is **not** available
to API keys. The KB shape it stores:

```jsonc
{
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
}
```

### Generate a tailored resume (API key)

Tailor a child from a base. The template and profile are inherited automatically;
send only the content you want to change under `overrides`:

```bash
curl -X POST http://localhost:3000/api/v1/resumes \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{
    "base_id": "john-doe-xxxx",
    "company": "Acme Corp",
    "role": "Senior Backend Engineer",
    "tags": ["backend", "acme"],
    "overrides": {
      "keywords": ["Go", "Kubernetes"],
      "inject_bullets": [
        { "target": "experience.acme", "mode": "prepend",
          "bullets": ["Scaled Go services on Kubernetes to 10k+ req/s."] }
      ],
      "skills": [{ "category": "Backend", "items": ["Go", "Kubernetes", "PostgreSQL"] }]
    }
  }'
# → { "id": "...", "pdf_url": "/pdfs/resume_xxx_v1.pdf" }
```

Unknown override keys, plus `profile` and `template`, are ignored — children tailor
content only. Update a child later with `PATCH /api/v1/resumes/{id}` (re-renders a new
PDF version).

### Download the PDF

PDFs require auth (owner session or API key) — they are not openly accessible:

```bash
curl http://localhost:3000/pdfs/resume_xxx_v1.pdf -H "X-API-Key: your-key" -o resume.pdf
```

### Full schema reference

```bash
curl http://localhost:3000/api/v1/schema
```

---

## n8n & AI agent integration

APIMyResume is designed to work inside automated workflows. You set up one base resume
in the dashboard; an AI agent then reads it and generates a tailored child PDF per job —
without ever touching the base structure, so it can't make a mess.

**Read base content (AI-optimised endpoint):**
```
GET /api/v1/bases/{id}/content
```
Returns experience, skills, and profile in a clean format so the agent knows what it can
tailor (read-only — the agent reads here, then writes a child below).

**Create a tailored child resume:**
```
POST /api/v1/resumes
{ "base_id": "...", "company": "Acme", "role": "Backend Engineer", "overrides": { ... } }
```
`overrides` accepts content sections (`experience`, `skills`, `projects`, …) and tailoring
directives (`keywords`, `inject_bullets`, `skills_highlight`). `profile` and `template` are
inherited and cannot be changed; unknown keys are ignored.

**Typical n8n workflow:**
1. HTTP Request → `GET /api/v1/bases/{id}/content` — read the base resume
2. AI Agent (Claude / GPT) — rewrite bullets and pick keywords for the job description
3. HTTP Request → `POST /api/v1/resumes` — create the tailored child; the response has its `pdf_url`

> Editing the base itself — `PATCH /api/v1/bases/{id}`, the per-job bullets endpoint, and
> `POST /api/v1/bases/{id}/regenerate-children` — is an **owner action** done in the
> dashboard, not part of the AI flow. These endpoints require the owner session and return
> `403 owner_only` for API keys.

Discover the full create-resume schema (fields, aliases, examples) any time:
```bash
curl http://localhost:3000/api/v1/schema
```

---

## API key management

Create and revoke API keys from the dashboard at `/api-keys`. Key management is an
**owner action**: the `/api/v1/api-keys` endpoints require the owner session and are
**not** accessible with an API key (a key cannot mint or revoke keys).

```bash
# Create a key — owner session required (the dashboard does this for you)
curl -X POST http://localhost:3000/api/v1/api-keys \
  -H "Cookie: amr_session=<owner-session>" \
  -H "Content-Type: application/json" \
  -d '{"name": "n8n integration"}'
# → { "key": "amr_live_xxxx" }  ← shown once, store it securely
```

Keys are stored as SHA-256 hashes. The full key is shown exactly once at creation.

---

## License

MIT
