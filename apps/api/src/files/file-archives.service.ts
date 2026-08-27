import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from "@nestjs/common";
import { activityLogs, attachmentFolders, attachments, notes } from "@notes/db";
import archiver from "archiver";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { extname } from "node:path";
import type { Readable } from "node:stream";

import { DatabaseService } from "../database/database.service.js";
import type { FileArchiveInput } from "./files.types.js";
import { ObjectStorageService } from "./object-storage.service.js";

const MAX_ARCHIVE_BYTES = 1024 ** 3;
const MAX_ARCHIVE_FILES = 500;
const MAX_ACCOUNT_FOLDERS = 5_000;

interface ArchiveFileRow {
  createdAt: Date;
  fileName: string;
  folderId: number | null;
  id: number;
  objectKey: string | null;
  sizeBytes: number;
}

interface ArchiveEntry extends ArchiveFileRow {
  archivePath: string;
  objectKey: string;
}

interface ArchiveResult {
  fileName: string;
  stream: Readable;
}

type FolderRow = typeof attachmentFolders.$inferSelect;

function sanitizeArchiveSegment(value: string, fallback: string): string {
  const segment = [...value]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 255);
  return !segment || segment === "." || segment === ".." ? fallback : segment;
}

function uniqueArchivePath(path: string, used: Set<string>): string {
  const segments = path
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean)
    .map((segment) => sanitizeArchiveSegment(segment, "file"));
  if (segments.length === 0) {
    throw new BadRequestException("Archive path is invalid");
  }
  const fileName = segments.pop() as string;
  const directory = segments.join("/");
  const extension = extname(fileName);
  const stem = fileName.slice(0, fileName.length - extension.length) || "file";
  let candidate = directory ? `${directory}/${fileName}` : fileName;
  let index = 2;
  while (used.has(candidate.toLocaleLowerCase("en"))) {
    const next = `${stem} (${index})${extension}`;
    candidate = directory ? `${directory}/${next}` : next;
    index += 1;
  }
  used.add(candidate.toLocaleLowerCase("en"));
  return candidate;
}

@Injectable()
export class FileArchivesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ObjectStorageService)
    private readonly storage: ObjectStorageService,
  ) {}

  async create(
    userId: number,
    input: FileArchiveInput,
  ): Promise<ArchiveResult> {
    const selection =
      input.noteId === null
        ? await this.accountSelection(userId, input)
        : await this.noteSelection(userId, input);
    this.enforceLimits(selection.entries);

    await this.database.client.insert(activityLogs).values({
      action: "files.archive_download",
      actorId: userId,
      details: {
        fileCount: selection.entries.length,
        folderCount: input.folderIds.length,
        noteId: input.noteId,
        sizeBytes: selection.entries.reduce(
          (total, entry) => total + entry.sizeBytes,
          0,
        ),
      },
      targetId: input.noteId,
      targetType: "file_archive",
      userId,
    });

    const archive = archiver("zip", { store: true });
    archive.on("warning", (error) => archive.destroy(error));
    for (const entry of selection.entries) {
      archive.append(this.storage.openReadStream(entry.objectKey), {
        date: entry.createdAt,
        name: entry.archivePath,
      });
    }
    void archive
      .finalize()
      .catch((error: unknown) =>
        archive.destroy(
          error instanceof Error
            ? error
            : new Error("Archive generation failed"),
        ),
      );
    return { fileName: selection.fileName, stream: archive };
  }

  private async noteSelection(
    userId: number,
    input: FileArchiveInput,
  ): Promise<{ entries: ArchiveEntry[]; fileName: string }> {
    if (input.folderIds.length > 0) {
      throw new BadRequestException(
        "folderIds cannot be combined with a note archive",
      );
    }
    const [note] = await this.database.client
      .select({ id: notes.id })
      .from(notes)
      .where(
        and(
          eq(notes.id, input.noteId as number),
          eq(notes.userId, userId),
          isNull(notes.deletedAt),
        ),
      )
      .limit(1);
    if (!note) throw new NotFoundException("Archive selection was not found");

    const conditions = [
      eq(attachments.userId, userId),
      eq(attachments.noteId, note.id),
      eq(attachments.storageStatus, "ready"),
      ...(input.fileIds.length > 0
        ? [inArray(attachments.id, input.fileIds)]
        : []),
    ];
    const rows = await this.archiveFileQuery()
      .where(and(...conditions))
      .orderBy(desc(attachments.createdAt), desc(attachments.id))
      .limit(MAX_ARCHIVE_FILES + 1);
    if (input.fileIds.length > 0 && rows.length !== input.fileIds.length) {
      throw new NotFoundException("Archive selection was not found");
    }
    const used = new Set<string>();
    return {
      entries: rows.map((row) =>
        this.toEntry(
          row,
          uniqueArchivePath(sanitizeArchiveSegment(row.fileName, "file"), used),
        ),
      ),
      fileName: `note-${note.id}-attachments.zip`,
    };
  }

  private async accountSelection(
    userId: number,
    input: FileArchiveInput,
  ): Promise<{ entries: ArchiveEntry[]; fileName: string }> {
    if (input.fileIds.length === 0 && input.folderIds.length === 0) {
      throw new BadRequestException("Select at least one file or folder");
    }
    const folders = await this.database.client
      .select()
      .from(attachmentFolders)
      .where(eq(attachmentFolders.userId, userId))
      .orderBy(asc(attachmentFolders.id))
      .limit(MAX_ACCOUNT_FOLDERS + 1);
    if (folders.length > MAX_ACCOUNT_FOLDERS) {
      throw new PayloadTooLargeException("The folder tree is too large");
    }
    const folderById = new Map(folders.map((folder) => [folder.id, folder]));
    for (const id of input.folderIds) {
      if (!folderById.has(id)) {
        throw new NotFoundException("Archive selection was not found");
      }
    }

    const descendantIds = folders
      .filter((folder) =>
        input.folderIds.some((rootId) =>
          this.isInside(folder.id, rootId, folderById),
        ),
      )
      .map((folder) => folder.id);
    const folderFiles =
      descendantIds.length === 0
        ? []
        : await this.archiveFileQuery()
            .where(
              and(
                eq(attachments.userId, userId),
                eq(attachments.storageStatus, "ready"),
                inArray(attachments.folderId, descendantIds),
              ),
            )
            .orderBy(
              asc(attachments.folderId),
              desc(attachments.createdAt),
              desc(attachments.id),
            )
            .limit(MAX_ARCHIVE_FILES + 1);
    const directFiles =
      input.fileIds.length === 0
        ? []
        : await this.archiveFileQuery()
            .where(
              and(
                eq(attachments.userId, userId),
                eq(attachments.storageStatus, "ready"),
                inArray(attachments.id, input.fileIds),
              ),
            )
            .limit(input.fileIds.length);
    if (directFiles.length !== input.fileIds.length) {
      throw new NotFoundException("Archive selection was not found");
    }

    const entries: ArchiveEntry[] = [];
    const included = new Set<number>();
    const usedPaths = new Set<string>();
    for (const rootId of input.folderIds) {
      for (const row of folderFiles) {
        if (
          included.has(row.id) ||
          row.folderId === null ||
          !this.isInside(row.folderId, rootId, folderById)
        ) {
          continue;
        }
        const folderPath = this.folderPath(row.folderId, rootId, folderById);
        const path = [
          ...folderPath,
          sanitizeArchiveSegment(row.fileName, "file"),
        ].join("/");
        included.add(row.id);
        entries.push(this.toEntry(row, uniqueArchivePath(path, usedPaths)));
      }
    }
    const directById = new Map(directFiles.map((row) => [row.id, row]));
    for (const id of input.fileIds) {
      if (included.has(id)) continue;
      const row = directById.get(id);
      if (!row) throw new NotFoundException("Archive selection was not found");
      included.add(id);
      entries.push(
        this.toEntry(
          row,
          uniqueArchivePath(
            sanitizeArchiveSegment(row.fileName, "file"),
            usedPaths,
          ),
        ),
      );
    }

    const singleFolder =
      input.folderIds.length === 1 && input.fileIds.length === 0
        ? folderById.get(input.folderIds[0] as number)
        : undefined;
    return {
      entries,
      fileName: singleFolder
        ? `${sanitizeArchiveSegment(singleFolder.name, "folder")}.zip`
        : "account-files.zip",
    };
  }

  private archiveFileQuery() {
    return this.database.client
      .select({
        createdAt: attachments.createdAt,
        fileName: attachments.fileName,
        folderId: attachments.folderId,
        id: attachments.id,
        objectKey: attachments.objectKey,
        sizeBytes: attachments.sizeBytes,
      })
      .from(attachments);
  }

  private isInside(
    folderId: number,
    rootId: number,
    folderById: Map<number, FolderRow>,
  ): boolean {
    const visited = new Set<number>();
    let currentId: number | null = folderId;
    while (currentId !== null && !visited.has(currentId)) {
      if (currentId === rootId) return true;
      visited.add(currentId);
      currentId = folderById.get(currentId)?.parentId ?? null;
    }
    return false;
  }

  private folderPath(
    folderId: number,
    rootId: number,
    folderById: Map<number, FolderRow>,
  ): string[] {
    const segments: string[] = [];
    const visited = new Set<number>();
    let currentId: number | null = folderId;
    while (currentId !== null && !visited.has(currentId)) {
      visited.add(currentId);
      const folder = folderById.get(currentId);
      if (!folder) break;
      segments.unshift(sanitizeArchiveSegment(folder.name, "folder"));
      if (currentId === rootId) return segments;
      currentId = folder.parentId;
    }
    throw new BadRequestException("Folder hierarchy is invalid");
  }

  private toEntry(row: ArchiveFileRow, archivePath: string): ArchiveEntry {
    if (!row.objectKey) {
      throw new ConflictException("A selected file object is unavailable");
    }
    return { ...row, archivePath, objectKey: row.objectKey };
  }

  private enforceLimits(entries: ArchiveEntry[]): void {
    if (entries.length === 0) {
      throw new BadRequestException("No files are available for download");
    }
    const sizeBytes = entries.reduce(
      (total, entry) => total + entry.sizeBytes,
      0,
    );
    if (entries.length > MAX_ARCHIVE_FILES || sizeBytes > MAX_ARCHIVE_BYTES) {
      throw new PayloadTooLargeException({
        code: "FILE_ARCHIVE_LIMIT",
        message: "Archive selection exceeds the download limit",
      });
    }
  }
}
