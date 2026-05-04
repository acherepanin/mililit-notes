import type { NoteTreeFilter, NoteTreeNode } from '../types';

export function countNotes(nodes: NoteTreeNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countNotes(node.children), 0);
}

function matchesFilter(node: NoteTreeNode, filter: NoteTreeFilter): boolean {
  if (filter.kind === 'favorite') {
    return node.isFavorite;
  }

  if (filter.kind === 'tag') {
    return node.tags.some((tag) => tag.toLowerCase() === filter.tag.toLowerCase());
  }

  return true;
}

function matchesQuery(node: NoteTreeNode, normalizedQuery: string): boolean {
  return (
    !normalizedQuery ||
    node.name.toLowerCase().includes(normalizedQuery) ||
    node.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery))
  );
}

function flattenTree(nodes: NoteTreeNode[]): NoteTreeNode[] {
  return nodes.flatMap((node) => [{ ...node, children: [] }, ...flattenTree(node.children)]);
}

export function filterTree(
  nodes: NoteTreeNode[],
  query: string,
  filter: NoteTreeFilter = { kind: 'all' },
): NoteTreeNode[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (filter.kind !== 'all') {
    return flattenTree(nodes).filter(
      (node) => matchesQuery(node, normalizedQuery) && matchesFilter(node, filter),
    );
  }

  if (!normalizedQuery && filter.kind === 'all') {
    return nodes;
  }

  return nodes
    .map((node) => {
      const children = filterTree(node.children, normalizedQuery, filter);
      const matches = matchesQuery(node, normalizedQuery);

      if (!matches && children.length === 0) {
        return null;
      }

      return { ...node, children };
    })
    .filter((node): node is NoteTreeNode => node !== null);
}

export function countTreeMatches(nodes: NoteTreeNode[], filter: NoteTreeFilter): number {
  return nodes.reduce(
    (sum, node) =>
      sum + (matchesFilter(node, filter) ? 1 : 0) + countTreeMatches(node.children, filter),
    0,
  );
}

export function collectPinnedNodes(nodes: NoteTreeNode[]): NoteTreeNode[] {
  return flattenTree(nodes).filter((node) => node.isPinned);
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
