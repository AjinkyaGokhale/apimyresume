import { S3Client } from "bun";
import { config } from "../config.ts";
import { log } from "../lib/log.ts";
import { AppError } from "../lib/errors.ts";
import type { StorageDriver, StorageResult } from "./types.ts";

/**
 * S3 / MinIO driver (spec §12). Uploads the PDF buffer directly to the bucket
 * via Bun's native S3 client. MinIO is configured identically — just set
 * S3_ENDPOINT to the MinIO URL. The local filesystem is never written to.
 */
export class S3StorageDriver implements StorageDriver {
  readonly name = "s3";
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly endpoint?: string;
  private readonly region?: string;
  private readonly prefix = "pdfs";

  constructor() {
    const { bucket, endpoint, region, accessKeyId, secretAccessKey } = config.s3;
    if (!bucket) {
      throw new AppError(500, "config_error", "S3_BUCKET is required when STORAGE_DRIVER=s3");
    }
    this.bucket = bucket;
    this.endpoint = endpoint;
    this.region = region;
    this.client = new S3Client({
      bucket,
      ...(endpoint ? { endpoint } : {}),
      ...(region ? { region } : {}),
      ...(accessKeyId ? { accessKeyId } : {}),
      ...(secretAccessKey ? { secretAccessKey } : {}),
    });
  }

  private key(filename: string): string {
    const file = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
    return `${this.prefix}/${file}`;
  }

  private publicUrl(key: string): string {
    if (this.endpoint) {
      return `${this.endpoint.replace(/\/$/, "")}/${this.bucket}/${key}`;
    }
    const region = this.region ?? "us-east-1";
    return `https://${this.bucket}.s3.${region}.amazonaws.com/${key}`;
  }

  async write(filename: string, buffer: Uint8Array): Promise<StorageResult> {
    const key = this.key(filename);
    await this.client.write(key, buffer, { type: "application/pdf" });
    log.debug("Uploaded PDF to S3", { bucket: this.bucket, key, bytes: buffer.byteLength });
    return { url: this.publicUrl(key), path: key };
  }

  async delete(key: string): Promise<void> {
    await this.client.delete(key);
  }
}
