import { mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.ts";
import { log } from "../lib/log.ts";
import type { StorageDriver, StorageResult } from "./types.ts";

/**
 * Local filesystem driver (spec §12). Writes to <dataDir>/pdfs/<filename>.pdf
 * and exposes them at the public path /pdfs/<filename>.pdf, served as static
 * assets by the API.
 */
export class LocalStorageDriver implements StorageDriver {
  readonly name = "local";
  private readonly dir: string;

  constructor(dir: string = config.pdfDir) {
    this.dir = dir;
    mkdirSync(this.dir, { recursive: true });
  }

  async write(filename: string, buffer: Uint8Array): Promise<StorageResult> {
    const file = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
    const fsPath = path.join(this.dir, file);
    await Bun.write(fsPath, buffer);
    log.debug("Wrote PDF to local storage", { path: fsPath, bytes: buffer.byteLength });
    return { url: `/pdfs/${file}`, path: fsPath };
  }

  async delete(p: string): Promise<void> {
    try {
      await unlink(p);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
}
