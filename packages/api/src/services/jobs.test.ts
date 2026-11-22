import { describe, expect, test } from "bun:test";
import { computeJobMetrics, parseJobQuery, periodKey, type MetricJob } from "./jobs.ts";

const job = (id: string, status: string, appliedAt: string | null, extra: Partial<MetricJob> = {}): MetricJob => ({
  id,
  status,
  appliedAt,
  company: "Acme",
  location: null,
  workMode: null,
  source: null,
  ...extra,
});

describe("computeJobMetrics", () => {
  const now = new Date("2026-10-24T12:00:00Z");

  test("funnel counts stages a job passed through, not just its current status", () => {
    const m = computeJobMetrics(
      [job("a", "rejected", "2026-10-01"), job("b", "applied", "2026-10-20"), job("c", "saved", null)],
      [
        { jobId: "a", toStatus: "applied", createdAt: "2026-10-01T09:00:00Z" },
        { jobId: "a", toStatus: "interviewing", createdAt: "2026-10-11T09:00:00Z" },
        { jobId: "a", toStatus: "rejected", createdAt: "2026-10-15T09:00:00Z" },
      ],
      now,
    );
    expect(m.total).toBe(3);
    expect(m.applied_total).toBe(2);
    expect(m.funnel).toEqual({ applied: 2, responded: 1, interviewed: 1, offered: 0 });
    expect(m.rates.response_rate).toBe(0.5);
    expect(m.rates.interview_rate).toBe(0.5);
    expect(m.rates.offer_rate).toBe(0);
    expect(m.by_status.rejected).toBe(1);
    expect(m.applied_last_7d).toBe(1);
    expect(m.applied_last_30d).toBe(2);
  });

  test("avg days to response uses the first response event", () => {
    const m = computeJobMetrics(
      [job("a", "interviewing", "2026-10-01")],
      [
        { jobId: "a", toStatus: "interviewing", createdAt: "2026-10-15T00:00:00Z" },
        { jobId: "a", toStatus: "screening", createdAt: "2026-10-05T00:00:00Z" },
      ],
      now,
    );
    expect(m.avg_days_to_response).toBe(4);
  });

  test("timeline fills empty weeks between the first and last activity", () => {
    const m = computeJobMetrics([job("a", "applied", "2026-10-01"), job("b", "applied", "2026-10-20")], [], now);
    expect(m.timeline.map((t) => t.period)).toEqual(["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19"]);
    expect(m.timeline.map((t) => t.applied)).toEqual([1, 0, 0, 1]);
  });
});

describe("periodKey", () => {
  test("weekly keys are the Monday of the week", () => {
    expect(periodKey("2026-10-25", false)).toBe("2026-10-19"); // Sunday
    expect(periodKey("2026-10-19T08:00:00Z", false)).toBe("2026-10-19");
  });
});

describe("parseJobQuery", () => {
  test("keeps valid values and drops malformed ones", () => {
    const f = parseJobQuery({ status: "applied,hired,offer", sort: "company; drop", order: "asc", from: "nope", to: "2026-10-31" });
    expect(f.status).toEqual(["applied", "offer"]);
    expect(f.sort).toBeUndefined();
    expect(f.order).toBe("asc");
    expect(f.from).toBeUndefined();
    expect(f.to).toBe("2026-10-31");
  });
});
