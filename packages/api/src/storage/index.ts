import { config } from "../config.ts";
import { log } from "../lib/log.ts";
import { LocalStorageDriver } from "./local.ts";
import { S3StorageDriver } from "./s3.ts";
import type { StorageDriver } from "./types.ts";

export type { StorageDriver, StorageResult } from "./types.ts";

/**
 * Storage driver is instantiated once at startup, not per-request (spec §12).
 * All render operations share this single instance.
 */
let driver: StorageDriver | null = null;

export function getStorage(): StorageDriver {
  if (driver) return driver;
  driver = config.storageDriver === "s3" ? new S3StorageDriver() : new LocalStorageDriver();
  log.info("Storage driver initialised", { driver: driver.name });
  return driver;
}
