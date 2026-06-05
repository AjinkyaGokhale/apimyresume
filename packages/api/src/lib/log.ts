/** Minimal structured logger. Swap for pino/winston later if needed. */

type Level = "debug" | "info" | "warn" | "error";

function emit(level: Level, msg: string, meta?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] ${level.toUpperCase()}`;
  if (meta && Object.keys(meta).length > 0) {
    console[level === "debug" ? "log" : level](`${prefix} ${msg}`, meta);
  } else {
    console[level === "debug" ? "log" : level](`${prefix} ${msg}`);
  }
}

export const log = {
  debug: (msg: string, meta?: Record<string, unknown>) => emit("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => emit("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => emit("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit("error", msg, meta),
};
