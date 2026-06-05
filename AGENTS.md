# AGENTS.md

Operating rules for AI agents working in this repository. Follow them strictly.

## Project

APIMyResume — a KB-driven resume API with a native Typst render pipeline.

- `packages/api` — Bun + Hono + Drizzle + `bun:sqlite`, Typst render via `@myriaddreamin/typst-ts-node-compiler`.
- `packages/dashboard` — SvelteKit (static adapter).
- `templates/`, `fonts/`, `vendor/` — render assets shipped into the image.

## Core rules

1. **Minimal commands.** Run the fewest commands needed. Do not run broad scans, recursive scripts, or repeated builds when one targeted command answers the question. Prefer reading files over shelling out.
2. **Security first.** Never weaken auth, log secrets/API keys, disable TLS/verification, or commit credentials. The API key stays server-side. Validate and sanitize all external input. Flag any change that touches auth, storage, or input handling.
3. **No speculative tests.** Test real, reachable behavior only. Do not add or "fix" tests for inputs or states that cannot occur in this system. Delete a test before contorting code to satisfy an impossible case.
4. **No significant changes.** Stay within the scope of the request. Do not refactor, rename, restructure, upgrade dependencies, or change architecture/public APIs unless explicitly asked. Make the smallest change that solves the task.
5. **Match existing style.** Mirror surrounding naming, structure, and conventions. Do not introduce new patterns, libraries, or abstractions without need.

## Workflow

- Make the change, then verify only what you touched.
- Do not commit, push, or open PRs unless asked.
- If a task implies a large or risky change, stop and confirm before proceeding.
- Surface uncertainty plainly; do not claim something works without verifying it.

## Verification

API (`packages/api`):

```
bun run typecheck
bun test
```

Dashboard (`packages/dashboard`):

```
bun run check
bun run build
```

Run only the package relevant to your change. Do not run the full Docker build to verify code changes.

## Out of scope unless requested

- Dependency upgrades or lockfile changes.
- Reformatting or restructuring untouched files.
- New tooling, configuration, or CI changes.
- Performance or architecture rewrites.
