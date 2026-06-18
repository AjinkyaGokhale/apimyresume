import { describe, expect, test } from "bun:test";
import { customSectionSchema } from "./kb.ts";

describe("customSectionSchema", () => {
  test("keeps nested entries with their own title, subtitle, link and bullets", () => {
    const parsed = customSectionSchema.parse({
      id: "oss",
      title: "Open Source Contributions",
      entries: [
        {
          title: "OpenMetrics",
          subtitle: "Core Maintainer",
          period: "Oct 2021 – Present",
          link: "https://github.com/alex/openmetrics",
          bullets: ["Reviewed 200+ PRs, mentored 5 contributors"],
        },
        { title: "Fastify", subtitle: "Contributor", bullets: ["Added HTTP/2 support"] },
      ],
    });

    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries?.[0]).toMatchObject({
      title: "OpenMetrics",
      subtitle: "Core Maintainer",
      period: "Oct 2021 – Present",
      link: "https://github.com/alex/openmetrics",
    });
    expect(parsed.entries?.[1]?.bullets).toEqual(["Added HTTP/2 support"]);
  });

  test("still validates a legacy single-entry section with no entries", () => {
    const parsed = customSectionSchema.parse({
      id: "publications",
      title: "Publications",
      bullets: ["A paper"],
    });

    expect(parsed.entries).toBeUndefined();
    expect(parsed.bullets).toEqual(["A paper"]);
  });
});
