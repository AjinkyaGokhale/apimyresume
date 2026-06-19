import { beforeAll, describe, expect, test } from "bun:test";
import { buildCoverLetterContext, mergeCoverLetter } from "./coverletter.ts";
import { templateRegistry } from "../templates/registry.ts";
import { coverLetterInputSchema, type CoverLetter } from "../types/coverletter.ts";
import type { ResumeRow } from "../db/schema.ts";

// Load the registry once so detection runs against the real shipped templates.
beforeAll(() => templateRegistry.load());

describe("cover-letter template detection", () => {
  test("clickworthy-resume ships a renderable cover-letter variant", () => {
    const tpl = templateRegistry.get("clickworthy-resume");
    expect(tpl).toBeTruthy();
    expect(tpl!.hasCoverLetter).toBe(true);
    expect(tpl!.coverLetterSource).toBeTruthy();
    // The cover-letter.typ reads the generic document-context input.
    expect(tpl!.coverLetterSource).toContain("sys.inputs.resume");
  });

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
});

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

describe("buildCoverLetterContext", () => {
  const profile = {
    name: "Jordan Michaels",
    location: "Austin, TX",
    email: "jordan@example.com",
    links: { github: "github.com/jordan", linkedin: "linkedin.com/in/jordan", site: "jordan.dev" },
  };
  const row = { company: "Acme Corp" } as ResumeRow;
  const letter: CoverLetter = {
    addressee: { name: "Dr. Jane Smith" },
    body: { intro: "Hello", paragraphs: ["p1"], closing: "Thanks", signoff: "Sincerely" },
  };

  test("derives author identity and contacts from the profile", () => {
    const ctx = buildCoverLetterContext(profile, row, letter);
    expect(ctx.author).toBe("Jordan Michaels");
    expect(ctx.location).toBe("Austin, TX");
    // email first (mailto), then known links, then catch-all links.
    expect(ctx.contacts[0]).toEqual({ value: "jordan@example.com", href: "mailto:jordan@example.com" });
    expect(ctx.contacts.map((c) => c.value)).toEqual([
      "jordan@example.com",
      "github.com/jordan",
      "linkedin.com/in/jordan",
      "jordan.dev",
    ]);
    // bare links get an https:// href.
    expect(ctx.contacts[1]!.href).toBe("https://github.com/jordan");
  });

  test("addressee.institution falls back to the resume company", () => {
    const ctx = buildCoverLetterContext(profile, row, letter);
    expect(ctx.addressee.institution).toBe("Acme Corp");
  });

  test("keeps an explicit addressee.institution over the company", () => {
    const withInst: CoverLetter = { ...letter, addressee: { name: "X", institution: "Globex" } };
    const ctx = buildCoverLetterContext(profile, row, withInst);
    expect(ctx.addressee.institution).toBe("Globex");
  });

  test("date defaults to a non-empty formatted string, or uses the supplied date", () => {
    expect(buildCoverLetterContext(profile, row, letter).date).toBeTruthy();
    const dated = buildCoverLetterContext(profile, row, { ...letter, date: "June 16, 2026" });
    expect(dated.date).toBe("June 16, 2026");
  });

  test("passes the letter body through unchanged", () => {
    const ctx = buildCoverLetterContext(profile, row, letter);
    expect(ctx.body).toEqual(letter.body);
  });
});

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
