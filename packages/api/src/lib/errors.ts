import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * Consistent error envelope for all API errors (spec §19).
 *
 *   { error, code, field?, docs?, ...extra }
 *
 * Throw an `AppError` anywhere; the central error handler in the Hono app
 * serialises it to this shape with the right HTTP status.
 */
export interface ErrorEnvelope {
  error: string;
  code: string;
  field?: string;
  docs?: string;
  [key: string]: unknown;
}

export class AppError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;
  readonly field?: string;
  readonly docs?: string;
  readonly extra?: Record<string, unknown>;

  constructor(
    status: ContentfulStatusCode,
    code: string,
    message: string,
    opts: { field?: string; docs?: string; extra?: Record<string, unknown> } = {},
  ) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.field = opts.field;
    this.docs = opts.docs;
    this.extra = opts.extra;
  }

  toEnvelope(): ErrorEnvelope {
    return {
      error: this.message,
      code: this.code,
      ...(this.field ? { field: this.field } : {}),
      ...(this.docs ? { docs: this.docs } : {}),
      ...this.extra,
    };
  }
}

// --- Convenience constructors for the common cases in the spec ---

export const badRequest = (message: string, code = "bad_request", field?: string) =>
  new AppError(400, code, message, { field });

export const unauthorized = (message = "API key required", code = "api_key_required") =>
  new AppError(401, code, message);

export const forbidden = (message = "Invalid API key", code = "invalid_api_key") =>
  new AppError(403, code, message);

export const notFound = (message: string, code = "not_found", field?: string) =>
  new AppError(404, code, message, { field });

export const conflict = (message: string, code = "conflict") =>
  new AppError(409, code, message);

export const unprocessable = (
  message: string,
  errors: Array<{ field: string; received: unknown; expected: string }>,
) => new AppError(422, "validation_error", message, { extra: { errors } });

export const renderTimeout = (message = "Render timed out") =>
  new AppError(408, "render_timeout", message);

export const renderFailed = (
  message: string,
  extra: Record<string, unknown> = {},
) => new AppError(500, "render_failed", message, { extra });
