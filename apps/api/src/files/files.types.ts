export interface FileFolderResponse {
  createdAt: string;
  id: number;
  name: string;
  parentId: number | null;
  position: number;
  updatedAt: string;
}

export interface FileResponse {
  checksumSha256: string | null;
  createdAt: string;
  detectedMimeType: string | null;
  duplicateOfIds: number[];
  fileName: string;
  folderId: number | null;
  id: number;
  mimeType: string;
  noteId: number | null;
  noteName: string | null;
  sizeBytes: number;
  updatedAt: string;
}

export interface FileUsageResponse {
  enabled: boolean;
  limitBytes: number | null;
  reservedBytes: number;
  usedBytes: number;
}

export interface UploadPartResponse {
  etag: string;
  partNumber: number;
  sizeBytes: number;
}

export interface FileUploadResponse {
  expiresAt: string;
  fileName: string;
  id: number;
  partCount: number;
  partSizeBytes: number;
  sizeBytes: number;
  status: string;
  uploadedParts: UploadPartResponse[];
}

export interface CreateUploadInput {
  checksumSha256: string | null;
  fileName: string;
  folderId: number | null;
  mimeType: string;
  noteId: number | null;
  sizeBytes: number;
}

export interface CompleteUploadInput {
  parts: Array<{ etag: string; partNumber: number }>;
}

export interface FilePatchInput {
  fileName?: string;
  folderId?: number | null;
  noteId?: number | null;
}

export interface FileArchiveInput {
  fileIds: number[];
  folderIds: number[];
  noteId: number | null;
}
