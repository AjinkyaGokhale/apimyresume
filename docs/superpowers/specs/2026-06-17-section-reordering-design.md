# Per-resume section reordering

**Date:** 2026-06-17
**Status:** Approved (design)

## Problem

Each resume template renders its content sections (education, experience,
projects, skills, …) in a fixed sequence. There is no way for an end user to
change the order of sections for a given resume, and the order cannot be varied
per resume from the same base/template.

Today every template's `map.json` carries a `layout.order` array and the mapper
surfaces it to Typst as `ctx.__layout.order`, but **none of the templates
actually consume it** — each `resume.typ` hardcodes the section sequence inline.
So even the static order is effectively dead data.

## Goal

Let an end user reorder the content sections of a resume, per resume, via an
override field. The same mechanism must work uniformly across all templates
(`basic-resume`, `NNJR`, `clickworthy-resume`).

## Decisions

- **Who/when:** End user, per resume, dynamic (stored as an override diff).
- **Encoding:** An ordered list `section_order: [<id>, ...]`, not a per-section
  integer. Mirrors the existing `layout.order`, cannot express duplicate or
  conflicting positions, and is the cleanest thing to hand-edit in the YAML
  override editor.
- **Header:** Pinned at the top of every template. Only content sections
  reorder.

## Design

### Part 1 — Enabling refactor: data-driven order in templates

Rewrite the "Sections" block of all three `resume.typ` files so order is driven
by `ctx.__layout.order` instead of being hardcoded. The visual rendering of each
section is unchanged; only the sequencing mechanism changes.

For each template:

1. Wrap the existing inline section logic in per-section render functions
   (`render-education`, `render-experience`, `render-projects`, …). Each one
   reproduces exactly what that section renders today.
2. Render the header (pinned), then `customs-after("top")`.
3. Loop over `ctx.__layout.order`:
   - Skip `header` (already rendered, pinned).
   - Dispatch the id to its render function **only if that key exists in `ctx`**,
     so `show_if`-omitted sections still drop out (the mapper omits absent
     sections from `ctx`, as it does today).
   - Call `customs-after(id)` after the section so custom-section `after`
     anchors keep working.
4. Finish with `customs-after("end")`.

Custom sections continue to use their existing `after` key (`"top"`, a section
id, or `"end"`); because the `after` anchors reference section ids that still
appear in the order, placement is preserved under reordering.

Sections present in `map.sections` but with no render function (none today) are
simply skipped by the dispatch — the loop only renders ids it knows.

### Part 2 — The override

**Schema** (`packages/api/src/types/overrides.ts`)
Add a directive-style field to `overridesSchema`:

```ts
section_order: z.array(z.string()).optional(),
```

It is non-structural (cannot inject content), so it sits with the tailoring
directives (`keywords`, `inject_bullets`, `skills_highlight`) rather than the
content section keys.

**Merge** (`packages/api/src/pipeline/merge.ts`)
- Add `"section_order"` to `DIRECTIVE_KEYS` so it is not deep-merged as content.
- Surface it onto `MergedDoc` the same way `keywords` is:
  `if (overrides.section_order?.length) merged.section_order = overrides.section_order;`
- Extend the `MergedDoc` type (`mapper/index.ts`) with
  `section_order?: string[]`.

**Mapper** (`packages/api/src/mapper/index.ts`)
Compute the effective order in `mapContext`, reconciling the override against the
template's `map.layout.order`:

1. Start the result with `header` if it is in the template order (pinned first).
2. Append the override ids that exist in the template order, in the user's
   order, skipping `header` and any duplicates.
3. Append any remaining template-order ids the override did not mention, in
   their template order (so nothing silently disappears).
4. Ignore ids not present in the template order.

Set `ctx.__layout.order` to this reconciled array. When `doc.section_order` is
absent, the result equals `map.layout.order` unchanged.

**Dashboard**
No new UI. `section_order` is an override field edited through the existing YAML
override editor and flows through unchanged. Add it to override
documentation/examples where the other directives are described.

## Behavior

- No `section_order` → template default order (unchanged behavior).
- Partial list, e.g. `[skills, experience]` → those move to the front in that
  order; all other sections keep template order behind them.
- Unknown / empty ids → ignored; never a render failure.
- `header` in the list → ignored for positioning; header stays pinned at top.

## Testing

- **Mapper unit tests** (`mapper.test.ts`): full reorder, partial reorder,
  unknown id ignored, header always first, omitted sections appended in template
  order, absent `section_order` equals default.
- **Merge test** (`pipeline.test.ts`): `section_order` surfaces on `MergedDoc`
  and is not merged as a structural/content key.
- **Render smoke per template**: a reordered `section_order` yields sections in
  the requested sequence, and the default (no override) is unchanged.

## Out of scope

- Per-section integer positions.
- Repositioning the header.
- Drag-and-drop reordering UI in the dashboard.
- Author-time default reordering beyond what `map.layout.order` already allows.
