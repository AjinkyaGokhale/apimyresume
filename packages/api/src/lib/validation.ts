import type { z } from "zod";
import { unprocessable } from "./errors.ts";

/**
 * Parse `data` with a Zod schema, throwing a 422 AppError whose envelope lists
 * every invalid field by path, received value, and expected type (spec §19).
 */
export function parseOrThrow<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const errors = result.error.issues.map((issue) => ({
    field: issue.path.join(".") || "(root)",
    received: "received" in issue ? (issue as { received?: unknown }).received : undefined,
    expected: "expected" in issue ? String((issue as { expected?: unknown }).expected) : issue.code,
  }));
  throw unprocessable("Validation failed", errors);
}
