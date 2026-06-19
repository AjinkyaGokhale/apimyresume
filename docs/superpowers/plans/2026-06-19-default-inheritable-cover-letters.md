# Default + Inheritable Cover Letters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a default cover-letter design that every resume template can render, plus a base-level cover letter that child resumes inherit and tailor (body + company details) over the API.

**Architecture:** A single adapted `cover-letter.typ` under `templates/typst-coverletter/` becomes a registry-loaded default; any template lacking its own letter falls back to it, so `hasCoverLetter` is true everywhere. A new nullable `cover_letter` JSON column on `bases` stores a default letter as a *partial* (no-defaults) shape; child resumes store a partial override diff; at render time the two are deep-merged (child wins per field) and rendered through the existing `sys.inputs.resume` context contract — unchanged.

**Tech Stack:** Bun, Hono, Drizzle + `bun:sqlite`, Zod, Typst (`@myriaddreamin/typst-ts-node-compiler`).

## Global Constraints

- Stay within scope; make the smallest change that solves the task (AGENTS.md rule 4).
- Never weaken auth, log secrets, or relax input validation; cover-letter body text is rendered as literal data, never evaluated as Typst markup (AGENTS.md rule 2).
- Match existing style and patterns; no new libraries or abstractions (AGENTS.md rule 5).
- No speculative tests — test only real, reachable behavior (AGENTS.md rule 3).
- Verify with `cd packages/api && bun run typecheck` and `bun test`. Run only the API package.
- Commit messages end with: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure

- `packages/api/src/types/coverletter.ts` — add partial (no-defaults) schemas; `CoverLetter` becomes the partial type.
- `packages/api/src/pipeline/merge.ts` — export the existing `deepMerge` helper for reuse.
- `packages/api/src/services/coverletter.ts` — `mergeCoverLetter`, refactored `buildCoverLetterContext(profile, company, coverLetter)`, inheritance in the render path, and base cover-letter service functions.
- `packages/api/src/db/schema.ts` + `db/migrate.ts` — `bases.cover_letter` column + idempotent upgrade path.
- `templates/typst-coverletter/cover-letter.typ` — the default letter (new file).
- `packages/api/src/templates/registry.ts` + `templates/types.ts` — default fallback wiring + doc comments.
- `packages/api/src/api/routes/bases.ts` — base cover-letter routes.
- `packages/api/src/services/schema.ts` — AI discovery doc updates.
- `packages/api/src/services/coverletter.test.ts` + `api/security.test.ts` — tests.

---

### Task 1: Partial cover-letter schema

**Files:**
- Modify: `packages/api/src/types/coverletter.ts`
- Test: `packages/api/src/services/coverletter.test.ts` (replace the existing `coverLetterSchema` describe block)

**Interfaces:**
- Produces: `coverLetterInputSchema` (Zod), `CoverLetter` (type = partial), `addresseePartialSchema`, `coverLetterBodyPartialSchema`. All fields optional; **no `.default(...)`** so an absent field means "inherit". Unknown keys stripped (no `.passthrough()`).

- [ ] **Step 1: Replace the schema test**

In `packages/api/src/services/coverletter.test.ts`, change the import on line 4 to:

```typescript
import { coverLetterInputSchema, type CoverLetter } from "../types/coverletter.ts";
```

Replace the entire `describe("coverLetterSchema", ...)` block (lines 36–43) with:

```typescript
describe("coverLetterInputSchema (partial, no defaults)", () => {
  test("does NOT fill body defaults — absent fields stay absent so they inherit", () => {
    const cl = coverLetterInputSchema.parse({ body: { intro: "Hi" } });
    expect(cl.body).toEqual({ intro: "Hi" });
    expect(cl.body?.signoff).toBeUndefined();
    expect(cl.body?.paragraphs).toBeUndefined();
  });

  test("allows an addressee with no name", () => {
    const cl = coverLetterInputSchema.parse({ addressee: { institution: "Acme" } });
    expect(cl.addressee).toEqual({ institution: "Acme" });
  });

  test("strips unknown keys", () => {
    const cl = coverLetterInputSchema.parse({ body: { intro: "Hi" }, hacked: true } as unknown);
    expect((cl as Record<string, unknown>).hacked).toBeUndefined();
  });

  test("accepts an empty object", () => {
    expect(coverLetterInputSchema.parse({})).toEqual({});
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/api && bun test src/services/coverletter.test.ts`
Expected: FAIL — `coverLetterInputSchema` is not exported.

- [ ] **Step 3: Rewrite the schema module**

Replace the body of `packages/api/src/types/coverletter.ts` (keep the file header comment) with:

```typescript
import { z } from "zod";

/**
 * Cover letter schemas. A cover letter is a *partial* document: the base resume
 * may define a default letter and each child resume stores an override diff.
 * Fields therefore carry NO defaults — an absent field means "inherit from the
 * base", and a default value here would clobber the base during merge. Final
 * defaults (e.g. signoff "Sincerely") live in the Typst template's
 * `.at(key, default:)` calls. Author identity is never stored here: it is
 * derived from the resume's merged profile at render time. Body text is
 * rendered as literal data — never evaluated as markup.
 */

/** The letter recipient. Every field is optional (a base default has no name). */
export const addresseePartialSchema = z.object({
  name: z.string().optional(),
  institution: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  zip: z.string().optional(),
});
export type Addressee = z.infer<typeof addresseePartialSchema>;

/** The letter content. All optional, NO defaults — defaults live in the template. */
export const coverLetterBodyPartialSchema = z.object({
  intro: z.string().optional(),
  paragraphs: z.array(z.string()).optional(),
  closing: z.string().optional(),
  signoff: z.string().optional(),
});
export type CoverLetterBody = z.infer<typeof coverLetterBodyPartialSchema>;

/**
 * Stored cover letter shape — used for both the base default and the child
 * override diff. Unknown keys are stripped (no `.passthrough()`) so an API-key
 * client can only set the known recipient/body fields.
 */
export const coverLetterInputSchema = z.object({
  addressee: addresseePartialSchema.optional(),
  body: coverLetterBodyPartialSchema.optional(),
  /** Optional pre-formatted date string (e.g. "June 16, 2026"). Defaults to today. */
  date: z.string().optional(),
});
export type CoverLetter = z.infer<typeof coverLetterInputSchema>;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/api && bun test src/services/coverletter.test.ts`
Expected: the new schema block PASSES. (Other blocks in this file may still fail — they are fixed in Tasks 4 and 5. The `coverLetterInputSchema` block must pass.)

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/types/coverletter.ts packages/api/src/services/coverletter.test.ts
git commit -m "feat(api): partial no-defaults cover-letter schema for inheritance

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Shared deepMerge + mergeCoverLetter

**Files:**
- Modify: `packages/api/src/pipeline/merge.ts` (export `deepMerge`)
- Modify: `packages/api/src/services/coverletter.ts` (add `mergeCoverLetter`)
- Test: `packages/api/src/services/coverletter.test.ts` (add a new describe block)

**Interfaces:**
- Consumes: `deepMerge<T>(base: T, override: unknown): T` from `pipeline/merge.ts`; `CoverLetter` from Task 1.
- Produces: `mergeCoverLetter(base: CoverLetter, child: CoverLetter): CoverLetter` — deep-merges objects key-by-key, child wins; arrays and scalars replace wholesale.

- [ ] **Step 1: Write the failing test**

Append to `packages/api/src/services/coverletter.test.ts`:

```typescript
import { mergeCoverLetter } from "./coverletter.ts";

describe("mergeCoverLetter (base default + child diff)", () => {
  test("child overrides body.intro and addressee.institution, inherits the rest", () => {
    const base: CoverLetter = {
      addressee: { institution: "Default Co" },
      body: { paragraphs: ["std para"], signoff: "Best regards" },
    };
    const child: CoverLetter = {
      addressee: { name: "Dr. Jane Smith", institution: "Acme Corp" },
      body: { intro: "I am applying for the Backend role." },
    };
    const merged = mergeCoverLetter(base, child);
    expect(merged.addressee).toEqual({ name: "Dr. Jane Smith", institution: "Acme Corp" });
    expect(merged.body).toEqual({
      paragraphs: ["std para"],
      signoff: "Best regards",
      intro: "I am applying for the Backend role.",
    });
  });

  test("child paragraphs replace base paragraphs wholesale (arrays are not concatenated)", () => {
    const base: CoverLetter = { body: { paragraphs: ["a", "b"] } };
    const child: CoverLetter = { body: { paragraphs: ["c"] } };
    expect(mergeCoverLetter(base, child).body?.paragraphs).toEqual(["c"]);
  });

  test("empty base + child returns the child unchanged", () => {
    const child: CoverLetter = { body: { intro: "Hi" } };
    expect(mergeCoverLetter({}, child)).toEqual(child);
  });

  test("base only + empty child returns the base", () => {
    const base: CoverLetter = { body: { signoff: "Sincerely" } };
    expect(mergeCoverLetter(base, {})).toEqual(base);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/api && bun test src/services/coverletter.test.ts`
Expected: FAIL — `mergeCoverLetter` is not exported.

- [ ] **Step 3: Export `deepMerge`**

In `packages/api/src/pipeline/merge.ts`, change the `deepMerge` declaration from:

```typescript
/** Recursive deep merge: objects merge key-by-key, scalars/arrays replace. */
function deepMerge<T>(base: T, override: unknown): T {
```

to:

```typescript
/** Recursive deep merge: objects merge key-by-key, scalars/arrays replace. */
export function deepMerge<T>(base: T, override: unknown): T {
```

- [ ] **Step 4: Add `mergeCoverLetter`**

In `packages/api/src/services/coverletter.ts`, add to the imports:

```typescript
import { deepMerge, mergeResume } from "../pipeline/merge.ts";
```

(Replace the existing `import { mergeResume } from "../pipeline/merge.ts";` line.) Then add this exported function near the top of the file, after the imports:

```typescript
/**
 * Merge a base default cover letter with a child's override diff. Objects merge
 * key-by-key (child wins); arrays and scalars replace wholesale. Both sides are
 * partial — an absent field on the child inherits the base value.
 */
export function mergeCoverLetter(base: CoverLetter, child: CoverLetter): CoverLetter {
  return deepMerge(structuredClone(base), child);
}
```

Ensure `CoverLetter` is imported from `../types/coverletter.ts` (it already is — update the import name from `coverLetterSchema` if present; see Task 5).

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd packages/api && bun test src/services/coverletter.test.ts -t "mergeCoverLetter"`
Expected: the 4 `mergeCoverLetter` tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/pipeline/merge.ts packages/api/src/services/coverletter.ts packages/api/src/services/coverletter.test.ts
git commit -m "feat(api): mergeCoverLetter via shared deepMerge

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `bases.cover_letter` column + migration

**Files:**
- Modify: `packages/api/src/db/schema.ts`
- Modify: `packages/api/src/db/migrate.ts`

**Interfaces:**
- Produces: nullable JSON column `cover_letter` on `bases`, typed `CoverLetter` on `BaseRow`. `baseRepo.update(id, { coverLetter })` persists it (no repo change needed — `update` already spreads any `Partial<NewBaseRow>`).

- [ ] **Step 1: Add the column to the Drizzle schema**

In `packages/api/src/db/schema.ts`, inside the `bases` table definition, add a `coverLetter` column after the `data` column:

```typescript
  /** Full canonical KB document. */
  data: text("data", { mode: "json" }).$type<KB>().notNull(),
  /** Optional default cover letter inherited by child resumes (partial shape). */
  coverLetter: text("cover_letter", { mode: "json" }).$type<CoverLetter>(),
```

`CoverLetter` is already imported at the top of this file.

- [ ] **Step 2: Add the column to fresh-DB DDL**

In `packages/api/src/db/migrate.ts`, in the `CREATE TABLE IF NOT EXISTS bases (...)` block, add a `cover_letter` column after `data`:

```sql
      data          TEXT NOT NULL,
      cover_letter  TEXT,
      created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
```

- [ ] **Step 3: Add the idempotent upgrade path**

In `packages/api/src/db/migrate.ts`, directly after the existing `resumes.cover_letter` upgrade block (the one ending with `ALTER TABLE resumes ADD COLUMN cover_letter TEXT;`), add:

```typescript
  // Upgrade path: databases created before base cover letters lack bases.cover_letter.
  const baseCols = sqlite
    .query("PRAGMA table_info(bases)")
    .all() as Array<{ name: string }>;
  if (!baseCols.some((c) => c.name === "cover_letter")) {
    sqlite.exec("ALTER TABLE bases ADD COLUMN cover_letter TEXT;");
  }
```

- [ ] **Step 4: Verify typecheck passes**

Run: `cd packages/api && bun run typecheck`
Expected: PASS (no errors).

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/db/schema.ts packages/api/src/db/migrate.ts
git commit -m "feat(api): bases.cover_letter column + migration

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Default cover-letter.typ + registry fallback

**Files:**
- Create: `templates/typst-coverletter/cover-letter.typ`
- Modify: `packages/api/src/templates/registry.ts`
- Modify: `packages/api/src/templates/types.ts` (doc comments only)
- Test: `packages/api/src/services/coverletter.test.ts` (update the detection describe block)

**Interfaces:**
- Consumes: `config.templatesDir`.
- Produces: every renderable template now has `coverLetterSource` (own or default) and `hasCoverLetter === true`; `summaries().has_cover_letter === true` for all.

- [ ] **Step 1: Create the default cover letter template**

Create `templates/typst-coverletter/cover-letter.typ`:

```typst
// Default Cover Letter (APIMyResume)
// A self-contained cover letter adapting the modernpro-coverletter aesthetic
// (MIT, Jiaxin Peng — see ./LICENSE) to the API's generic cover-letter context.
// Used as the fallback for any resume template that does not ship its own
// cover-letter.typ. The author identity comes from the resume profile; the
// addressee + body come from the per-resume cover letter (merged base + child).
// Body text is injected as data and rendered literally — never evaluated as
// Typst markup.

#let ctx = json(bytes(sys.inputs.resume))

#let author = ctx.at("author", default: "")
#let location = ctx.at("location", default: "")
#let date = ctx.at("date", default: "")
#let contacts = ctx.at("contacts", default: ())
#let addressee = ctx.at("addressee", default: (:))
#let body = ctx.at("body", default: (:))

#let primary = rgb("#222222")
#let muted = rgb("#666666")

#set document(author: author, title: author)

#set text(
  font: "New Computer Modern",
  size: 11pt,
  fill: primary,
  lang: "en",
  ligatures: false,
)

#set page(
  paper: "us-letter",
  margin: (top: 2.2cm, bottom: 1.6cm, left: 1.9cm, right: 1.9cm),
)

#show link: set text(fill: rgb("#0645AD"))

// ===== Author header =====
#align(center)[
  #block(text(weight: 700, size: 1.9em, fill: primary)[#author])
]

#let fmt-contact(c) = {
  let value = c.at("value", default: "")
  let href = c.at("href", default: "")
  if value == "" { return none }
  if href != "" { link(href)[#value] } else { value }
}
#let contact-line = contacts.map(fmt-contact).filter(x => x != none)
#if contact-line.len() > 0 {
  v(0.4em)
  align(center, text(size: 0.9em, fill: muted)[#contact-line.join("  |  ")])
}
#if location != "" {
  align(center, text(size: 0.9em, fill: muted)[#smallcaps[#location]])
}

#v(0.6em)
#line(length: 100%, stroke: 0.4pt + primary)
#v(1em)

// ===== Date (right-aligned) =====
#if date != "" {
  align(right, text(fill: muted)[#date])
  v(0.6em)
}

// ===== Addressee block =====
#let addr-line(key) = addressee.at(key, default: "")
#let csz = {
  let city = addr-line("city")
  let state = addr-line("state")
  let zip = addr-line("zip")
  let left = if state != "" { (city, state).filter(x => x != "").join(", ") } else { city }
  (left, zip).filter(x => x != "").join(" ")
}
#pad(
  bottom: 1em,
  align(left)[
    #if addr-line("name") != "" [ #strong[#addr-line("name")] \ ]
    #if addr-line("institution") != "" [ #addr-line("institution") \ ]
    #if addr-line("address") != "" [ #addr-line("address") \ ]
    #if csz != "" [ #csz \ ]
    #if addr-line("country") != "" [ #addr-line("country") ]
  ],
)

// ===== Body =====
#set par(justify: true, leading: 0.65em, spacing: 0.9em)

#let greet-name = addr-line("name")
#if greet-name != "" [ Dear #greet-name, ] else [ Dear Hiring Manager, ]

#let intro = body.at("intro", default: "")
#if intro != "" {
  parbreak()
  intro
}

#for para in body.at("paragraphs", default: ()) {
  parbreak()
  para
}

#let closing = body.at("closing", default: "")
#if closing != "" {
  parbreak()
  closing
}

// ===== Signature =====
#let signoff = body.at("signoff", default: "Sincerely")
#v(1.2em)
#signoff, \
#strong[#author]
```

- [ ] **Step 2: Update the detection test**

In `packages/api/src/services/coverletter.test.ts`, replace the `describe("cover-letter template detection", ...)` block's `basic-resume` and summaries tests so they assert the fallback. Replace:

```typescript
  test("basic-resume has no cover-letter variant", () => {
    const tpl = templateRegistry.get("basic-resume");
    expect(tpl).toBeTruthy();
    expect(tpl!.hasCoverLetter).toBe(false);
    expect(tpl!.coverLetterSource).toBeUndefined();
  });

  test("template summaries expose has_cover_letter", () => {
    const summaries = templateRegistry.summaries();
    const cw = summaries.find((s) => s.id === "clickworthy-resume");
    const basic = summaries.find((s) => s.id === "basic-resume");
    expect(cw?.has_cover_letter).toBe(true);
    expect(basic?.has_cover_letter).toBe(false);
  });
```

with:

```typescript
  test("basic-resume falls back to the default cover letter", () => {
    const tpl = templateRegistry.get("basic-resume");
    expect(tpl).toBeTruthy();
    expect(tpl!.hasCoverLetter).toBe(true);
    expect(tpl!.coverLetterSource).toContain("sys.inputs.resume");
  });

  test("every renderable template reports has_cover_letter", () => {
    const summaries = templateRegistry.summaries();
    expect(summaries.length).toBeGreaterThan(0);
    for (const s of summaries) expect(s.has_cover_letter).toBe(true);
  });
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd packages/api && bun test src/services/coverletter.test.ts -t "cover-letter template detection"`
Expected: FAIL — `basic-resume` still reports `hasCoverLetter === false`.

- [ ] **Step 4: Wire the default fallback in the registry**

In `packages/api/src/templates/registry.ts`:

(a) Add a cached default field to the `TemplateRegistry` class (next to `private watcher`):

```typescript
  /** Shared default cover-letter source; undefined = unloaded, null = missing. */
  private defaultCoverLetter: string | null | undefined;
```

(b) In `load()`, reset the cache so hot-reload picks up edits. Add this line at the top of `load()`, right after `this.templates.clear();`:

```typescript
    this.defaultCoverLetter = undefined;
```

(c) Add a private loader method (e.g. after `checkVendoredPackages`):

```typescript
  /**
   * The shared default cover-letter.typ source, read once and cached. Templates
   * that do not ship their own cover-letter.typ fall back to this, so every
   * renderable template can produce a cover letter (spec: default cover letters).
   */
  private getDefaultCoverLetter(): string | undefined {
    if (this.defaultCoverLetter === undefined) {
      const p = path.join(config.templatesDir, "typst-coverletter", "cover-letter.typ");
      this.defaultCoverLetter = existsSync(p) ? readFileSync(p, "utf8") : null;
      if (this.defaultCoverLetter === null) {
        log.warn("Default cover-letter.typ not found — templates without their own letter cannot render one", { path: p });
      }
    }
    return this.defaultCoverLetter ?? undefined;
  }
```

(d) In `loadOne`, replace the cover-letter resolution block:

```typescript
      // Optional cover-letter variant: a self-contained cover-letter.typ that
      // reads the cover letter context from sys.inputs (spec: cover letters).
      const coverLetterPath = path.join(tplDir, "cover-letter.typ");
      const coverLetterSource = existsSync(coverLetterPath)
        ? readFileSync(coverLetterPath, "utf8")
        : undefined;
```

with:

```typescript
      // Cover-letter variant: a template's own cover-letter.typ, or the shared
      // default when it ships none, so every template can render a letter. Both
      // read the cover letter context from sys.inputs (spec: cover letters).
      const ownCoverLetterPath = path.join(tplDir, "cover-letter.typ");
      const coverLetterSource = existsSync(ownCoverLetterPath)
        ? readFileSync(ownCoverLetterPath, "utf8")
        : this.getDefaultCoverLetter();
```

The existing `coverLetterSource` and `hasCoverLetter: coverLetterSource !== undefined` lines in the `RegisteredTemplate` object stay as-is — `hasCoverLetter` is now true for every template once the default is present.

- [ ] **Step 5: Update the type doc comments**

In `packages/api/src/templates/types.ts`, update the `coverLetterSource` and `hasCoverLetter` doc comments on `RegisteredTemplate`:

```typescript
  /** Cover-letter.typ content: the template's own variant, or the shared default
   * when it ships none. Drives the cover letter endpoints. */
  coverLetterSource?: string;
  /** Whether this template can render a cover letter. True for every renderable
   * template once the shared default is loaded. */
  hasCoverLetter: boolean;
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd packages/api && bun test src/services/coverletter.test.ts -t "cover-letter template detection"`
Expected: PASS — `basic-resume` reports `hasCoverLetter === true` and `coverLetterSource` contains `sys.inputs.resume`; all summaries report `has_cover_letter === true`. The `clickworthy-resume` test still passes (keeps its own letter).

- [ ] **Step 7: Commit**

```bash
git add templates/typst-coverletter/cover-letter.typ packages/api/src/templates/registry.ts packages/api/src/templates/types.ts packages/api/src/services/coverletter.test.ts
git commit -m "feat(templates): default cover letter as registry fallback

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Inheritance in the child render path

**Files:**
- Modify: `packages/api/src/services/coverletter.ts`
- Test: `packages/api/src/services/coverletter.test.ts` (update `buildCoverLetterContext` tests to the new signature)

**Interfaces:**
- Consumes: `mergeCoverLetter` (Task 2), `coverLetterInputSchema`/`CoverLetter` (Task 1), `baseRepo`/`resumeRepo`.
- Produces: `buildCoverLetterContext(profile, company, coverLetter)` — `company: string | undefined`, tolerant of partial/undefined `addressee`/`body`. Child render/preview merge `base.coverLetter` with the child diff; render returns `404 cover_letter_not_found` only when **both** base and child letters are absent.

- [ ] **Step 1: Update the `buildCoverLetterContext` tests to the new signature**

In `packages/api/src/services/coverletter.test.ts`, in the `describe("buildCoverLetterContext", ...)` block, the fixture currently uses `const row = { company: "Acme Corp" } as ResumeRow;` and calls `buildCoverLetterContext(profile, row, letter)`. Change every call to pass the company string directly instead of the row, and delete the now-unused `row` fixture and the `ResumeRow` import. Concretely:

- Remove the line `import type { ResumeRow } from "../db/schema.ts";`
- Remove the line `const row = { company: "Acme Corp" } as ResumeRow;`
- Replace each `buildCoverLetterContext(profile, row, <x>)` with `buildCoverLetterContext(profile, "Acme Corp", <x>)`.

Then add two tests at the end of this block:

```typescript
  test("tolerates a partial letter with no addressee or body", () => {
    const ctx = buildCoverLetterContext(profile, "Acme Corp", {});
    expect(ctx.addressee.institution).toBe("Acme Corp");
    expect(ctx.body).toEqual({});
    expect(ctx.author).toBe("Jordan Michaels");
  });

  test("company undefined leaves institution empty when none supplied", () => {
    const ctx = buildCoverLetterContext(profile, undefined, {});
    expect(ctx.addressee.institution).toBe("");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/api && bun test src/services/coverletter.test.ts -t "buildCoverLetterContext"`
Expected: FAIL — `buildCoverLetterContext` still expects a `ResumeRow` and reads `row.company`.

- [ ] **Step 3: Rewrite the render/identity parts of the service**

In `packages/api/src/services/coverletter.ts`:

(a) Update the type imports to the partial schema:

```typescript
import { coverLetterInputSchema, type CoverLetter } from "../types/coverletter.ts";
```

(b) Delete the `requireCoverLetterTemplate` 422 path — every template now supports cover letters. Replace the whole `requireCoverLetterTemplate` function with:

```typescript
/** Resolve the resume's template. Every template can render a cover letter. */
function requireCoverLetterTemplate(row: ResumeRow): RegisteredTemplate {
  return templateRegistry.require(row.template);
}
```

(c) Change `setCoverLetter` and `previewCoverLetter` to validate with `coverLetterInputSchema` instead of `coverLetterSchema` (rename the symbol in both `parseOrThrow(...)` calls).

(d) Replace `renderStoredCoverLetter`, `previewCoverLetter`'s render call, and `renderFor` with base-merging versions:

```typescript
/** Render the effective (base default + stored child diff) cover letter. */
export async function renderStoredCoverLetter(
  id: string,
): Promise<{ pdf: Uint8Array; warnings: string[] }> {
  const row = requireResume(id);
  const template = requireCoverLetterTemplate(row);
  const base = baseRepo.get(row.baseId);
  if (!base) throw notFound(`Base resume '${row.baseId}' not found`, "base_not_found", "base_id");

  const childCL = (row.coverLetter as CoverLetter | null) ?? null;
  const baseCL = (base.coverLetter as CoverLetter | null) ?? null;
  // A child with no own letter still renders if its base defines one.
  if (!childCL && !baseCL) {
    throw notFound(`Resume '${id}' has no cover letter`, "cover_letter_not_found");
  }
  const effective = mergeCoverLetter(baseCL ?? {}, childCL ?? {});
  return renderWith(base, template, row.company ?? undefined, effective);
}

/** Render a supplied (unsaved) child diff merged over the base — live preview. */
export async function previewCoverLetter(
  id: string,
  rawBody: unknown,
): Promise<{ pdf: Uint8Array; warnings: string[] }> {
  const row = requireResume(id);
  const template = requireCoverLetterTemplate(row);
  const base = baseRepo.get(row.baseId);
  if (!base) throw notFound(`Base resume '${row.baseId}' not found`, "base_not_found", "base_id");

  const childCL = parseOrThrow(coverLetterInputSchema, rawBody ?? {});
  const effective = mergeCoverLetter((base.coverLetter as CoverLetter | null) ?? {}, childCL);
  return renderWith(base, template, row.company ?? undefined, effective);
}

/** Merge resume identity + an effective cover letter into a context and render. */
async function renderWith(
  base: BaseRow,
  template: RegisteredTemplate,
  company: string | undefined,
  coverLetter: CoverLetter,
): Promise<{ pdf: Uint8Array; warnings: string[] }> {
  const merged = mergeResume(base.data, {} as Overrides);
  const ctx = buildCoverLetterContext(merged.profile, company, coverLetter);
  return renderCoverLetterToPdf(template, JSON.stringify(ctx));
}
```

> Note: the author identity (profile) is base-owned and inherited verbatim by children (`mergeResume` always keeps the base profile), so merging with an empty override is sufficient and avoids re-reading the child's overrides here. Add `import type { BaseRow } from "../db/schema.ts";` if not already imported.

(e) Replace `buildCoverLetterContext` with the company-parameter, partial-tolerant version:

```typescript
export function buildCoverLetterContext(
  profile: MergedProfile,
  company: string | undefined,
  coverLetter: CoverLetter,
) {
  const contacts: Array<{ value: string; href: string }> = [];
  if (profile.email) contacts.push({ value: profile.email, href: `mailto:${profile.email}` });

  const links = profile.links ?? {};
  for (const key of ["github", "linkedin", "portfolio"]) {
    if (links[key]) contacts.push(linkContact(links[key]!));
  }
  for (const [key, value] of Object.entries(links)) {
    if (!["github", "linkedin", "portfolio"].includes(key) && value) contacts.push(linkContact(value));
  }

  const addressee = coverLetter.addressee ?? {};
  return {
    author: profile.name ?? "",
    location: profile.location ?? "",
    date: coverLetter.date ?? today(),
    contacts,
    addressee: {
      ...addressee,
      institution: addressee.institution ?? company ?? "",
    },
    body: coverLetter.body ?? {},
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd packages/api && bun test src/services/coverletter.test.ts`
Expected: ALL blocks PASS (detection, schema, mergeCoverLetter, buildCoverLetterContext).

- [ ] **Step 5: Verify typecheck**

Run: `cd packages/api && bun run typecheck`
Expected: PASS. (If `Overrides` is now unused or `setCoverLetter` references changed, fix imports until clean.)

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/services/coverletter.ts packages/api/src/services/coverletter.test.ts
git commit -m "feat(api): child cover letters inherit the base default at render

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Base cover-letter service functions

**Files:**
- Modify: `packages/api/src/services/coverletter.ts`
- Test: `packages/api/src/services/coverletter.test.ts` (add a small unit block for the preview context builder path that needs no DB)

**Interfaces:**
- Produces:
  - `getBaseCoverLetter(baseId: string): CoverLetter | null`
  - `setBaseCoverLetter(baseId: string, rawBody: unknown): CoverLetter`
  - `deleteBaseCoverLetter(baseId: string): void`
  - `previewBaseCoverLetter(baseId: string, rawBody: unknown): Promise<{ pdf: Uint8Array; warnings: string[] }>`

- [ ] **Step 1: Add the base cover-letter service functions**

In `packages/api/src/services/coverletter.ts`, append:

```typescript
// --- Base-level cover letter (the inherited default) -------------------------

/** Load the base row or throw a 404. */
function requireBase(baseId: string): BaseRow {
  const base = baseRepo.get(baseId);
  if (!base) throw notFound(`Base resume '${baseId}' not found`, "base_not_found");
  return base;
}

/** The base's default cover letter, or null. */
export function getBaseCoverLetter(baseId: string): CoverLetter | null {
  return (requireBase(baseId).coverLetter as CoverLetter | null) ?? null;
}

/** Validate and persist (replace) the base's default cover letter. */
export function setBaseCoverLetter(baseId: string, rawBody: unknown): CoverLetter {
  requireBase(baseId);
  const coverLetter = parseOrThrow(coverLetterInputSchema, rawBody ?? {});
  const updated = baseRepo.update(baseId, { coverLetter });
  log.info("Base cover letter saved", { baseId });
  return updated!.coverLetter as CoverLetter;
}

/** Remove the base's default cover letter. Children keep their own diffs. */
export function deleteBaseCoverLetter(baseId: string): void {
  requireBase(baseId);
  baseRepo.update(baseId, { coverLetter: null });
  log.info("Base cover letter deleted", { baseId });
}

/** Render the base default (merged with a supplied diff) using the base profile. */
export async function previewBaseCoverLetter(
  baseId: string,
  rawBody: unknown,
): Promise<{ pdf: Uint8Array; warnings: string[] }> {
  const base = requireBase(baseId);
  const template = templateRegistry.require(base.template);
  const override = parseOrThrow(coverLetterInputSchema, rawBody ?? {});
  const effective = mergeCoverLetter((base.coverLetter as CoverLetter | null) ?? {}, override);
  return renderWith(base, template, undefined, effective);
}
```

`baseRepo` is already imported at the top of the file (`import { baseRepo, resumeRepo } from "../db/repo.ts";`).

- [ ] **Step 2: Verify typecheck**

Run: `cd packages/api && bun run typecheck`
Expected: PASS.

- [ ] **Step 3: Run the full service test file**

Run: `cd packages/api && bun test src/services/coverletter.test.ts`
Expected: PASS (no regressions; the new functions are exercised end-to-end in Task 7's security test).

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/services/coverletter.ts
git commit -m "feat(api): base cover-letter service (get/set/delete/preview)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Base cover-letter routes, discovery doc, and security tests

**Files:**
- Modify: `packages/api/src/api/routes/bases.ts`
- Modify: `packages/api/src/services/schema.ts`
- Test: `packages/api/src/api/security.test.ts`

**Interfaces:**
- Consumes: the Task 6 service functions; `coverLetterDto` from `../dto.ts`; `notFound` from `../../lib/errors.ts`; `ownerOnly`, `readBody` (already imported in `bases.ts`).
- Produces: `GET/PUT/DELETE /api/v1/bases/:id/cover-letter` and `POST /api/v1/bases/:id/cover-letter/preview`. Writes are owner-only.

- [ ] **Step 1: Write the failing owner-only security tests**

In `packages/api/src/api/security.test.ts`, inside the `describe("API keys cannot mutate bases or rotate the master key (owner-only → 403)", ...)` block, add:

```typescript
  test("PUT /bases/:id/cover-letter → 403", async () => {
    expect(
      status(
        await withKey("/bases/anything/cover-letter", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ body: { intro: "x" } }),
        }),
      ),
    ).toBe(403);
  });

  test("DELETE /bases/:id/cover-letter → 403", async () => {
    expect(status(await withKey("/bases/anything/cover-letter", { method: "DELETE" }))).toBe(403);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd packages/api && bun test src/api/security.test.ts -t "cover-letter"`
Expected: FAIL — the routes don't exist yet, so an authenticated API key reaches a 404 (not 403) for these unmatched owner-only paths.

- [ ] **Step 3: Add the base cover-letter routes**

In `packages/api/src/api/routes/bases.ts`:

(a) Extend imports:

```typescript
import { baseDto, coverLetterDto } from "../dto.ts";
import { notFound } from "../../lib/errors.ts";
import {
  deleteBaseCoverLetter,
  getBaseCoverLetter,
  previewBaseCoverLetter,
  setBaseCoverLetter,
} from "../../services/coverletter.ts";
```

(b) Add the routes after the existing `bases.delete("/:id", ...)` route:

```typescript
// Base default cover letter (inherited by child resumes). Reads are auth'd like
// the rest of v1; writes are owner-only.
bases.get("/:id/cover-letter", (c) => {
  const id = c.req.param("id");
  const cl = getBaseCoverLetter(id);
  if (!cl) throw notFound(`Base '${id}' has no cover letter`, "cover_letter_not_found");
  return c.json(coverLetterDto(cl));
});

bases.put("/:id/cover-letter", ownerOnly, async (c) => {
  const cl = setBaseCoverLetter(c.req.param("id"), await readBody(c));
  return c.json(coverLetterDto(cl));
});

bases.delete("/:id/cover-letter", ownerOnly, async (c) => {
  deleteBaseCoverLetter(c.req.param("id"));
  return c.body(null, 204);
});

bases.post("/:id/cover-letter/preview", ownerOnly, async (c) => {
  const { pdf, warnings } = await previewBaseCoverLetter(c.req.param("id"), await readBody(c));
  c.header("Content-Type", "application/pdf");
  c.header("Cache-Control", "no-store");
  if (warnings.length) c.header("X-Render-Warnings", warnings.join("; "));
  return c.body(pdf.buffer as ArrayBuffer);
});
```

- [ ] **Step 4: Run to verify the security tests pass**

Run: `cd packages/api && bun test src/api/security.test.ts -t "cover-letter"`
Expected: PASS — both base cover-letter mutations return 403 for an API key.

- [ ] **Step 5: Update the AI discovery doc**

In `packages/api/src/services/schema.ts`:

(a) Update the resume cover-letter PUT summary (lines ~224–227) to drop the retired 422 clause and reflect inheritance + partial diff. Replace the `summary` and `body` strings of the `/api/v1/resumes/{id}/cover-letter` PUT entry with:

```typescript
      summary:
        "Set or replace this resume's cover letter (a partial override diff). You " +
        "supply only the recipient and the letter content you want to change — the " +
        "author identity comes from the resume's profile, and any field you omit is " +
        "inherited from the base resume's default cover letter. Every template can " +
        "render a cover letter.",
      auth: "X-API-Key",
      content_type: "application/json",
      body:
        "{ addressee?: { name?, institution?, address?, city?, state?, country?, zip? }, " +
        "body?: { intro?, paragraphs?: string[], closing?, signoff? }, date? }. All fields " +
        "optional; omitted fields inherit the base default. addressee.institution defaults " +
        "to the resume's company; date defaults to today.",
```

(b) Update the resume cover-letter `GET .../pdf` summary (line ~255) to:

```typescript
      summary:
        "Render the effective cover letter (base default merged with this resume's diff) " +
        "to a PDF (application/pdf). 404 only when neither the base nor the resume has one.",
```

- [ ] **Step 6: Run the full API test suite + typecheck**

Run: `cd packages/api && bun run typecheck && bun test`
Expected: PASS — full suite green.

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/api/routes/bases.ts packages/api/src/services/schema.ts packages/api/src/api/security.test.ts
git commit -m "feat(api): base cover-letter routes + discovery doc updates

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final Verification

- [ ] **Run the full API gate**

Run: `cd packages/api && bun run typecheck && bun test`
Expected: typecheck clean; all tests pass.

- [ ] **Manual smoke (optional, requires a running instance):**
  1. `PUT /api/v1/bases/:id/cover-letter` with `{ body: { paragraphs: ["Shared intro paragraph."], signoff: "Best regards" } }`.
  2. Create/choose a child resume on a non-clickworthy template (e.g. `basic-resume`).
  3. `PUT /api/v1/resumes/:childId/cover-letter` with `{ addressee: { name: "Dr. Smith", institution: "Acme" }, body: { intro: "I am applying…" } }`.
  4. `GET /api/v1/resumes/:childId/cover-letter/pdf` → a PDF that shows Dr. Smith/Acme + the custom intro, and inherits the base's shared paragraph + "Best regards".
  5. Delete the child letter; the PDF endpoint still renders using the base default alone.

---

## Self-Review Notes (addressed)

- **Spec §1 (default template):** Task 4 creates `templates/typst-coverletter/cover-letter.typ`.
- **Spec §2 (registry fallback / has_cover_letter for all):** Task 4 registry + summaries; tests assert it.
- **Spec §3 (partial schema, column, merge):** Tasks 1, 3, 2.
- **Spec §4 (render flow, 404 only when both absent, context refactor):** Task 5.
- **Spec §5 (base routes incl. preview, discovery doc):** Tasks 6, 7.
- **Spec §6 (tests):** Tasks 1–7 add unit + security tests; final gate runs the full suite.
- **Type consistency:** `mergeCoverLetter`, `buildCoverLetterContext(profile, company, coverLetter)`, `coverLetterInputSchema`/`CoverLetter`, and `renderWith` names are used identically across tasks.
