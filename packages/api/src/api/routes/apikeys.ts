import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { createApiKey, deleteApiKey, listApiKeys } from "../../services/apikeys.ts";
import { notFound } from "../../lib/errors.ts";
import { ownerOnly } from "../middleware/auth.ts";

export const apiKeysRouter = new Hono();

// API-key management is an owner action — the dashboard manages keys via the
// owner session; programmatic API-key clients cannot mint or revoke keys.
apiKeysRouter.use("*", ownerOnly);

apiKeysRouter.get("/", (c) => c.json(listApiKeys()));

apiKeysRouter.post(
  "/",
  zValidator("json", z.object({ name: z.string().trim().min(1).max(100) })),
  (c) => {
    const { name } = c.req.valid("json");
    const created = createApiKey(name);
    return c.json(created, 201);
  },
);

apiKeysRouter.delete("/:id", (c) => {
  const id = c.req.param("id");
  try {
    deleteApiKey(id);
  } catch {
    throw notFound(`API key '${id}' not found`);
  }
  return c.body(null, 204);
});
