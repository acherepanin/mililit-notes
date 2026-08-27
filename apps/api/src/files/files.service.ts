import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  activityLogs,
  attachmentFolders,
  attachmentUploads,
  attachments,
  notes,
} from "@notes/db";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNull,
  ne,
  notInArray,
  sql,
} from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { extname } from "node:path";

import { DatabaseService } from "../database/database.service.js";
import { EntitlementsService } from "../entitlements/entitlements.service.js";
import type {
  CompleteUploadInput,
  CreateUploadInput,
  FileFolderResponse,
  FilePatchInput,
  FileResponse,
  FileUploadResponse,
  FileUsageResponse,
} from "./files.types.js";
import { ObjectStorageService } from "./object-storage.service.js";

const BASE_PART_SIZE = 8 * 1024 * 1024;
const MAX_PARTS = 10_000;
const UPLOAD_TTL_MS = 24 * 60 * 60 * 1_000;
const ACTIVE_UPLOAD_STATUSES = [
  "preparing",
  "uploading",
  "completing",
  "expiring",
];

interface FileRow {
  checksumSha256: string | null;
  createdAt: Date;
  detectedMimeType: string | null;
  etag: string | null;
  fileName: string;
  folderId: number | null;
  id: number;
  mimeType: string;
  noteId: number | null;
  noteName: string | null;
  objectKey: string | null;
  sizeBytes: number;
  updatedAt: Date;
}

function databaseCode(error: unknown): string | undefined {
  return error && typeof error === "object" && "code" in error
    ? String(error.code)
    : undefined;
}

function partSizeFor(sizeBytes: number): number {
  const minimum = Math.ceil(sizeBytes / MAX_PARTS);
  return Math.ceil(Math.max(BASE_PART_SIZE, minimum) / 1024 ** 2) * 1024 ** 2;
}

function uniqueName(requested: string, existing: string[]): string {
  const names = new Set(existing.map((name) => name.toLocaleLowerCase("en")));
  if (!names.has(requested.toLocaleLowerCase("en"))) return requested;
  const extension = extname(requested);
  const stem =
    requested.slice(0, requested.length - extension.length) || "file";
  for (let index = 1; index < 100_000; index += 1) {
    const candidate = `${stem} (${index})${extension}`;
    if (!names.has(candidate.toLocaleLowerCase("en"))) return candidate;
  }
  throw new ConflictException("Could not allocate a unique file name");
}

function sameEtag(left: string, right: string): boolean {
  return left.replaceAll('"', "") === right.replaceAll('"', "");
}

@Injectable()
export class FilesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ObjectStorageService)
    private readonly storage: ObjectStorageService,
    @Inject(EntitlementsService)
    private readonly entitlements: EntitlementsService,
  ) {}

  async listFolders(userId: number): Promise<FileFolderResponse[]> {
    const rows = await this.database.client
      .select()
      .from(attachmentFolders)
      .where(eq(attachmentFolders.userId, userId))
      .orderBy(
        asc(attachmentFolders.parentId),
        asc(attachmentFolders.position),
        asc(attachmentFolders.name),
        asc(attachmentFolders.id),
      );
    return rows.map((row) => this.mapFolder(row));
  }

  async createFolder(
    userId: number,
    input: { name: string; parentId: number | null },
  ): Promise<FileFolderResponse> {
    if (input.parentId !== null)
      await this.requireFolder(userId, input.parentId);
    try {
      const [created] = await this.database.client
        .insert(attachmentFolders)
        .values({
          name: input.name,
          parentId: input.parentId,
          position: await this.nextFolderPosition(userId, input.parentId),
          userId,
        })
        .returning();
      if (!created) throw new Error("Folder insert did not return a row");
      await this.audit(userId, "files.folder_create", created.id, {
        parentId: input.parentId,
      });
      return this.mapFolder(created);
    } catch (error) {
      if (databaseCode(error) === "23505") {
        throw new ConflictException("A folder with this name already exists");
      }
      throw error;
    }
  }

  async renameFolder(
    userId: number,
    id: number,
    name: string,
  ): Promise<FileFolderResponse> {
    try {
      const [updated] = await this.database.client
        .update(attachmentFolders)
        .set({ name, updatedAt: new Date() })
        .where(
          and(
            eq(attachmentFolders.id, id),
            eq(attachmentFolders.userId, userId),
          ),
        )
        .returning();
      if (!updated) throw new NotFoundException(`Folder ${id} was not found`);
      await this.audit(userId, "files.folder_rename", id, {});
      return this.mapFolder(updated);
    } catch (error) {
      if (databaseCode(error) === "23505") {
        throw new ConflictException("A folder with this name already exists");
      }
      throw error;
    }
  }

  async moveFolder(
    userId: number,
    id: number,
    parentId: number | null,
  ): Promise<FileFolderResponse> {
    const folder = await this.requireFolder(userId, id);
    if (parentId === id) {
      throw new BadRequestException("A folder cannot be moved into itself");
    }
    if (parentId !== null) {
      await this.requireFolder(userId, parentId);
      const descendants = await this.folderSubtree(userId, id);
      if (descendants.includes(parentId)) {
        throw new BadRequestException(
          "A folder cannot be moved into its subtree",
        );
      }
    }
    try {
      const [updated] = await this.database.client
        .update(attachmentFolders)
        .set({
          parentId,
          position: await this.nextFolderPosition(userId, parentId),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(attachmentFolders.id, id),
            eq(attachmentFolders.userId, userId),
          ),
        )
        .returning();
      if (!updated) throw new NotFoundException(`Folder ${id} was not found`);
      await this.audit(userId, "files.folder_move", id, {
        fromParentId: folder.parentId,
        parentId,
      });
      return this.mapFolder(updated);
    } catch (error) {
      if (databaseCode(error) === "23505") {
        throw new ConflictException("A folder with this name already exists");
      }
      throw error;
    }
  }

  async deleteFolder(userId: number, id: number): Promise<{ id: number }> {
    await this.requireFolder(userId, id);
    const folderIds = await this.folderSubtree(userId, id);
    const [active] = await this.database.client
      .select({ count: sql<number>`count(*)::int` })
      .from(attachmentUploads)
      .where(
        and(
          eq(attachmentUploads.userId, userId),
          inArray(attachmentUploads.folderId, folderIds),
          inArray(attachmentUploads.status, ACTIVE_UPLOAD_STATUSES),
        ),
      );
    if ((active?.count ?? 0) > 0) {
      throw new ConflictException("Finish or cancel folder uploads first");
    }
    const files = await this.database.client
      .select({ id: attachments.id, objectKey: attachments.objectKey })
      .from(attachments)
      .where(
        and(
          eq(attachments.userId, userId),
          inArray(attachments.folderId, folderIds),
          ne(attachments.storageStatus, "deleted"),
        ),
      );
    await this.database.client.transaction(async (tx) => {
      if (files.length > 0) {
        await tx
          .update(attachments)
          .set({ storageStatus: "deleted", updatedAt: new Date() })
          .where(
            inArray(
              attachments.id,
              files.map((file) => file.id),
            ),
          );
      }
      await tx
        .delete(attachmentUploads)
        .where(
          and(
            eq(attachmentUploads.userId, userId),
            inArray(attachmentUploads.folderId, folderIds),
            notInArray(attachmentUploads.status, ACTIVE_UPLOAD_STATUSES),
          ),
        );
      await tx
        .delete(attachmentFolders)
        .where(
          and(
            eq(attachmentFolders.id, id),
            eq(attachmentFolders.userId, userId),
          ),
        );
      await tx.insert(activityLogs).values({
        action: "files.folder_delete",
        actorId: userId,
        details: { fileCount: files.length, folderCount: folderIds.length },
        targetId: id,
        targetType: "attachment_folder",
        userId,
      });
    });
    await Promise.all(
      files
        .map((file) => file.objectKey)
        .filter((key): key is string => Boolean(key))
        .map((key) => this.storage.remove(key)),
    );
    if (files.length > 0) {
      await this.database.client.delete(attachments).where(
        inArray(
          attachments.id,
          files.map((file) => file.id),
        ),
      );
    }
    return { id };
  }

  async listFiles(
    userId: number,
    input: { folderId: number | null; noteId: number | null; query: string },
  ): Promise<FileResponse[]> {
    if (input.folderId !== null)
      await this.requireFolder(userId, input.folderId);
    if (input.noteId !== null) await this.requireNote(userId, input.noteId);
    const conditions = [
      eq(attachments.userId, userId),
      eq(attachments.storageStatus, "ready"),
      input.noteId !== null
        ? eq(attachments.noteId, input.noteId)
        : input.folderId === null
          ? isNull(attachments.folderId)
          : eq(attachments.folderId, input.folderId),
      ...(input.query
        ? [
            ilike(
              attachments.fileName,
              `%${input.query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`,
            ),
          ]
        : []),
    ];
    const rows = await this.selectFiles()
      .where(and(...conditions))
      .orderBy(desc(attachments.createdAt), desc(attachments.id))
      .limit(500);
    return this.mapFilesWithDuplicates(userId, rows);
  }

  async usage(userId: number): Promise<FileUsageResponse> {
    const usage = await this.entitlements.getFileUsage(userId);
    return {
      enabled: usage.enabled,
      limitBytes: usage.limitBytes,
      reservedBytes: usage.reservedBytes,
      usedBytes: usage.usedBytes,
    };
  }

  async createUpload(
    userId: number,
    input: CreateUploadInput,
  ): Promise<FileUploadResponse> {
    if (input.folderId !== null)
      await this.requireFolder(userId, input.folderId);
    if (input.noteId !== null) await this.requireNote(userId, input.noteId);
    const partSizeBytes = partSizeFor(input.sizeBytes);
    const objectKey = `users/${userId}/files/${randomUUID()}`;
    const expiresAt = new Date(Date.now() + UPLOAD_TTL_MS);
    const reserved = await this.database.client.transaction(async (tx) => {
      await this.entitlements.lockUserQuota(userId, tx);
      await this.entitlements.assertFileStorage(userId, input.sizeBytes, tx);
      const names = await this.namesInFolder(userId, input.folderId, tx);
      const [row] = await tx
        .insert(attachmentUploads)
        .values({
          checksumSha256: input.checksumSha256,
          declaredMimeType: input.mimeType,
          expiresAt,
          fileName: uniqueName(input.fileName, names),
          folderId: input.folderId,
          multipartUploadId: null,
          noteId: input.noteId,
          objectKey,
          partSizeBytes,
          sizeBytes: input.sizeBytes,
          status: "preparing",
          userId,
        })
        .returning();
      if (!row) throw new Error("Upload reservation did not return a row");
      return row;
    });

    try {
      const uploadId = await this.storage.createMultipart(
        reserved.objectKey,
        reserved.declaredMimeType,
      );
      const [ready] = await this.database.client
        .update(attachmentUploads)
        .set({
          multipartUploadId: uploadId,
          status: "uploading",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(attachmentUploads.id, reserved.id),
            eq(attachmentUploads.userId, userId),
            eq(attachmentUploads.status, "preparing"),
          ),
        )
        .returning();
      if (!ready) {
        await this.storage.abortMultipart(reserved.objectKey, uploadId);
        throw new ConflictException("Upload reservation is no longer active");
      }
      await this.audit(userId, "files.upload_create", ready.id, {
        fileName: ready.fileName,
        sizeBytes: ready.sizeBytes,
      });
      return this.mapUpload(ready, []);
    } catch (error) {
      await this.database.client
        .update(attachmentUploads)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(attachmentUploads.id, reserved.id));
      throw error;
    }
  }

  async getUpload(userId: number, id: number): Promise<FileUploadResponse> {
    const upload = await this.requireUpload(userId, id);
    const parts =
      upload.status === "uploading" && upload.multipartUploadId
        ? await this.storage.listParts(
            upload.objectKey,
            upload.multipartUploadId,
          )
        : [];
    return this.mapUpload(upload, parts);
  }

  async ingestBuffer(
    userId: number,
    input: { content: Buffer; fileName: string; mimeType: string },
  ): Promise<FileResponse> {
    if (input.content.length < 1 || input.content.length > 50 * 1024 * 1024) {
      throw new BadRequestException("File must contain 1 byte to 50 MB");
    }
    const upload = await this.createUpload(userId, {
      checksumSha256: createHash("sha256").update(input.content).digest("hex"),
      fileName: input.fileName.slice(0, 255),
      folderId: null,
      mimeType: input.mimeType,
      noteId: null,
      sizeBytes: input.content.length,
    });
    try {
      const row = await this.requireUpload(userId, upload.id, "uploading");
      if (!row.multipartUploadId) throw new Error("Upload is not ready");
      const etag = await this.storage.uploadPart(
        row.objectKey,
        row.multipartUploadId,
        1,
        input.content,
      );
      return await this.completeUpload(userId, upload.id, {
        parts: [{ etag, partNumber: 1 }],
      });
    } catch (error) {
      await this.abortUpload(userId, upload.id).catch(() => undefined);
      throw error;
    }
  }

  async signUploadPart(
    userId: number,
    id: number,
    partNumber: number,
  ): Promise<{ expiresInSeconds: number; url: string }> {
    const upload = await this.requireUpload(userId, id, "uploading");
    if (!upload.multipartUploadId)
      throw new ConflictException("Upload is not ready");
    const partCount = Math.ceil(upload.sizeBytes / upload.partSizeBytes);
    if (partNumber < 1 || partNumber > partCount) {
      throw new BadRequestException("partNumber is outside the upload range");
    }
    return {
      expiresInSeconds: 15 * 60,
      url: await this.storage.signPart(
        upload.objectKey,
        upload.multipartUploadId,
        partNumber,
      ),
    };
  }

  async completeUpload(
    userId: number,
    id: number,
    input: CompleteUploadInput,
  ): Promise<FileResponse> {
    const upload = await this.requireUpload(userId, id, "uploading");
    if (!upload.multipartUploadId)
      throw new ConflictException("Upload is not ready");
    const expectedParts = Math.ceil(upload.sizeBytes / upload.partSizeBytes);
    if (
      input.parts.length !== expectedParts ||
      input.parts.some((part, index) => part.partNumber !== index + 1)
    ) {
      throw new BadRequestException("parts must cover the complete upload");
    }
    const storedParts = await this.storage.listParts(
      upload.objectKey,
      upload.multipartUploadId,
    );
    if (
      storedParts.length !== input.parts.length ||
      storedParts.some(
        (part, index) =>
          part.partNumber !== input.parts[index]?.partNumber ||
          !sameEtag(part.etag, input.parts[index]?.etag ?? ""),
      ) ||
      storedParts.reduce((total, part) => total + part.sizeBytes, 0) !==
        upload.sizeBytes
    ) {
      throw new BadRequestException(
        "Uploaded parts failed integrity validation",
      );
    }
    const [claimed] = await this.database.client
      .update(attachmentUploads)
      .set({ status: "completing", updatedAt: new Date() })
      .where(
        and(
          eq(attachmentUploads.id, id),
          eq(attachmentUploads.userId, userId),
          eq(attachmentUploads.status, "uploading"),
        ),
      )
      .returning();
    if (!claimed) throw new ConflictException("Upload is already completing");

    let objectCompleted = false;
    try {
      await this.storage.completeMultipart(
        upload.objectKey,
        upload.multipartUploadId,
        storedParts.map((part) => ({
          ETag: part.etag,
          PartNumber: part.partNumber,
        })),
      );
      objectCompleted = true;
      const inspected = await this.storage.inspectObject(
        upload.objectKey,
        upload.declaredMimeType,
      );
      if (inspected.sizeBytes !== upload.sizeBytes) {
        throw new BadRequestException("Completed object size does not match");
      }
      if (
        upload.checksumSha256 &&
        inspected.checksumSha256 !== upload.checksumSha256
      ) {
        throw new BadRequestException(
          "Completed object checksum does not match",
        );
      }
      const storedEtag =
        (await this.storage.writeIntegrityMetadata(
          upload.objectKey,
          upload.declaredMimeType,
          inspected.checksumSha256,
        )) ?? inspected.etag;
      const created = await this.database.client.transaction(async (tx) => {
        const [completed] = await tx
          .update(attachmentUploads)
          .set({ status: "completed", updatedAt: new Date() })
          .where(
            and(
              eq(attachmentUploads.id, id),
              eq(attachmentUploads.userId, userId),
              eq(attachmentUploads.status, "completing"),
            ),
          )
          .returning({ id: attachmentUploads.id });
        if (!completed) {
          throw new ConflictException("Upload is no longer completing");
        }
        const [file] = await tx
          .insert(attachments)
          .values({
            checksumSha256: inspected.checksumSha256,
            detectedMimeType: inspected.detectedMimeType,
            etag: storedEtag,
            fileName: upload.fileName,
            folderId: upload.folderId,
            mimeType: upload.declaredMimeType,
            noteId: upload.noteId,
            objectKey: upload.objectKey,
            sizeBytes: inspected.sizeBytes,
            storageStatus: "ready",
            userId,
          })
          .returning();
        if (!file) throw new Error("Completed file insert returned no row");
        await tx.insert(activityLogs).values({
          action: "files.upload_complete",
          actorId: userId,
          details: {
            checksumSha256: inspected.checksumSha256,
            sizeBytes: inspected.sizeBytes,
          },
          targetId: file.id,
          targetType: "attachment",
          userId,
        });
        return file;
      });
      return this.getFile(userId, created.id);
    } catch (error) {
      if (objectCompleted) await this.storage.remove(upload.objectKey);
      await this.database.client
        .update(attachmentUploads)
        .set({
          status: objectCompleted ? "failed" : "uploading",
          updatedAt: new Date(),
        })
        .where(eq(attachmentUploads.id, id));
      throw error;
    }
  }

  async abortUpload(userId: number, id: number): Promise<{ id: number }> {
    const upload = await this.requireUpload(userId, id);
    if (!["preparing", "uploading", "failed"].includes(upload.status)) {
      throw new ConflictException("Upload can no longer be aborted");
    }
    if (upload.multipartUploadId && upload.status === "uploading") {
      await this.storage.abortMultipart(
        upload.objectKey,
        upload.multipartUploadId,
      );
    }
    await this.database.client
      .update(attachmentUploads)
      .set({ status: "aborted", updatedAt: new Date() })
      .where(
        and(eq(attachmentUploads.id, id), eq(attachmentUploads.userId, userId)),
      );
    await this.audit(userId, "files.upload_abort", id, {});
    return { id };
  }

  async patchFile(
    userId: number,
    id: number,
    input: FilePatchInput,
  ): Promise<FileResponse> {
    await this.requireFileRow(userId, id);
    if (input.folderId !== undefined && input.folderId !== null) {
      await this.requireFolder(userId, input.folderId);
    }
    if (input.noteId !== undefined && input.noteId !== null) {
      await this.requireNote(userId, input.noteId);
    }
    try {
      const [updated] = await this.database.client
        .update(attachments)
        .set({ ...input, updatedAt: new Date() })
        .where(
          and(
            eq(attachments.id, id),
            eq(attachments.userId, userId),
            eq(attachments.storageStatus, "ready"),
          ),
        )
        .returning({ id: attachments.id });
      if (!updated) throw new NotFoundException(`File ${id} was not found`);
      await this.audit(userId, "files.update", id, {
        fields: Object.keys(input),
      });
      return this.getFile(userId, id);
    } catch (error) {
      if (databaseCode(error) === "23505") {
        throw new ConflictException("A file with this name already exists");
      }
      throw error;
    }
  }

  async duplicateFile(
    userId: number,
    id: number,
    folderId: number | null,
  ): Promise<FileResponse> {
    const source = await this.requireFileRow(userId, id);
    if (!source.objectKey)
      throw new ConflictException("File object is unavailable");
    if (folderId !== null) await this.requireFolder(userId, folderId);
    const targetKey = `users/${userId}/files/${randomUUID()}`;
    const reserved = await this.database.client.transaction(async (tx) => {
      await this.entitlements.lockUserQuota(userId, tx);
      await this.entitlements.assertFileStorage(userId, source.sizeBytes, tx);
      const names = await this.namesInFolder(userId, folderId, tx);
      const [copy] = await tx
        .insert(attachments)
        .values({
          checksumSha256: source.checksumSha256,
          detectedMimeType: source.detectedMimeType,
          etag: null,
          fileName: uniqueName(source.fileName, names),
          folderId,
          mimeType: source.mimeType,
          noteId: source.noteId,
          objectKey: targetKey,
          sizeBytes: source.sizeBytes,
          storageStatus: "copying",
          userId,
        })
        .returning();
      if (!copy) throw new Error("File copy reservation returned no row");
      return copy;
    });
    try {
      await this.storage.copy(
        source.objectKey,
        targetKey,
        source.mimeType,
        source.checksumSha256,
      );
      await this.database.client
        .update(attachments)
        .set({ storageStatus: "ready", updatedAt: new Date() })
        .where(
          and(eq(attachments.id, reserved.id), eq(attachments.userId, userId)),
        );
      await this.audit(userId, "files.duplicate", reserved.id, {
        sourceId: id,
      });
      return this.getFile(userId, reserved.id);
    } catch (error) {
      await this.database.client
        .delete(attachments)
        .where(eq(attachments.id, reserved.id));
      throw error;
    }
  }

  async deleteFile(userId: number, id: number): Promise<{ id: number }> {
    const [deleted] = await this.database.client
      .update(attachments)
      .set({ storageStatus: "deleted", updatedAt: new Date() })
      .where(
        and(
          eq(attachments.id, id),
          eq(attachments.userId, userId),
          ne(attachments.storageStatus, "deleted"),
        ),
      )
      .returning({ objectKey: attachments.objectKey });
    if (!deleted) throw new NotFoundException(`File ${id} was not found`);
    if (deleted.objectKey) await this.storage.remove(deleted.objectKey);
    await this.database.client
      .delete(attachments)
      .where(and(eq(attachments.id, id), eq(attachments.userId, userId)));
    await this.audit(userId, "files.delete", id, {});
    return { id };
  }

  async signedUrl(
    userId: number,
    id: number,
    inline: boolean,
  ): Promise<{ expiresInSeconds: number; url: string }> {
    const file = await this.requireFileRow(userId, id);
    if (!file.objectKey)
      throw new ConflictException("File object is unavailable");
    const mimeType = file.detectedMimeType ?? file.mimeType;
    if (inline && !this.previewable(mimeType)) {
      throw new BadRequestException(
        "This file type cannot be previewed inline",
      );
    }
    return {
      expiresInSeconds: 15 * 60,
      url: await this.storage.signDownload(
        file.objectKey,
        file.fileName,
        mimeType,
        inline,
      ),
    };
  }

  private async getFile(userId: number, id: number): Promise<FileResponse> {
    const rows = await this.selectFiles()
      .where(
        and(
          eq(attachments.id, id),
          eq(attachments.userId, userId),
          eq(attachments.storageStatus, "ready"),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException(`File ${id} was not found`);
    return (await this.mapFilesWithDuplicates(userId, rows))[0] as FileResponse;
  }

  private selectFiles() {
    return this.database.client
      .select({
        checksumSha256: attachments.checksumSha256,
        createdAt: attachments.createdAt,
        detectedMimeType: attachments.detectedMimeType,
        etag: attachments.etag,
        fileName: attachments.fileName,
        folderId: attachments.folderId,
        id: attachments.id,
        mimeType: attachments.mimeType,
        noteId: attachments.noteId,
        noteName: notes.name,
        objectKey: attachments.objectKey,
        sizeBytes: attachments.sizeBytes,
        updatedAt: attachments.updatedAt,
      })
      .from(attachments)
      .leftJoin(
        notes,
        and(
          eq(notes.id, attachments.noteId),
          eq(notes.userId, attachments.userId),
          isNull(notes.deletedAt),
        ),
      );
  }

  private async mapFilesWithDuplicates(
    userId: number,
    rows: FileRow[],
  ): Promise<FileResponse[]> {
    const checksums = [
      ...new Set(
        rows
          .map((row) => row.checksumSha256)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const duplicateRows =
      checksums.length === 0
        ? []
        : await this.database.client
            .select({
              checksum: attachments.checksumSha256,
              id: attachments.id,
            })
            .from(attachments)
            .where(
              and(
                eq(attachments.userId, userId),
                eq(attachments.storageStatus, "ready"),
                inArray(attachments.checksumSha256, checksums),
              ),
            );
    const duplicates = new Map<string, number[]>();
    for (const row of duplicateRows) {
      if (!row.checksum) continue;
      duplicates.set(row.checksum, [
        ...(duplicates.get(row.checksum) ?? []),
        row.id,
      ]);
    }
    return rows.map((row) => ({
      checksumSha256: row.checksumSha256,
      createdAt: row.createdAt.toISOString(),
      detectedMimeType: row.detectedMimeType,
      duplicateOfIds: row.checksumSha256
        ? (duplicates.get(row.checksumSha256) ?? []).filter(
            (id) => id !== row.id,
          )
        : [],
      fileName: row.fileName,
      folderId: row.folderId,
      id: row.id,
      mimeType: row.mimeType,
      noteId: row.noteId,
      noteName: row.noteName,
      sizeBytes: row.sizeBytes,
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  private async requireFileRow(userId: number, id: number): Promise<FileRow> {
    const rows = await this.selectFiles()
      .where(
        and(
          eq(attachments.id, id),
          eq(attachments.userId, userId),
          eq(attachments.storageStatus, "ready"),
        ),
      )
      .limit(1);
    if (!rows[0]) throw new NotFoundException(`File ${id} was not found`);
    return rows[0];
  }

  private async requireUpload(
    userId: number,
    id: number,
    status?: string,
  ): Promise<typeof attachmentUploads.$inferSelect> {
    const [upload] = await this.database.client
      .select()
      .from(attachmentUploads)
      .where(
        and(
          eq(attachmentUploads.id, id),
          eq(attachmentUploads.userId, userId),
          ...(status ? [eq(attachmentUploads.status, status)] : []),
        ),
      )
      .limit(1);
    if (!upload) throw new NotFoundException(`Upload ${id} was not found`);
    if (
      ACTIVE_UPLOAD_STATUSES.includes(upload.status) &&
      upload.expiresAt.getTime() <= Date.now()
    ) {
      throw new ConflictException("Upload session has expired");
    }
    return upload;
  }

  private mapUpload(
    row: typeof attachmentUploads.$inferSelect,
    uploadedParts: FileUploadResponse["uploadedParts"],
  ): FileUploadResponse {
    return {
      expiresAt: row.expiresAt.toISOString(),
      fileName: row.fileName,
      id: row.id,
      partCount: Math.ceil(row.sizeBytes / row.partSizeBytes),
      partSizeBytes: row.partSizeBytes,
      sizeBytes: row.sizeBytes,
      status: row.status,
      uploadedParts,
    };
  }

  private async requireFolder(userId: number, id: number) {
    const [folder] = await this.database.client
      .select()
      .from(attachmentFolders)
      .where(
        and(eq(attachmentFolders.id, id), eq(attachmentFolders.userId, userId)),
      )
      .limit(1);
    if (!folder) throw new NotFoundException(`Folder ${id} was not found`);
    return folder;
  }

  private async requireNote(userId: number, id: number) {
    const [note] = await this.database.client
      .select({ id: notes.id })
      .from(notes)
      .where(
        and(
          eq(notes.id, id),
          eq(notes.userId, userId),
          isNull(notes.deletedAt),
        ),
      )
      .limit(1);
    if (!note) throw new NotFoundException(`Note ${id} was not found`);
    return note;
  }

  private async nextFolderPosition(
    userId: number,
    parentId: number | null,
  ): Promise<number> {
    const [row] = await this.database.client
      .select({
        value: sql<number>`coalesce(max(${attachmentFolders.position}), -1)::int`,
      })
      .from(attachmentFolders)
      .where(
        and(
          eq(attachmentFolders.userId, userId),
          parentId === null
            ? isNull(attachmentFolders.parentId)
            : eq(attachmentFolders.parentId, parentId),
        ),
      );
    return (row?.value ?? -1) + 1;
  }

  private async folderSubtree(userId: number, id: number): Promise<number[]> {
    const result = await this.database.client.execute<{ id: number }>(sql`
      with recursive subtree as (
        select id from attachment_folders where id = ${id} and user_id = ${userId}
        union all
        select child.id
          from attachment_folders child
          join subtree parent on child.parent_id = parent.id
         where child.user_id = ${userId}
      )
      select id from subtree
    `);
    return result.rows.map((row) => Number(row.id));
  }

  private async namesInFolder(
    userId: number,
    folderId: number | null,
    db: Pick<DatabaseService["client"], "select"> = this.database.client,
  ): Promise<string[]> {
    const folderCondition =
      folderId === null
        ? isNull(attachments.folderId)
        : eq(attachments.folderId, folderId);
    const uploadFolderCondition =
      folderId === null
        ? isNull(attachmentUploads.folderId)
        : eq(attachmentUploads.folderId, folderId);
    const [files, uploads] = await Promise.all([
      db
        .select({ name: attachments.fileName })
        .from(attachments)
        .where(
          and(
            eq(attachments.userId, userId),
            folderCondition,
            ne(attachments.storageStatus, "deleted"),
          ),
        ),
      db
        .select({ name: attachmentUploads.fileName })
        .from(attachmentUploads)
        .where(
          and(
            eq(attachmentUploads.userId, userId),
            uploadFolderCondition,
            inArray(attachmentUploads.status, ACTIVE_UPLOAD_STATUSES),
            gt(attachmentUploads.expiresAt, new Date()),
          ),
        ),
    ]);
    return [...files, ...uploads].map((row) => row.name);
  }

  private mapFolder(
    row: typeof attachmentFolders.$inferSelect,
  ): FileFolderResponse {
    return {
      createdAt: row.createdAt.toISOString(),
      id: row.id,
      name: row.name,
      parentId: row.parentId,
      position: row.position,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private previewable(mimeType: string): boolean {
    return (
      mimeType.startsWith("image/") ||
      mimeType.startsWith("text/") ||
      mimeType === "application/pdf" ||
      mimeType === "application/json"
    );
  }

  private async audit(
    userId: number,
    action: string,
    targetId: number,
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.database.client.insert(activityLogs).values({
      action,
      actorId: userId,
      details,
      targetId,
      targetType: action.includes("folder")
        ? "attachment_folder"
        : action.includes("upload")
          ? "attachment_upload"
          : "attachment",
      userId,
    });
  }
}
