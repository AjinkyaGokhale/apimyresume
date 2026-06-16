import { beforeAll, describe, expect, test } from "bun:test";
import { buildPreviewDoc } from "./preview.ts";
import { mapContext } from "../mapper/index.ts";
import { templateRegistry } from "../templates/registry.ts";

// The registry scans the templates directory lazily on load(); do it once so
// the mapping assertion runs against the real shipped basic-resume map.json.
beforeAll(() => templateRegistry.load());

/**
 * Regression: the base-create live preview (full-document path) used to hand-build
 * its render doc from a fixed field whitelist that omitted `custom`, so custom
 * sections never reached the mapper and silently vanished from the preview.
 */
describe("buildPreviewDoc", () => {
  const doc = {
    id: "repro",
    template: "basic-resume",
    profile: { name: "Max Muster", title: "Software Engineer", email: "max@example.com" },
    experience: [{ id: "e1", role: "Engineer", company: "ACME", period: "2023", bullets: ["Did things"] }],
    custom: [
      { id: "publications", title: "Publications", after: "experience", bullets: ["A paper", "Another"] },
      { id: "volunteering", title: "Volunteering", bullets: ["Mentor at CoderDojo"] },
    ],
  };

  test("carries custom sections through to the merged doc", () => {
    const merged = buildPreviewDoc(doc, "basic-resume");
    expect(merged.custom).toHaveLength(2);
    expect(merged.custom?.[0]).toMatchObject({ title: "Publications", after: "experience" });
  });

  test("custom sections survive into the template context", () => {
    const merged = buildPreviewDoc(doc, "basic-resume");
    const template = templateRegistry.get("basic-resume");
    expect(template).toBeTruthy();
    const ctx = mapContext(merged, template!.map) as Record<string, { data: unknown[] }>;
    expect(ctx.custom?.data).toHaveLength(2);
  });
});
