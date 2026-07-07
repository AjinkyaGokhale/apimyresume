import { beforeAll, describe, expect, test } from "bun:test";
import { buildCoverLetterContext, mergeCoverLetter } from "./coverletter.ts";
import { templateRegistry } from "../templates/registry.ts";
import { coverLetterInputSchema, type CoverLetter } from "../types/coverletter.ts";

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

  test("the shared default is the DIN 5008 letter", () => {
    const tpl = templateRegistry.get("basic-resume");
    expect(tpl!.coverLetterSource).toContain("DIN 5008");
  });

  test("letter-template catalog lists every dir shipping a cover-letter.typ", () => {
    const ids = templateRegistry.letterTemplateSummaries().map((t) => t.id);
    expect(ids).toContain("din5008-coverletter");
    expect(ids).toContain("typst-coverletter");
    expect(ids).toContain("clickworthy-resume");
  });

  test("catalog marks din5008 as the default and puts it first", () => {
    const summaries = templateRegistry.letterTemplateSummaries();
    expect(summaries[0]!.id).toBe("din5008-coverletter");
    expect(summaries[0]!.default).toBe(true);
    expect(summaries.filter((t) => t.default)).toHaveLength(1);
  });

  test("catalog entries carry display names from config.json", () => {
    const din = templateRegistry.getLetterTemplate("din5008-coverletter");
    expect(din!.name).toBe("DIN 5008 Letter");
    expect(din!.source).toContain("sys.inputs.resume");
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

  test("accepts DIN 5008 fields: body.subject, body.enclosures, lang", () => {
    const cl = coverLetterInputSchema.parse({
      body: { subject: "Application for X", enclosures: ["Resume", "References"] },
      lang: "de",
    });
    expect(cl.body?.subject).toBe("Application for X");
    expect(cl.body?.enclosures).toEqual(["Resume", "References"]);
    expect(cl.lang).toBe("de");
  });

  test("rejects an unknown lang", () => {
    expect(() => coverLetterInputSchema.parse({ lang: "fr" })).toThrow();
  });

  test("does NOT default lang — absent stays absent so it inherits", () => {
    expect(coverLetterInputSchema.parse({}).lang).toBeUndefined();
  });

  test("accepts a letter-design choice via template", () => {
    const cl = coverLetterInputSchema.parse({ template: "typst-coverletter" });
    expect(cl.template).toBe("typst-coverletter");
    expect(coverLetterInputSchema.parse({}).template).toBeUndefined();
  });
});

describe("buildCoverLetterContext", () => {
  const profile = {
    name: "Jordan Michaels",
    location: "Austin, TX",
    email: "jordan@example.com",
    links: { github: "github.com/jordan", linkedin: "linkedin.com/in/jordan", site: "jordan.dev" },
  };
  const letter: CoverLetter = {
    addressee: { name: "Dr. Jane Smith" },
    body: { intro: "Hello", paragraphs: ["p1"], closing: "Thanks", signoff: "Sincerely" },
  };

  test("derives author identity and contacts from the profile", () => {
    const ctx = buildCoverLetterContext(profile, "Acme Corp", letter);
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
    const ctx = buildCoverLetterContext(profile, "Acme Corp", letter);
    expect(ctx.addressee.institution).toBe("Acme Corp");
  });

  test("keeps an explicit addressee.institution over the company", () => {
    const withInst: CoverLetter = { ...letter, addressee: { name: "X", institution: "Globex" } };
    const ctx = buildCoverLetterContext(profile, "Acme Corp", withInst);
    expect(ctx.addressee.institution).toBe("Globex");
  });

  test("date defaults to a non-empty formatted string, or uses the supplied date", () => {
    expect(buildCoverLetterContext(profile, "Acme Corp", letter).date).toBeTruthy();
    const dated = buildCoverLetterContext(profile, "Acme Corp", { ...letter, date: "June 16, 2026" });
    expect(dated.date).toBe("June 16, 2026");
  });

  test("passes the letter body through unchanged", () => {
    const ctx = buildCoverLetterContext(profile, "Acme Corp", letter);
    expect(ctx.body).toEqual(letter.body!);
  });

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

  test("exposes the profile phone as its own field (empty when absent)", () => {
    const ctx = buildCoverLetterContext({ ...profile, phone: "+49 170 1234567" }, undefined, {});
    expect(ctx.phone).toBe("+49 170 1234567");
    expect(buildCoverLetterContext(profile, undefined, {}).phone).toBe("");
  });

  test("lang passes through and defaults to en", () => {
    expect(buildCoverLetterContext(profile, undefined, {}).lang).toBe("en");
    expect(buildCoverLetterContext(profile, undefined, { lang: "de" }).lang).toBe("de");
  });

  test("default date is localized by lang", () => {
    const en = buildCoverLetterContext(profile, undefined, {}).date;
    const de = buildCoverLetterContext(profile, undefined, { lang: "de" }).date;
    // en-US: "July 7, 2026" — comma between day and year; de-DE: "7. Juli 2026".
    expect(en).toMatch(/^[A-Z][a-z]+ \d{1,2}, \d{4}$/);
    expect(de).toMatch(/^\d{1,2}\. [A-ZÄÖÜ][a-zä]+ \d{4}$/);
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

  test("a child inherits the base's letter design and can override it", () => {
    const base: CoverLetter = { template: "typst-coverletter" };
    expect(mergeCoverLetter(base, {}).template).toBe("typst-coverletter");
    expect(mergeCoverLetter(base, { template: "din5008-coverletter" }).template).toBe(
      "din5008-coverletter",
    );
  });
});
