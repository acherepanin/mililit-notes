export interface NoteRecord {
  id: number;
  user_id: number;
  name: string;
  content_html: string;
  content_text: string;
  parent_id: number | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface NoteResponse {
  id: number;
  userId: number;
  name: string;
  contentHtml: string;
  contentText: string;
  parentId: number | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface NoteTreeNode {
  id: number;
  name: string;
  parentId: number | null;
  children: NoteTreeNode[];
}
