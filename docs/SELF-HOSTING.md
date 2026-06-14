# Self-Hosting Guide

How to run APIMyResume on your own machine or server. Start with Docker — it's the easiest.

- [Run with Docker](#run-with-docker)
- [Put it online with a domain + HTTPS](#put-it-online-with-a-domain--https)
- [Security checklist](#security-checklist)
- [Configuration](#configuration)
- [Local development](#local-development)

---

## Run with Docker

One command:

```bash
docker compose up -d
```

The app (API + dashboard) is now at **http://localhost:3000**.

> By default it only listens on your own computer (`127.0.0.1`) — it is **not** exposed to the
> network. That's safe for trying it out locally.

Your API key is created automatically the first time it starts. Grab it from the logs:

```bash
docker compose logs api | grep "API key"
```

Then open http://localhost:3000 in your browser to set up your owner login and base resume.

---

## Put it online with a domain + HTTPS

Don't expose port 3000 to the internet directly. Instead, use the bundled production setup,
which adds a [Caddy](https://caddyserver.com) reverse proxy that gets a free HTTPS certificate
for you automatically.

**Before you start, you need:**
- A domain name with a DNS `A` (and/or `AAAA`) record pointing at your server.
- Ports **80** and **443** open on the server.

Then run:

```bash
DOMAIN=resume.example.com ACME_EMAIL=you@example.com \
  docker compose -f docker-compose.prod.yml up -d
```

That's it — `https://resume.example.com` now serves the dashboard and API with a valid
certificate. Caddy handles HTTPS and forwards traffic to the app, which is set to trust the
proxy (`TRUST_PROXY=true`) so secure cookies and login rate-limiting work correctly.

**Using a different proxy** (Nginx, Traefik, Cloudflare Tunnel)? Point it at the app, make
sure it sets the `X-Forwarded-Proto` and `X-Forwarded-For` headers, and run the app with
`TRUST_PROXY=true`.

---

## Security checklist

- **Strong key by default** — leave `API_KEY` unset and a strong one is generated on first
  start. Never ship the dev placeholder key to production.
- **Brute-force protection** — owner login/setup is rate-limited per IP (`LOGIN_RATE_LIMIT`,
  default 10 per 15 min). The API is rate-limited per key (`RATE_LIMIT_PER_MINUTE`, default
  120; set `0` to disable).
- **PDFs are private** — rendered resumes (`/pdfs/*.pdf`) and the preview images need auth (an
  owner login or `X-API-Key`). They are not publicly downloadable. To share a single PDF with
  someone who has no account, use `s3` storage and generate a presigned/expiring link.
- **CORS** — the dashboard is same-origin and needs no setup. To allow other websites'
  browsers to call the API, set `ALLOWED_ORIGINS=https://your-domain` (comma-separated).

---

## Configuration

Copy the example file and edit as needed:

```bash
cp .env.example .env
```

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3000` | Port for the API and dashboard |
| `API_KEY` | auto-generated | Set your own key instead of the generated one |
| `DATA_DIR` | `./data` | Where the database and PDFs are stored |
| `STORAGE_DRIVER` | `local` | `local` files, or `s3` for S3-compatible storage |

---

## Local development

Requires [Bun](https://bun.sh) 1.3+.

Run the API:

```bash
cd packages/api && bun install
bun run src/index.ts
```

Build the dashboard and have the API serve it:

```bash
cd packages/dashboard && bun install && bun run build
cd ../api && bun run src/index.ts   # dashboard is now at localhost:3000
```
