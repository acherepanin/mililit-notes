import type { NoteTreeNode } from '../types';

export function countNotes(nodes: NoteTreeNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countNotes(node.children), 0);
}

export function filterTree(nodes: NoteTreeNode[], query: string): NoteTreeNode[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return nodes;
  }

  return nodes
    .map((node) => {
      const children = filterTree(node.children, normalizedQuery);
      const matches = node.name.toLowerCase().includes(normalizedQuery);

      if (!matches && children.length === 0) {
        return null;
      }

      return { ...node, children };
    })
    .filter((node): node is NoteTreeNode => node !== null);
}

export function getRootIds(nodes: NoteTreeNode[]): number[] {
  return nodes.map((node) => node.id);
}

export function getFirstNodeId(nodes: NoteTreeNode[]): number | null {
  return nodes[0]?.id ?? null;
}

export function containsNodeId(nodes: NoteTreeNode[], id: number): boolean {
  return nodes.some((node) => node.id === id || containsNodeId(node.children, id));
}
