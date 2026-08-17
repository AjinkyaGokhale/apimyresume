import { describe, expect, test } from "bun:test";
import {
  customSectionSchema,
  experienceListSchema,
  experienceRoles,
  experienceSchema,
  findBulletTarget,
  type Experience,
} from "./kb.ts";

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

/** A progression: three roles held at one company, each with its own bullets. */
const progression = {
  id: "globex",
  company: "Globex GmbH",
  location: "Berlin, Germany",
  roles: [
    { id: "globex-senior", role: "Senior Software Engineer", period: "Apr 2025 – Present", bullets: ["Ingestion backend"] },
    { id: "globex-engineer", role: "Software Engineer", period: "Oct 2024 – Mar 2025", bullets: ["IoT pipeline"] },
    { id: "globex-intern", role: "Engineering Intern", period: "Feb 2024 – Sep 2024", bullets: ["Device firmware"] },
  ],
};

const flat = {
  id: "acme",
  company: "Acme Corp",
  role: "Backend Engineer",
  period: "Jan 2023 – Dec 2023",
  bullets: ["Scaled Go services"],
};

describe("experienceSchema", () => {
  test("keeps nested roles, each with its own id, period and bullets", () => {
    const parsed = experienceSchema.parse(progression);

    expect(parsed.roles).toHaveLength(3);
    expect(parsed.roles?.[0]).toMatchObject({
      id: "globex-senior",
      role: "Senior Software Engineer",
      period: "Apr 2025 – Present",
    });
    expect(parsed.roles?.[2]?.bullets).toEqual(["Device firmware"]);
  });

  test("still validates a flat entry with role and period on the entry itself", () => {
    const parsed = experienceSchema.parse(flat);

    expect(parsed.roles).toBeUndefined();
    expect(parsed).toMatchObject({ role: "Backend Engineer", period: "Jan 2023 – Dec 2023" });
  });

  test("rejects an entry with neither a role/period pair nor nested roles", () => {
    expect(() => experienceSchema.parse({ id: "x", company: "Acme" })).toThrow();
    // A half-filled flat entry is still rejected — `period` alone is not enough.
    expect(() => experienceSchema.parse({ id: "x", company: "Acme", period: "2023" })).toThrow();
  });
});

describe("experienceListSchema id uniqueness", () => {
  test("accepts entry ids and nested role ids that are all distinct", () => {
    expect(experienceListSchema.parse([progression, flat])).toHaveLength(2);
  });

  test("rejects a role id that collides with another entry's id", () => {
    const collides = { ...flat, id: "globex-intern" };
    expect(() => experienceListSchema.parse([progression, collides])).toThrow();
  });

  test("rejects two roles sharing an id inside one entry", () => {
    const dupes = {
      ...progression,
      roles: [progression.roles[0]!, { ...progression.roles[1]!, id: "globex-senior" }],
    };
    expect(() => experienceListSchema.parse([dupes])).toThrow();
  });
});

describe("experienceRoles", () => {
  test("returns the nested roles of a progression entry", () => {
    const roles = experienceRoles(experienceSchema.parse(progression) as Experience);
    expect(roles.map((r) => r.id)).toEqual(["globex-senior", "globex-engineer", "globex-intern"]);
  });

  test("wraps a flat entry as a single role carrying the entry's own id", () => {
    const roles = experienceRoles(experienceSchema.parse(flat) as Experience);
    expect(roles).toHaveLength(1);
    expect(roles[0]).toMatchObject({
      id: "acme",
      role: "Backend Engineer",
      period: "Jan 2023 – Dec 2023",
      bullets: ["Scaled Go services"],
    });
  });
});

describe("findBulletTarget", () => {
  const list = experienceListSchema.parse([progression, flat]);

  test("resolves a nested role id to that role", () => {
    expect(findBulletTarget(list, "globex-engineer")?.bullets).toEqual(["IoT pipeline"]);
  });

  test("resolves a flat entry id to the entry", () => {
    expect(findBulletTarget(list, "acme")?.bullets).toEqual(["Scaled Go services"]);
  });

  test("returns undefined for a progression entry's own id — it owns no bullets", () => {
    expect(findBulletTarget(list, "globex")).toBeUndefined();
  });

  test("returns a live reference, so mutating bullets updates the list", () => {
    const owner = findBulletTarget(list, "globex-intern")!;
    owner.bullets = ["Rewritten"];
    expect(list[0]?.roles?.[2]?.bullets).toEqual(["Rewritten"]);
  });
});
