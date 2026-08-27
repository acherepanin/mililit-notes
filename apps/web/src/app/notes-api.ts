import { ApiError } from "./client-providers";

export interface NoteTreeNode {
  children: NoteTreeNode[];
  id: number;
  isFavorite: boolean;
  isPinned: boolean;
  name: string;
  parentId: number | null;
  position: number;
  revision: number;
  tags: string[];
  updatedAt: string;
}

export interface NoteRecord extends Omit<NoteTreeNode, "children"> {
  attachmentFolderId: number | null;
  contentHtml: string;
  contentText: string;
  createdAt: string;
  deletedAt: string | null;
  userId: number;
}

export interface NoteVersion {
  contentHtml: string;
  contentText: string;
  createdAt: string;
  id: number;
  name: string;
  noteId: number;
}

export interface NoteSearchResult {
  id: number;
  name: string;
  snippet: string;
  tags: string[];
  updatedAt: string;
}

export interface NoteTemplate {
  contentHtml: string;
  contentText: string;
  createdAt: string;
  id: number;
  isSystem: boolean;
  name: string;
  updatedAt: string;
}

export interface TagRecord {
  color: string | null;
  id: number;
  name: string;
}

export interface ShareLink {
  accessCount: number;
  createdAt: string;
  expiresAt: string;
  id: number;
  includeSecrets: boolean;
  lastAccessedAt: string | null;
  maxAccessCount: number | null;
  noteId: number;
  oneTime: boolean;
  revokedAt: string | null;
  url: string;
}

export interface WorkspaceExport {
  exportedAt: string;
  formatVersion: 1;
  notes: Array<
    Pick<
      NoteRecord,
      | "contentHtml"
      | "contentText"
      | "id"
      | "isFavorite"
      | "isPinned"
      | "name"
      | "parentId"
      | "position"
      | "tags"
    >
  >;
  templates: Array<Pick<NoteTemplate, "contentHtml" | "contentText" | "name">>;
}

interface ApiErrorBody {
  code?: string;
  message?: string | string[];
}

export async function requestApi<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init?.body === undefined
        ? {}
        : { "content-type": "application/json" }),
      ...init?.headers,
    },
  });
  const text = await response.text();
  if (!response.ok) {
    let body: ApiErrorBody = {};
    try {
      body = text ? (JSON.parse(text) as ApiErrorBody) : {};
    } catch {
      // Non-JSON upstream errors use the generic recovery message below.
    }
    const message = Array.isArray(body.message)
      ? body.message.join(". ")
      : body.message;
    throw new ApiError(
      message ?? "Не удалось выполнить запрос. Повторите попытку.",
      response.status,
      body.code,
    );
  }
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

const request = requestApi;

export const notesApi = {
  create(input: { name: string; parentId: number | null }) {
    return request<NoteRecord>("/notes", {
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  get(id: number) {
    return request<NoteRecord>(`/notes/${id}`);
  },
  search(query: string) {
    return request<NoteSearchResult[]>(
      `/notes/search?q=${encodeURIComponent(query)}`,
    );
  },
  getTree() {
    return request<NoteTreeNode[]>("/notes/tree");
  },
  getTags() {
    return request<TagRecord[]>("/notes/tags");
  },
  getTrash() {
    return request<NoteRecord[]>("/notes/trash");
  },
  getVersions(id: number) {
    return request<NoteVersion[]>(`/notes/${id}/versions`);
  },
  move(
    id: number,
    input: { parentId: number | null; position?: number; revision: number },
  ) {
    return request<NoteRecord>(`/notes/${id}/move`, {
      body: JSON.stringify(input),
      method: "PATCH",
    });
  },
  remove(id: number, revision: number) {
    return request<NoteRecord>(`/notes/${id}`, {
      body: JSON.stringify({ revision }),
      method: "DELETE",
    });
  },
  removePermanently(id: number, revision: number) {
    return request<{ id: number }>(`/notes/${id}/permanent`, {
      body: JSON.stringify({ revision }),
      method: "DELETE",
    });
  },
  restore(id: number, revision: number) {
    return request<NoteRecord>(`/notes/${id}/restore`, {
      body: JSON.stringify({ revision }),
      method: "POST",
    });
  },
  restoreVersion(id: number, versionId: number, revision: number) {
    return request<NoteRecord>(`/notes/${id}/versions/${versionId}/restore`, {
      body: JSON.stringify({ revision }),
      method: "POST",
    });
  },
  setTags(id: number, revision: number, tags: string[]) {
    return request<NoteRecord>(`/notes/${id}/tags`, {
      body: JSON.stringify({ revision, tags }),
      method: "PATCH",
    });
  },
  update(
    id: number,
    input: Partial<
      Pick<
        NoteRecord,
        "contentHtml" | "contentText" | "isFavorite" | "isPinned" | "name"
      >
    > & { revision: number },
  ) {
    return request<NoteRecord>(`/notes/${id}`, {
      body: JSON.stringify(input),
      method: "PATCH",
    });
  },
};

export const workspaceApi = {
  createFromTemplate(templateId: number, parentId: number | null) {
    return request<NoteRecord>("/notes/from-template", {
      body: JSON.stringify({ parentId, templateId }),
      method: "POST",
    });
  },
  createShare(
    noteId: number,
    input: { includeSecrets: boolean; oneTime: boolean; ttlHours: number },
  ) {
    return request<ShareLink>(`/notes/${noteId}/share-links`, {
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  createTemplate(input: {
    contentHtml: string;
    contentText: string;
    name: string;
  }) {
    return request<NoteTemplate>("/templates", {
      body: JSON.stringify(input),
      method: "POST",
    });
  },
  exportJson() {
    return request<WorkspaceExport>("/export/json");
  },
  importJson(input: unknown) {
    return request<{ importedNotes: number; importedTemplates: number }>(
      "/import/json",
      { body: JSON.stringify(input), method: "POST" },
    );
  },
  listShares(noteId: number) {
    return request<ShareLink[]>(`/notes/${noteId}/share-links`);
  },
  listTemplates() {
    return request<NoteTemplate[]>("/templates");
  },
  updateTemplate(
    id: number,
    input: { contentHtml: string; contentText: string; name: string },
  ) {
    return request<NoteTemplate>(`/templates/${id}`, {
      body: JSON.stringify(input),
      method: "PATCH",
    });
  },
  removeTemplate(id: number) {
    return request<{ id: number }>(`/templates/${id}`, { method: "DELETE" });
  },
  revokeShare(id: number) {
    return request<{ id: number }>(`/share-links/${id}`, { method: "DELETE" });
  },
};
