import type { NoteTreeNode } from "./notes.types.js";

export type FlatTreeNote = Omit<NoteTreeNode, "children">;

export function buildNoteTree(rows: FlatTreeNote[]): NoteTreeNode[] {
  const nodes = new Map<number, NoteTreeNode>();
  for (const row of rows) {
    nodes.set(row.id, { ...row, children: [] });
  }

  const roots: NoteTreeNode[] = [];
  for (const row of rows) {
    const node = nodes.get(row.id);
    if (!node) continue;
    const parent = row.parentId === null ? undefined : nodes.get(row.parentId);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export function wouldCreateCycle(
  rows: Array<{ id: number; parentId: number | null }>,
  noteId: number,
  parentId: number | null,
): boolean {
  if (parentId === null) return false;
  const parentById = new Map(rows.map((row) => [row.id, row.parentId]));
  const visited = new Set<number>();
  let current: number | null | undefined = parentId;
  while (current !== null && current !== undefined && !visited.has(current)) {
    if (current === noteId) return true;
    visited.add(current);
    current = parentById.get(current);
  }
  return false;
}

export function reorderIds(
  orderedIds: number[],
  movingId: number,
  requestedPosition: number | undefined,
): number[] {
  const withoutMoving = orderedIds.filter((id) => id !== movingId);
  const position = Math.min(
    Math.max(requestedPosition ?? withoutMoving.length, 0),
    withoutMoving.length,
  );
  withoutMoving.splice(position, 0, movingId);
  return withoutMoving;
}
