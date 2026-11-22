# APIMyResume Claude plugin

The plugin lets Claude manage your whole job search inside Claude Code, with no server to host
and no API key:

- build and update your **base resume**;
- tailor a **PDF resume and cover letter** for each job;
- **track applications** with status history and stats.

Everything runs locally. Your resumes, PDFs and job tracker live on your machine in the plugin's
data folder.

## Contents

- [Install](#install)
- [What you can ask](#what-you-can-ask)
- [Where your data lives](#where-your-data-lives)
- [Tools](#tools)
- [Skills](#skills)
- [Building from source](#building-from-source)
- [Troubleshooting](#troubleshooting)

## Install

Requirements: Claude Code and [Bun](https://bun.sh) (`npm install -g bun`).

```
/plugin install apimyresume --marketplace AjinkyaGokhale/apimyresume
```

Or in two steps:

```
/plugin marketplace add AjinkyaGokhale/apimyresume
/plugin install apimyresume@apimyresume
```

Claude Code installs the plugin's one native dependency (the Typst PDF renderer) automatically.

## What you can ask

- "Build my resume from `~/Downloads/cv.pdf`."
- "Add my new job at Acme to my base resume."
- "Here's a job posting: tailor my resume and write a cover letter."
- "I heard back from Globex, they want an interview next week."
- "What should I follow up on?" / "How is my job search going this month?"

## Where your data lives

| What | Where |
|---|---|
| Database (bases, resumes, jobs) | `~/.claude/plugins/data/<plugin id>/apimyresume.db` |
| Tailored resume PDFs | `…/pdfs/` |
| Previews and cover letters | `…/previews/`, `…/cover-letters/` |

Tools return the absolute path of every PDF they write. The data folder survives plugin updates.
Uninstalling the plugin deletes it unless you pass `--keep-data`.

## Tools

| Group | Tools |
|---|---|
| Start | `get_guide`, `list_templates` |
| Base resume | `list_bases`, `get_base`, `preview_base`, `create_base`, `update_base` |
| Tailored resumes | `list_resumes`, `get_resume`, `create_resume`, `update_resume` |
| Cover letters | `set_cover_letter`, `render_cover_letter` |
| Job tracker | `track_job`, `update_job`, `get_job`, `list_jobs`, `job_stats` |

The tools use the same validation and rules as the [REST API](API.md):

- tailored resumes always inherit the base's template;
- `track_job` with a known `job_url` updates that job rather than adding a duplicate;
- every status change is kept in the job's history.

Nothing can be deleted through the plugin. Claude marks a job `withdrawn` instead.

## Skills

The plugin also teaches Claude three workflows, available as `/apimyresume:<skill>`:

- **resume-builder**: gather your real history (from a file or a short interview), pick a
  template, preview, then save the base resume.
- **tailor-resume**: compare a posting with your base, create a tailored resume and optional
  cover letter, and log the application.
- **job-tracker**: log status changes, find follow-ups, and summarise your stats.

Claude is instructed never to invent employers, dates, degrees, metrics or skills. Tailoring
only re-frames facts already in your base resume.

## Building from source

The plugin lives in [`plugin/`](../plugin). Its server is a single-file bundle of the API's
MCP entry point (`packages/api/src/mcp/stdio.ts`), with the templates copied next to it:

```bash
cd packages/api
bun run build:plugin      # writes plugin/server/server.js and plugin/templates/
```

Commit the rebuilt `plugin/server` and `plugin/templates` with any change to the API or the
templates, because a git install only receives the `plugin/` folder. If you bump
`@myriaddreamin/typst-ts-node-compiler`, bump it in `plugin/package.json` and `plugin/bun.lock`
too; the build fails if the versions differ.

Try a local checkout without installing:

```bash
claude --plugin-dir ./plugin
```

Run the unbundled server directly (uses `./data` like the API):

```bash
cd packages/api && bun run src/mcp/stdio.ts
```

## Troubleshooting

- **The tools don't show up:** check that Bun is installed (`bun --version`), then run `/mcp` and
  reconnect `apimyresume`.
- **"Validation failed" errors:** the tool result lists each invalid field. Claude normally fixes
  these and retries by itself.
