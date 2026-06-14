import type { Context } from "hono";
import YAML from "yaml";
import { config } from "../config.ts";
import { badRequest, payloadTooLarge } from "../lib/errors.ts";

/**
 * Read and parse a request body as JSON or YAML based on Content-Type. AI/n8n
 * clients send JSON; the base import flow sends YAML (spec §3, §16). Malformed
 * input yields a clear 400 rather than a generic crash.
 *
 * Bodies larger than `MAX_BODY_BYTES` are rejected with 413 — first via the
 * declared Content-Length (rejected before buffering), then via the actual
 * byte length as a backstop for missing/lying headers. Bun.serve also enforces
 * `maxRequestBodySize` as a hard limit (see index.ts).
 */
export async function readBody(c: Context): Promise<unknown> {
  const max = config.maxBodyBytes;
  const declared = Number(c.req.header("Content-Length"));
  if (Number.isFinite(declared) && declared > max) throw payloadTooLarge();

  const contentType = c.req.header("Content-Type") ?? "";
  const text = await c.req.text();
  if (Buffer.byteLength(text, "utf8") > max) throw payloadTooLarge();
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
