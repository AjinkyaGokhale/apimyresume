import { describe, expect, test } from "bun:test";
import { mapContext, serializeContext, type MergedDoc } from "./index.ts";
import type { TemplateMap } from "../templates/types.ts";

function doc(partial: Partial<MergedDoc> = {}): MergedDoc {
  return {
    id: "base-andy",
    template: "basic-resume",
    template_lock: false,
    profile: { name: "Andy Gokhale", title: "Software Engineer", email: "a@b.c", links: {} },
    experience: [],
    education: [],
    skills: [],
    ...partial,
  };
}

const map = (sections: TemplateMap["sections"], layout?: Partial<TemplateMap["layout"]>): TemplateMap => ({
  template: "basic-resume",
  sections,
  layout: { type: layout?.type ?? "single_column", order: layout?.order ?? [] },
});

describe("field mapper", () => {
  test("produces { label, data } per section (spec §5)", () => {
    const d = doc({
      experience: [
        { id: "nineti", company: "Nineti", role: "Eng", period: "2023–", bullets: ["a", "b", "c", "d"] },
      ],
    });
    const ctx = mapContext(d, map([{ id: "experience", source: "experience", label: "Experience", featured_first: false, required: false }]));
    const exp = ctx.experience as { label: string; data: unknown[] };
    expect(exp.label).toBe("Experience");
    expect(Array.isArray(exp.data)).toBe(true);
    expect((exp.data[0] as { bullets: string[] }).bullets).toHaveLength(4);
  });

  test("optional section skipped when show_if is false", () => {
    const ctx = mapContext(doc(), map([{ id: "certifications", source: "certifications", label: "Certs", show_if: "certifications.length > 0", featured_first: false, required: false }]));
    expect(ctx.certifications).toBeUndefined();
  });

  test("optional section included when show_if is true", () => {
    const d = doc({ certifications: [{ name: "AWS" }, { name: "CKA" }] });
    const ctx = mapContext(d, map([{ id: "certifications", source: "certifications", label: "Certs", show_if: "certifications.length > 0", featured_first: false, required: false }]));
    expect((ctx.certifications as { data: unknown[] }).data).toHaveLength(2);
  });

  test("max_items limits array length", () => {
    const d = doc({ projects: Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, description: "x" })) });
    const ctx = mapContext(d, map([{ id: "projects", source: "projects", label: "Projects", max_items: 3, featured_first: false, required: false }]));
    expect((ctx.projects as { data: unknown[] }).data).toHaveLength(3);
  });

  test("featured_first orders skill categories", () => {
    const d = doc({
      skills: [
        { category: "Firmware", items: [] },
        { category: "Cloud & Infra", items: [], featured: true },
        { category: "Frontend", items: [] },
      ],
    });
    const ctx = mapContext(d, map([{ id: "skills", source: "skills", label: "Skills", featured_first: true, required: false }]));
    expect((ctx.skills as { data: { category: string }[] }).data[0]!.category).toBe("Cloud & Infra");
  });

  test("layout hints exposed as __layout", () => {
    const ctx = mapContext(doc(), map([], { type: "two_column" }));
    expect(ctx.__layout.type).toBe("two_column");
  });

  test("keywords surfaced as a separate array", () => {
    const ctx = mapContext(doc({ keywords: ["Go", "K8s"] }), map([]));
    expect(ctx.keywords).toEqual(["Go", "K8s"]);
  });

  test("unknown KB fields not in map are ignored", () => {
    const ctx = mapContext(doc({ awards: [{ name: "X" }, { name: "Y" }] }), map([{ id: "experience", source: "experience", label: "Exp", featured_first: false, required: false }]));
    expect((ctx as Record<string, unknown>).awards).toBeUndefined();
  });

  test("context is JSON round-trippable (spec §5)", () => {
    const d = doc({ experience: [{ id: "n", company: "N", role: "E", period: "x", bullets: ["b"] }] });
    const ctx = mapContext(d, map([{ id: "experience", source: "experience", label: "Exp", featured_first: false, required: false }]));
    const round = JSON.parse(serializeContext(ctx));
    expect(round).toEqual(ctx);
  });
});
