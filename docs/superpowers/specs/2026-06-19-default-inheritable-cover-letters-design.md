# Default + Inheritable Cover Letters — Design

**Date:** 2026-06-19
**Status:** Approved (design)
**Scope:** `packages/api`, `templates/typst-coverletter`

## Problem

Cover letters today are a sub-resource of a **child** resume only
(`resumes.cover_letter`), and they render only when the resume's template ships
its own `cover-letter.typ`. Only `clickworthy-resume` does, so every other
template (`basic-resume`, `NNJR`, `simple-technical-resume-template`) returns
`422 cover_letter_unsupported`. There is also no way to define a reusable
default letter on a **base** resume that children inherit and lightly tailor.

This work delivers three things:

1. Adapt the upstream `templates/typst-coverletter` (modernpro) design into the
   API's existing cover-letter contract.
2. Make it the **default fallback** so every template supports cover letters.
3. Add a **base-level cover letter** that children inherit via field-level deep
   merge, customising only the body and company (addressee) details over the API.

## Existing contract (unchanged)

A cover-letter `.typ` reads a JSON context from `sys.inputs.resume`:

```
{
  author:   string,
  location: string,
  date:     string,
  contacts: [{ value, href }],
  addressee:{ name, institution, address, city, state, country, zip },
  body:     { intro, paragraphs[], closing, signoff }
}
```

Author identity is derived from the resume's merged profile at render time;
addressee + body come from the stored cover letter. Body text is injected as
data and rendered literally — never evaluated as Typst markup. This contract
does **not** change.

## 1. Default cover letter template

**File:** `templates/typst-coverletter/cover-letter.typ`

A self-contained `.typ` adapting the `modernpro-coverletter` aesthetic (header
treatment, accent styling) to the contract above. It reads the same
`sys.inputs.resume` context the clickworthy letter uses and relies on Typst
`.at(key, default:)` for all field defaults (e.g. `signoff` → `"Sincerely"`,
empty addressee `name` → generic "Dear Hiring Manager," greeting). No new
context fields are introduced.

## 2. Registry fallback → all templates support cover letters

In `packages/api/src/templates/registry.ts`:

- Load `templates/typst-coverletter/cover-letter.typ` once at module/registry
  init as `DEFAULT_COVER_LETTER` (read from `config.templatesDir`).
- Per template during `loadOne`:
  - `coverLetterSource = <own cover-letter.typ> ?? DEFAULT_COVER_LETTER`
  - `hasCoverLetter = true` (for renderable templates)

Consequences:

- `clickworthy-resume` keeps its own letter; all others use the default.
- `requireCoverLetterTemplate` (in `services/coverletter.ts`) never rejects.
- `summaries().has_cover_letter` is `true` for all templates.

`RegisteredTemplate.hasCoverLetter` semantics shift from "ships its own letter"
to "can render a letter" — update the field doc comment in `templates/types.ts`.

## 3. Base-level cover letter + inheritance

### Schema (`packages/api/src/types/coverletter.ts`)

Add a **partial** cover-letter shape used for both base default and child diff:

- `addresseePartialSchema` — every field optional, including `name`.
- `coverLetterBodyPartialSchema` — `intro?`, `paragraphs?`, `closing?`,
  `signoff?`, **no `.default(...)`**. (Defaults must not be filled in at parse
  time; an absent field means "inherit," and an empty default would clobber the
  base value during merge. Final defaults live in the Typst template.)
- `coverLetterInputSchema = { addressee?: partial, body?: partial, date? }` —
  no required fields. Unknown keys stripped (no `.passthrough()`), matching the
  security posture of `overridesSchema`.

The existing `coverLetterSchema` (with required `addressee.name` and body
defaults) is retired from the storage/validation path in favour of
`coverLetterInputSchema`. `CoverLetter` type becomes the inferred partial shape.

### Storage

- New nullable JSON column `cover_letter` on `bases` (Drizzle `schema.ts` +
  idempotent `ALTER TABLE bases ADD COLUMN cover_letter TEXT` upgrade path in
  `db/migrate.ts`, mirroring the existing `resumes.cover_letter` upgrade).
- `resumes.cover_letter` is now interpreted as an **override diff** (partial),
  validated with `coverLetterInputSchema`.

### Merge

`mergeCoverLetter(base, child)` in `services/coverletter.ts`:

- Deep-merge `base ?? {}` and `child ?? {}`; child wins per field; arrays
  replace wholesale (same semantics as `mergeResume`'s `deepMerge`). Factor the
  generic `deepMerge` so both call sites share it, or inline an equivalent.

Result: a child can store just `addressee.institution` (+ other company
details) and `body.intro`, inheriting `body.paragraphs`/`signoff` from the base.

## 4. Render flow (`services/coverletter.ts`)

- `requireResume(id)` → load child row, then its base.
- `effective = mergeCoverLetter(base.coverLetter, child.coverLetter)`.
- Return `404 cover_letter_not_found` only when **both** base and child letters
  are absent. (A child with no own letter still renders if the base defines one.)
- Refactor `buildCoverLetterContext` to take `(profile, company, coverLetter)`
  instead of `(profile, row, coverLetter)`, and tolerate partial/undefined
  `addressee`/`body`. `addressee.institution` still falls back to the supplied
  `company` (the resume's `company` for child renders; absent for base preview).

## 5. API surface

New base routes in `api/routes/bases.ts` (writes are `ownerOnly`):

- `GET /api/v1/bases/:id/cover-letter` — stored base default (404 if none).
- `PUT /api/v1/bases/:id/cover-letter` — set/replace (`ownerOnly`).
- `DELETE /api/v1/bases/:id/cover-letter` (`ownerOnly`).
- `POST /api/v1/bases/:id/cover-letter/preview` — render the base default using
  the base's own profile (dashboard preview path).

Service functions: `getBaseCoverLetter`, `setBaseCoverLetter`,
`deleteBaseCoverLetter`, `previewBaseCoverLetter` (in `services/coverletter.ts`
or `services/base.ts` — colocate with the existing cover-letter service).

Existing child routes under `/resumes/:id/cover-letter`
(GET/PUT/DELETE/pdf/preview) keep their paths. PUT now accepts a partial diff;
render merges base + child.

`coverLetterDto` passes the (now partial) stored object through; confirm it does
not assume required fields.

## 6. Tests & verification

Extend `services/coverletter.test.ts`:

- A non-clickworthy template (e.g. `basic-resume`) now reports `hasCoverLetter`
  and renders a letter (no `422`).
- Base→child field-level merge: child overrides `body.intro` +
  `addressee.institution`, inherits `body.paragraphs`/`signoff` from base.
- Child with no own letter inherits the base letter.
- Both absent → `404 cover_letter_not_found`.
- Base cover-letter set/get/delete round-trip.

Verify (in `packages/api`): `bun run typecheck` and `bun test`. Run only the API
package per AGENTS.md.

## Out of scope (YAGNI)

- Dashboard UI for editing the base cover letter.
- Cascade re-render of cover letters when a base letter changes.
- Multiple named cover letters per base.
