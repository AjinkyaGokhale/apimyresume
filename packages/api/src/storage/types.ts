/**
 * Pluggable storage layer (spec §12). The interface is identical across drivers;
 * the driver is selected once at startup via STORAGE_DRIVER and reused for every
 * render. `write` always takes an in-memory buffer — nothing touches disk until
 * this is called.
 */
export interface StorageResult {
  /** Public URL/path used as pdf_url (e.g. "/pdfs/foo_v1.pdf" or an S3 URL). */
  url: string;
  /** Driver-internal location used for deletes (fs path or S3 key). */
  path: string;
}

export interface StorageDriver {
  readonly name: string;
  /** Persist a PDF buffer under `<filename>.pdf` and return its url + path. */
  write(filename: string, buffer: Uint8Array): Promise<StorageResult>;
  /** Remove a previously written object. Missing objects are a no-op. */
  delete(path: string): Promise<void>;
}
