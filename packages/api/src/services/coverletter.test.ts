import { beforeAll, describe, expect, test } from "bun:test";
import { buildCoverLetterContext } from "./coverletter.ts";
import { templateRegistry } from "../templates/registry.ts";
import { coverLetterSchema, type CoverLetter } from "../types/coverletter.ts";
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
});

describe("coverLetterSchema", () => {
  test("applies body defaults (signoff, empty paragraphs)", () => {
    const cl = coverLetterSchema.parse({ addressee: { name: "Dr. Smith" }, body: {} });
    expect(cl.body.signoff).toBe("Sincerely");
    expect(cl.body.paragraphs).toEqual([]);
    expect(cl.body.intro).toBe("");
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
