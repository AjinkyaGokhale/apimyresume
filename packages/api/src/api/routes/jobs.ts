import { Hono } from "hono";
import { readBody } from "../body.ts";
import { jobDto, jobEventDto } from "../dto.ts";
import { ownerOnly } from "../middleware/auth.ts";
import { jobRepo } from "../../db/repo.ts";
import {
  createOrUpsertJob,
  deleteJob,
  getJob,
  jobStats,
  parseJobQuery,
  updateJob,
} from "../../services/jobs.ts";

/**
 * Job tracker routes. API keys (AI agents) can create, read and update jobs;
 * deleting a record is owner-only — agents mark a job `withdrawn` instead.
 */
export const jobsRouter = new Hono();

jobsRouter.get("/", (c) => {
  const { rows, total, page, limit, hasNext } = jobRepo.list(parseJobQuery(c.req.query()));
  return c.json({
    data: rows.map(jobDto),
    pagination: { total, page, limit, has_next: hasNext },
  });
});

// Registered before "/:id" so "stats" is not read as a job id.
jobsRouter.get("/stats", (c) => c.json(jobStats(parseJobQuery(c.req.query()))));

jobsRouter.post("/", async (c) => {
  const { job, created } = createOrUpsertJob(await readBody(c), c.get("authType"));
  return c.json(jobDto(job), created ? 201 : 200);
});

jobsRouter.get("/:id", (c) => {
  const { job, events } = getJob(c.req.param("id"));
  return c.json({ ...jobDto(job), events: events.map(jobEventDto) });
});

jobsRouter.patch("/:id", async (c) => {
  return c.json(jobDto(updateJob(c.req.param("id"), await readBody(c), c.get("authType"))));
});

jobsRouter.delete("/:id", ownerOnly, (c) => {
  deleteJob(c.req.param("id"));
  return c.body(null, 204);
});
