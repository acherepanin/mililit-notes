import { requestApi } from "./notes-api";

export interface FileFolder {
  createdAt: string;
  id: number;
  name: string;
  parentId: number | null;
  position: number;
  updatedAt: string;
}

export interface StoredFile {
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

export interface FileUsage {
  enabled: boolean;
  limitBytes: number | null;
  reservedBytes: number;
  usedBytes: number;
}

interface UploadPart {
  etag: string;
  partNumber: number;
  sizeBytes: number;
}

interface FileUpload {
  expiresAt: string;
  fileName: string;
  id: number;
  partCount: number;
  partSizeBytes: number;
  sizeBytes: number;
  status: string;
  uploadedParts: UploadPart[];
}

export interface FilePatch {
  fileName?: string;
  folderId?: number | null;
  noteId?: number | null;
}

function queryString(
  values: Record<string, number | string | null | undefined>,
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined && value !== "") {
      query.set(key, String(value));
    }
  }
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

function resumeKey(file: File, folderId: number | null, noteId: number | null) {
  return `notes:file-upload:${file.name}:${file.size}:${file.lastModified}:${folderId ?? "root"}:${noteId ?? "none"}`;
}

function putPart(
  url: string,
  body: Blob,
  onProgress: (loaded: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.upload.onprogress = (event) => onProgress(event.loaded);
    request.onerror = () =>
      reject(new Error("Не удалось передать часть файла"));
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(`Хранилище отклонило загрузку (${request.status})`));
        return;
      }
      const etag = request.getResponseHeader("etag");
      if (!etag) {
        reject(new Error("Хранилище не вернуло контрольную метку части"));
        return;
      }
      resolve(etag);
    };
    request.send(body);
  });
}

async function resumableUpload(
  file: File,
  folderId: number | null,
  noteId: number | null,
  onProgress: (progress: number) => void,
) {
  const key = resumeKey(file, folderId, noteId);
  let upload: FileUpload | null = null;
  const rememberedId = Number(window.localStorage.getItem(key));

  if (Number.isSafeInteger(rememberedId) && rememberedId > 0) {
    try {
      const candidate = await requestApi<FileUpload>(
        `/files/uploads/${rememberedId}`,
      );
      if (
        candidate.status === "uploading" &&
        candidate.sizeBytes === file.size
      ) {
        upload = candidate;
      } else {
        window.localStorage.removeItem(key);
      }
    } catch {
      window.localStorage.removeItem(key);
    }
  }

  if (!upload) {
    upload = await requestApi<FileUpload>("/files/uploads", {
      body: JSON.stringify({
        checksumSha256: null,
        fileName: file.name,
        folderId,
        mimeType: file.type || "application/octet-stream",
        noteId,
        sizeBytes: file.size,
      }),
      method: "POST",
    });
    window.localStorage.setItem(key, String(upload.id));
  }

  const completed = new Map(
    upload.uploadedParts.map((part) => [part.partNumber, part]),
  );
  let completedBytes = upload.uploadedParts.reduce(
    (total, part) => total + part.sizeBytes,
    0,
  );
  onProgress(Math.min(100, (completedBytes / file.size) * 100));

  for (let partNumber = 1; partNumber <= upload.partCount; partNumber += 1) {
    if (completed.has(partNumber)) continue;
    const start = (partNumber - 1) * upload.partSizeBytes;
    const end = Math.min(start + upload.partSizeBytes, file.size);
    const signed = await requestApi<{ expiresInSeconds: number; url: string }>(
      `/files/uploads/${upload.id}/parts/${partNumber}/url`,
      { method: "POST" },
    );
    const etag = await putPart(signed.url, file.slice(start, end), (loaded) => {
      onProgress(Math.min(99, ((completedBytes + loaded) / file.size) * 100));
    });
    const part = { etag, partNumber, sizeBytes: end - start };
    completed.set(partNumber, part);
    completedBytes += part.sizeBytes;
  }

  const result = await requestApi<StoredFile>(
    `/files/uploads/${upload.id}/complete`,
    {
      body: JSON.stringify({
        parts: [...completed.values()]
          .sort((left, right) => left.partNumber - right.partNumber)
          .map(({ etag, partNumber }) => ({ etag, partNumber })),
      }),
      method: "POST",
    },
  );
  window.localStorage.removeItem(key);
  onProgress(100);
  return result;
}

export const filesApi = {
  abortUpload(id: number) {
    return requestApi<{ id: number }>(`/files/uploads/${id}`, {
      method: "DELETE",
    });
  },
  createFolder(name: string, parentId: number | null) {
    return requestApi<FileFolder>("/files/folders", {
      body: JSON.stringify({ name, parentId }),
      method: "POST",
    });
  },
  deleteFile(id: number) {
    return requestApi<{ id: number }>(`/files/${id}`, { method: "DELETE" });
  },
  deleteFolder(id: number) {
    return requestApi<{ id: number }>(`/files/folders/${id}`, {
      method: "DELETE",
    });
  },
  duplicateFile(id: number, folderId: number | null) {
    return requestApi<StoredFile>(`/files/${id}/duplicate`, {
      body: JSON.stringify({ folderId }),
      method: "POST",
    });
  },
  getSignedUrl(id: number, inline: boolean) {
    return requestApi<{ expiresInSeconds: number; url: string }>(
      `/files/${id}/url?inline=${inline}`,
    );
  },
  getUsage() {
    return requestApi<FileUsage>("/files/usage");
  },
  listFiles(folderId: number | null, query: string) {
    return requestApi<StoredFile[]>(
      `/files${queryString({ folderId, q: query })}`,
    );
  },
  listFolders() {
    return requestApi<FileFolder[]>("/files/folders");
  },
  moveFolder(id: number, parentId: number | null) {
    return requestApi<FileFolder>(`/files/folders/${id}/move`, {
      body: JSON.stringify({ parentId }),
      method: "PATCH",
    });
  },
  patchFile(id: number, input: FilePatch) {
    return requestApi<StoredFile>(`/files/${id}`, {
      body: JSON.stringify(input),
      method: "PATCH",
    });
  },
  renameFolder(id: number, name: string) {
    return requestApi<FileFolder>(`/files/folders/${id}`, {
      body: JSON.stringify({ name }),
      method: "PATCH",
    });
  },
  upload: resumableUpload,
};

export function archiveUrl(input: {
  fileIds?: number[];
  folderIds?: number[];
  noteId?: number | null;
}) {
  return `/api/files/archive${queryString({
    folderIds: input.folderIds?.join(","),
    ids: input.fileIds?.join(","),
    noteId: input.noteId,
  })}`;
}
