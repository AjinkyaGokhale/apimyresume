import type { Context } from "hono";
import YAML from "yaml";
import { badRequest } from "../lib/errors.ts";

/**
 * Read and parse a request body as JSON or YAML based on Content-Type. AI/n8n
 * clients send JSON; the base import flow sends YAML (spec §3, §16). Malformed
 * input yields a clear 400 rather than a generic crash.
 */
export async function readBody(c: Context): Promise<unknown> {
  const contentType = c.req.header("Content-Type") ?? "";
  const text = await c.req.text();
  if (!text.trim()) return {};

  if (contentType.includes("yaml") || contentType.includes("yml")) {
    try {
      return YAML.parse(text);
    } catch {
      throw badRequest("Invalid YAML body", "invalid_yaml");
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    throw badRequest("Invalid JSON body", "invalid_json");
  }
}
