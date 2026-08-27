"use client";

import {
  dragAndDropFeature,
  hotkeysCoreFeature,
  isOrderedDragTarget,
  selectionFeature,
  syncDataLoaderFeature,
  type DragTarget,
} from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  GripVertical,
  Pin,
  Search,
  Star,
} from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

import type { NoteTreeNode } from "./notes-api";

const ROOT_ID = "root";

interface TreeData {
  children: string[];
  name: string;
  note: NoteTreeNode | null;
}

function filterNodes(
  nodes: NoteTreeNode[],
  query: string,
  tag: string | null,
  favoritesOnly: boolean,
): NoteTreeNode[] {
  if (!query && !tag && !favoritesOnly) return nodes;
  return nodes.flatMap((node) => {
    const children = filterNodes(node.children, query, tag, favoritesOnly);
    const matchesQuery =
      !query || node.name.toLocaleLowerCase("ru").includes(query);
    const matchesTag = !tag || node.tags.includes(tag);
    const matchesFavorite = !favoritesOnly || node.isFavorite;
    return (matchesQuery && matchesTag && matchesFavorite) ||
      children.length > 0
      ? [{ ...node, children }]
      : [];
  });
}

function buildData(nodes: NoteTreeNode[]) {
  const data = new Map<string, TreeData>();
  const visit = (node: NoteTreeNode) => {
    data.set(String(node.id), {
      children: node.children.map((child) => String(child.id)),
      name: node.name,
      note: node,
    });
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  data.set(ROOT_ID, {
    children: nodes.map((node) => String(node.id)),
    name: "Заметки",
    note: null,
  });
  return data;
}

export function NoteTree({
  favoritesOnly,
  nodes,
  onMove,
  onSelect,
  search,
  selectedId,
  tag,
}: {
  favoritesOnly: boolean;
  nodes: NoteTreeNode[];
  onMove(input: {
    id: number;
    parentId: number | null;
    position?: number;
    revision: number;
  }): void;
  onSelect(id: number): void;
  search: string;
  selectedId: number | null;
  tag: string | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const query = search.trim().toLocaleLowerCase("ru");
  const filtered = useMemo(
    () => filterNodes(nodes, query, tag, favoritesOnly),
    [favoritesOnly, nodes, query, tag],
  );
  const data = useMemo(() => buildData(filtered), [filtered]);
  const expanded = useMemo(
    () => [...data.keys()].filter((id) => id !== ROOT_ID),
    [data],
  );

  const handleDrop = (
    items: Parameters<
      NonNullable<Parameters<typeof useTree<TreeData>>[0]["onDrop"]>
    >[0],
    target: DragTarget<TreeData>,
  ) => {
    const moved = items[0]?.getItemData().note;
    if (!moved) return;
    const parent = target.item.getItemData().note;
    onMove({
      id: moved.id,
      parentId: parent?.id ?? null,
      ...(isOrderedDragTarget(target) ? { position: target.childIndex } : {}),
      revision: moved.revision,
    });
  };

  const tree = useTree<TreeData>({
    canDrag: (items) => items.every((item) => item.getId() !== ROOT_ID),
    canDrop: (items, target) =>
      items.every((item) => item.getId() !== target.item.getId()),
    canReorder: true,
    dataLoader: {
      getChildren: (id) => data.get(id)?.children ?? [],
      getItem: (id) => data.get(id) ?? { children: [], name: "", note: null },
    },
    features: [
      syncDataLoaderFeature,
      selectionFeature,
      hotkeysCoreFeature,
      dragAndDropFeature,
    ],
    getItemName: (item) => item.getItemData().name,
    indent: 18,
    initialState: {
      expandedItems: expanded,
      selectedItems: selectedId === null ? [] : [String(selectedId)],
    },
    isItemFolder: () => true,
    onDrop: handleDrop,
    onPrimaryAction: (item) => {
      const note = item.getItemData().note;
      if (note) onSelect(note.id);
    },
    rootItemId: ROOT_ID,
  });

  useEffect(() => {
    tree.setState({
      ...tree.getState(),
      expandedItems: expanded,
      selectedItems: selectedId === null ? [] : [String(selectedId)],
    });
    tree.rebuildTree();
  }, [data, expanded, selectedId, tree]);

  const items = tree.getItems();
  // React Compiler intentionally skips TanStack Virtual's imperative API.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    estimateSize: () => 48,
    getScrollElement: () => scrollRef.current,
    overscan: 7,
  });

  return (
    <div className="tree-scroll" ref={scrollRef}>
      <div
        {...tree.getContainerProps("Дерево заметок")}
        className="tree-virtual"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((row) => {
          const item = items[row.index];
          if (!item) return null;
          const note = item.getItemData().note;
          if (!note) return null;
          const hasChildren = note.children.length > 0;
          return (
            <button
              {...item.getProps()}
              aria-current={selectedId === note.id ? "page" : undefined}
              className={`tree-note tree-note--virtual ${selectedId === note.id ? "is-selected" : ""} ${item.isDragTarget() ? "is-drop-target" : ""}`}
              key={item.getKey()}
              style={{
                height: row.size,
                paddingLeft: 8 + item.getItemMeta().level * 18,
                transform: `translateY(${row.start}px)`,
              }}
              type="button"
            >
              <span className="tree-note__chevron">
                {hasChildren ? (
                  item.isExpanded() ? (
                    <ChevronDown size={13} />
                  ) : (
                    <ChevronRight size={13} />
                  )
                ) : (
                  <span />
                )}
              </span>
              <FileText aria-hidden="true" size={15} />
              <span>
                <strong>{note.name}</strong>
                <small>
                  {new Intl.DateTimeFormat("ru", {
                    day: "numeric",
                    month: "short",
                  }).format(new Date(note.updatedAt))}
                </small>
              </span>
              <span className="tree-note__signals">
                {note.isFavorite ? (
                  <Star
                    aria-label="В избранном"
                    fill="currentColor"
                    size={12}
                  />
                ) : null}
                {note.isPinned ? (
                  <Pin aria-label="Закреплено" size={12} />
                ) : null}
              </span>
              <GripVertical
                aria-hidden="true"
                className="tree-note__grip"
                size={13}
              />
            </button>
          );
        })}
        <i
          aria-hidden="true"
          className="tree-drop-line"
          style={tree.getDragLineStyle()}
        />
      </div>
      {items.length > 0 ? (
        <div
          {...tree.getRootItem().getProps()}
          aria-disabled={undefined}
          aria-expanded={undefined}
          aria-label={undefined}
          aria-level={undefined}
          aria-posinset={undefined}
          aria-selected={undefined}
          aria-setsize={undefined}
          className={`tree-root-drop ${tree.getRootItem().isDragTarget() ? "is-drop-target" : ""}`}
          role="presentation"
          tabIndex={-1}
        />
      ) : null}
      {items.length === 0 ? (
        <div className="tree-empty">
          <Search size={18} />
          <p>Ничего не найдено</p>
        </div>
      ) : null}
    </div>
  );
}
