import { describe, expect, test } from "bun:test";
import { normalizePayload } from "./normalize.ts";
import { mergeResume } from "./merge.ts";
import { createResumeSchema, overridesSchema } from "../types/overrides.ts";
import type { KB } from "../types/kb.ts";

const base: KB = {
  id: "base-andy",
  template: "basic-resume",
  template_lock: false,
  profile: {
    name: "Andy Gokhale",
    title: "Software Engineer",
    email: "hi@ajinkyagokhale.com",
    links: {},
  },
  experience: [
    {
      id: "nineti",
      company: "Nineti GmbH",
      role: "Founding Engineer",
      period: "2023 – present",
      bullets: ["Sole technical owner of two production IoT products", "Built AWS IoT Core fleet provisioning with mTLS"],
    },
    { id: "swapmails", company: "Swapmails", role: "Engineer", period: "2021–2023", bullets: ["x"] },
  ],
  education: [],
  skills: [],
};

describe("normalizer (spec §16)", () => {
  test("maps flat key_skills/bullets to canonical paths; identity fields are dropped", () => {
    const out = normalizePayload({
      base_id: "base-andy",
      title: "Backend Engineer",        // identity — inherited from base, not overridable
      about: "Experienced engineer...", // identity — inherited from base, not overridable
      key_skills: ["Kubernetes", "AWS"],
      new_bullets: [{ target: "experience.nineti", mode: "append", bullets: ["x"] }],
    });
    // profile is never produced as an override
    expect((out.overrides as any).profile).toBeUndefined();
    expect(out.overrides).toMatchObject({ keywords: ["Kubernetes", "AWS"] });
    expect((out.overrides as any).inject_bullets).toHaveLength(1);
  });

  test("splits comma-separated keywords", () => {
    const out = normalizePayload({ base_id: "base-andy", keywords: "Kubernetes, gRPC, Go" });
    expect((out.overrides as any).keywords).toEqual(["Kubernetes", "gRPC", "Go"]);
  });

  test("maps company/employer to meta.company", () => {
    const out = normalizePayload({ base_id: "base-andy", employer: "Google" });
    expect((out.meta as any).company).toBe("Google");
  });

  test("drops unknown fields, output validates against schema", () => {
    const out = normalizePayload({
      base_id: "base-andy",
      applicant_notes: "secret",
      internal_score: 99,
    });
    const parsed = createResumeSchema.parse(out);
    expect((parsed as any).applicant_notes).toBeUndefined();
    expect(parsed.base_id).toBe("base-andy");
  });

  test("passes canonical nested shape through", () => {
    const out = normalizePayload({
      base_id: "base-andy",
      template: "basic-resume",
      tags: ["google", "swe"],
      meta: { company: "Google", role: "SWE" },
      overrides: { keywords: ["Kubernetes", "Go"], inject_bullets: [] },
    });
    const parsed = createResumeSchema.parse(out);
    expect(parsed.meta.company).toBe("Google");
    expect(parsed.overrides.keywords).toEqual(["Kubernetes", "Go"]);
  });
});

describe("merge engine (spec §7)", () => {
  test("profile is inherited from base verbatim — overrides are ignored", () => {
    const merged = mergeResume(base, overridesSchema.parse({ profile: { title: "Senior Backend Engineer" } }));
    // The profile override is dropped; every field stays as the base defined it.
    expect(merged.profile.title).toBe("Software Engineer");
    expect(merged.profile.name).toBe("Andy Gokhale");
    expect(merged.profile.email).toBe("hi@ajinkyagokhale.com");
  });

  test("profile preserved even when other sections are overridden", () => {
    const merged = mergeResume(base, overridesSchema.parse({ keywords: ["x"] }));
    expect(merged.profile.email).toBe("hi@ajinkyagokhale.com");
    expect(merged.profile.title).toBe("Software Engineer");
  });

  test("inject_bullets append adds at end, preserves originals", () => {
    const merged = mergeResume(base, overridesSchema.parse({ inject_bullets: [{ target: "experience.nineti", mode: "append", bullets: ["Reduced fleet OTA update time by 40%"] }] }));
    const nineti = merged.experience.find((e) => e.id === "nineti")!;
    expect(nineti.bullets).toHaveLength(3);
    expect(nineti.bullets[2]).toBe("Reduced fleet OTA update time by 40%");
    expect(nineti.bullets[0]).toBe("Sole technical owner of two production IoT products");
  });

  test("inject_bullets prepend adds at start", () => {
    const merged = mergeResume(base, overridesSchema.parse({ inject_bullets: [{ target: "experience.nineti", mode: "prepend", bullets: ["NEW"] }] }));
    expect(merged.experience.find((e) => e.id === "nineti")!.bullets[0]).toBe("NEW");
  });

  test("inject_bullets replace substitutes all bullets", () => {
    const merged = mergeResume(base, overridesSchema.parse({ inject_bullets: [{ target: "experience.nineti", mode: "replace", bullets: ["ONLY"] }] }));
    expect(merged.experience.find((e) => e.id === "nineti")!.bullets).toEqual(["ONLY"]);
  });

  test("targets by id regardless of array position", () => {
    const reordered: KB = { ...base, experience: [base.experience[1]!, base.experience[0]!] };
    const merged = mergeResume(reordered, overridesSchema.parse({ inject_bullets: [{ target: "experience.nineti", mode: "append", bullets: ["Z"] }] }));
    expect(merged.experience.find((e) => e.id === "nineti")!.bullets).toContain("Z");
  });

  test("keywords surface as a separate top-level array", () => {
    const merged = mergeResume(base, overridesSchema.parse({ keywords: ["Kubernetes", "gRPC"] }));
    expect(merged.keywords).toEqual(["Kubernetes", "gRPC"]);
  });

  test("base is never mutated", () => {
    const before = structuredClone(base);
    mergeResume(base, overridesSchema.parse({ inject_bullets: [{ target: "experience.nineti", mode: "append", bullets: ["x"] }] }));
    expect(base).toEqual(before);
  });
});

describe("section_order is base-owned, not child-overridable", () => {
  const orderedBase: KB = { ...base, section_order: ["skills", "experience", "education"] };

  test("child section_order is stripped by the schema and ignored", () => {
    const overrides = overridesSchema.parse({ section_order: ["experience", "education"] });
    // The schema drops the field entirely — children cannot send it.
    expect((overrides as Record<string, unknown>).section_order).toBeUndefined();
    const merged = mergeResume(orderedBase, overrides);
    // The base's order wins, untouched by the child's attempt to reorder.
    expect(merged.section_order).toEqual(["skills", "experience", "education"]);
  });

  test("base order flows through unchanged when child supplies none", () => {
    const merged = mergeResume(orderedBase, overridesSchema.parse({}));
    expect(merged.section_order).toEqual(["skills", "experience", "education"]);
  });

  test("absent when the base sets none", () => {
    const merged = mergeResume(base, overridesSchema.parse({}));
    expect(merged.section_order).toBeUndefined();
  });
});
