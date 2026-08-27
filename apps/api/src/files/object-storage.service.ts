import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListPartsCommand,
  S3Client,
  UploadPartCommand,
  type CompletedPart,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { fileTypeFromBuffer } from "file-type";

import type { UploadPartResponse } from "./files.types.js";

const SIGNED_URL_SECONDS = 15 * 60;
const SNIFF_BYTES = 8_192;

interface ObjectInspection {
  checksumSha256: string;
  detectedMimeType: string;
  etag: string | null;
  sizeBytes: number;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function client(endpoint: string): S3Client {
  return new S3Client({
    credentials: {
      accessKeyId: required("OBJECT_STORAGE_ACCESS_KEY"),
      secretAccessKey: required("OBJECT_STORAGE_SECRET_KEY"),
    },
    endpoint,
    forcePathStyle: true,
    region: process.env.OBJECT_STORAGE_REGION?.trim() || "us-east-1",
  });
}

@Injectable()
export class ObjectStorageService implements OnModuleDestroy {
  private readonly bucket = required("OBJECT_STORAGE_BUCKET");
  private readonly internal = client(required("OBJECT_STORAGE_ENDPOINT"));
  private readonly public = client(required("OBJECT_STORAGE_PUBLIC_ENDPOINT"));

  destroy(): void {
    this.internal.destroy();
    this.public.destroy();
  }

  onModuleDestroy(): void {
    this.destroy();
  }

  async createMultipart(objectKey: string, mimeType: string): Promise<string> {
    const result = await this.internal.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        ContentType: mimeType,
        Key: objectKey,
        Metadata: { managed: "notes-v2" },
      }),
    );
    if (!result.UploadId)
      throw new Error("Object storage returned no upload id");
    return result.UploadId;
  }

  async signPart(
    objectKey: string,
    uploadId: string,
    partNumber: number,
  ): Promise<string> {
    return getSignedUrl(
      this.public,
      new UploadPartCommand({
        Bucket: this.bucket,
        Key: objectKey,
        PartNumber: partNumber,
        UploadId: uploadId,
      }),
      { expiresIn: SIGNED_URL_SECONDS },
    );
  }

  async uploadPart(
    objectKey: string,
    uploadId: string,
    partNumber: number,
    body: Buffer,
  ): Promise<string> {
    const result = await this.internal.send(
      new UploadPartCommand({
        Body: body,
        Bucket: this.bucket,
        Key: objectKey,
        PartNumber: partNumber,
        UploadId: uploadId,
      }),
    );
    if (!result.ETag) throw new Error("Object storage returned no part ETag");
    return result.ETag;
  }

  async listParts(
    objectKey: string,
    uploadId: string,
  ): Promise<UploadPartResponse[]> {
    const parts: UploadPartResponse[] = [];
    let marker: string | undefined;
    do {
      const result = await this.internal.send(
        new ListPartsCommand({
          Bucket: this.bucket,
          Key: objectKey,
          PartNumberMarker: marker,
          UploadId: uploadId,
        }),
      );
      for (const part of result.Parts ?? []) {
        if (!part.ETag || !part.PartNumber) continue;
        parts.push({
          etag: part.ETag,
          partNumber: part.PartNumber,
          sizeBytes: part.Size ?? 0,
        });
      }
      marker = result.IsTruncated
        ? result.NextPartNumberMarker?.toString()
        : undefined;
    } while (marker);
    return parts.sort((left, right) => left.partNumber - right.partNumber);
  }

  async completeMultipart(
    objectKey: string,
    uploadId: string,
    parts: CompletedPart[],
  ): Promise<void> {
    await this.internal.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: objectKey,
        MultipartUpload: { Parts: parts },
        UploadId: uploadId,
      }),
    );
  }

  async writeIntegrityMetadata(
    objectKey: string,
    mimeType: string,
    checksumSha256: string,
  ): Promise<string | null> {
    const source = this.copySource(objectKey);
    const result = await this.internal.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        ContentType: mimeType,
        CopySource: source,
        Key: objectKey,
        MetadataDirective: "REPLACE",
        Metadata: { managed: "notes-v2", sha256: checksumSha256 },
      }),
    );
    return result.CopyObjectResult?.ETag ?? null;
  }

  async abortMultipart(objectKey: string, uploadId: string): Promise<void> {
    await this.internal.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucket,
        Key: objectKey,
        UploadId: uploadId,
      }),
    );
  }

  async inspectObject(
    objectKey: string,
    declaredMimeType: string,
  ): Promise<ObjectInspection> {
    const [head, object] = await Promise.all([
      this.internal.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      ),
      this.internal.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      ),
    ]);
    if (!object.Body) throw new Error("Object storage returned an empty body");

    const hash = createHash("sha256");
    const prefix: Buffer[] = [];
    let prefixBytes = 0;
    let streamedBytes = 0;
    for await (const raw of object.Body as AsyncIterable<Uint8Array>) {
      const chunk = Buffer.from(raw);
      hash.update(chunk);
      streamedBytes += chunk.length;
      if (prefixBytes < SNIFF_BYTES) {
        const slice = chunk.subarray(0, SNIFF_BYTES - prefixBytes);
        prefix.push(slice);
        prefixBytes += slice.length;
      }
    }
    const sample = Buffer.concat(prefix);
    const detected = await fileTypeFromBuffer(sample);
    const looksText = !sample.includes(0);
    const detectedMimeType =
      detected?.mime ??
      (looksText
        ? declaredMimeType.startsWith("text/")
          ? declaredMimeType
          : "text/plain"
        : "application/octet-stream");
    const sizeBytes = head.ContentLength ?? streamedBytes;
    if (streamedBytes !== sizeBytes) {
      throw new Error("Object length changed during integrity inspection");
    }
    return {
      checksumSha256: hash.digest("hex"),
      detectedMimeType,
      etag: head.ETag ?? null,
      sizeBytes,
    };
  }

  openReadStream(objectKey: string): Readable {
    const storage = this.internal;
    const bucket = this.bucket;
    return Readable.from(
      (async function* () {
        const object = await storage.send(
          new GetObjectCommand({ Bucket: bucket, Key: objectKey }),
        );
        if (!object.Body) {
          throw new Error("Object storage returned an empty body");
        }
        for await (const chunk of object.Body as AsyncIterable<Uint8Array>) {
          yield Buffer.from(chunk);
        }
      })(),
    );
  }

  async copy(
    sourceKey: string,
    targetKey: string,
    mimeType: string,
    checksumSha256: string | null,
  ): Promise<void> {
    const source = this.copySource(sourceKey);
    await this.internal.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        ContentType: mimeType,
        CopySource: source,
        Key: targetKey,
        MetadataDirective: "REPLACE",
        Metadata: {
          managed: "notes-v2",
          ...(checksumSha256 ? { sha256: checksumSha256 } : {}),
        },
      }),
    );
  }

  async remove(objectKey: string): Promise<void> {
    await this.internal.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
  }

  async signDownload(
    objectKey: string,
    fileName: string,
    mimeType: string,
    inline: boolean,
  ): Promise<string> {
    const disposition = `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(fileName)}`;
    return getSignedUrl(
      this.public,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        ResponseContentDisposition: disposition,
        ResponseContentType: mimeType,
      }),
      { expiresIn: SIGNED_URL_SECONDS },
    );
  }

  private copySource(objectKey: string): string {
    return encodeURIComponent(`${this.bucket}/${objectKey}`).replaceAll(
      "%2F",
      "/",
    );
  }
}
