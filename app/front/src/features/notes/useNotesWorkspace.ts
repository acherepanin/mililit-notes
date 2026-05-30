import { useCallback, useEffect, useMemo, useState } from 'react';

import { notesApi } from '../../api';
import type { Note, NoteDraft, NoteTreeFilter, NoteTreeNode, SaveStatus } from '../../types';
import {
  collectPinnedNodes,
  containsNodeId,
  countNotes,
  pruneSelectedNoteIds,
  countTreeMatches,
  filterTree,
  getFirstNodeId,
  getRootIds,
} from '../../utils/tree';

const emptyDraft: NoteDraft = {
  name: '',
  contentHtml: '',
  contentText: '',
};

interface RefreshTreeOptions {
  selectFirstWhenEmpty?: boolean;
}

export function useNotesWorkspace(isEnabled: boolean) {
  const [tree, setTree] = useState<NoteTreeNode[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [draft, setDraft] = useState<NoteDraft>(emptyDraft);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const [status, setStatus] = useState<SaveStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [treeFilter, setTreeFilter] = useState<NoteTreeFilter>({ kind: 'all' });
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<number>>(new Set());
  const [lastSelectedNoteId, setLastSelectedNoteId] = useState<number | null>(null);

  const visibleTree = useMemo(() => filterTree(tree, query, treeFilter), [query, tree, treeFilter]);
  const totalNotes = useMemo(() => countNotes(tree), [tree]);
  const favoriteCount = useMemo(() => countTreeMatches(tree, { kind: 'favorite' }), [tree]);
  const pinnedNodes = useMemo(() => collectPinnedNodes(tree), [tree]);

  const setActionError = useCallback((caught: unknown, fallback: string) => {
    setError(caught instanceof Error ? caught.message : fallback);
    setStatus('error');
  }, []);

  const refreshTree = useCallback(async (options: RefreshTreeOptions = {}) => {
    const nodes = await notesApi.getTree();
    setTree(nodes);
    setExpanded((current) => {
      const next = new Set(current);
      for (const id of getRootIds(nodes)) {
        next.add(id);
      }
      return next;
    });

    if (options.selectFirstWhenEmpty) {
      setSelectedId((current) => current ?? getFirstNodeId(nodes));
    }

    return nodes;
  }, []);

  const loadNote = useCallback(async (id: number) => {
    setStatus('loading');
    const note = await notesApi.getNote(id);
    setSelectedNote(note);
    setDraft({
      name: note.name,
      contentHtml: note.contentHtml,
      contentText: note.contentText,
    });
    setStatus('saved');
  }, []);

  const replaceSelectedNote = useCallback((note: Note) => {
    setSelectedNote((current) => (current?.id === note.id ? note : current));
    setStatus('saved');
  }, []);

  useEffect(() => {
    if (!isEnabled) {
      return;
    }

    refreshTree({ selectFirstWhenEmpty: true }).catch((caught: unknown) => {
      setActionError(caught, 'Не удалось загрузить дерево');
    });
  }, [isEnabled, refreshTree, setActionError]);

  useEffect(() => {
    if (!isEnabled) {
      return;
    }

    if (!selectedId) {
      setSelectedNote(null);
      setDraft(emptyDraft);
      return;
    }

    loadNote(selectedId).catch((caught: unknown) => {
      setActionError(caught, 'Не удалось загрузить заметку');
    });
  }, [isEnabled, loadNote, selectedId, setActionError]);

  const selectNote = useCallback((id: number) => {
    setSelectedNoteIds(new Set([id]));
    setLastSelectedNoteId(id);
    setSelectedId(id);
    setMobileTreeOpen(false);
  }, []);

  const clearNoteSelection = useCallback(() => {
    setSelectedNoteIds(new Set());
    setLastSelectedNoteId(null);
  }, []);

  const selectNoteItem = useCallback(
    (
      id: number,
      flatOrder: number[],
      modifiers: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
    ) => {
      const isMultiToggle = modifiers.ctrlKey || modifiers.metaKey;

      if (modifiers.shiftKey && lastSelectedNoteId !== null) {
        const start = flatOrder.indexOf(lastSelectedNoteId);
        const end = flatOrder.indexOf(id);
        if (start >= 0 && end >= 0) {
          const [from, to] = start < end ? [start, end] : [end, start];
          const next = isMultiToggle ? new Set(selectedNoteIds) : new Set<number>();
          flatOrder.slice(from, to + 1).forEach((noteId) => next.add(noteId));
          setSelectedNoteIds(next);
          setLastSelectedNoteId(id);
          setSelectedId(id);
          setMobileTreeOpen(false);
          return;
        }
      }

      if (isMultiToggle) {
        const wasSelected = selectedNoteIds.has(id);
        const next = new Set(selectedNoteIds);
        if (wasSelected) {
          next.delete(id);
        } else {
          next.add(id);
        }

        setSelectedNoteIds(next);
        setLastSelectedNoteId(id);

        if (next.size === 0) {
          setSelectedId(null);
          setSelectedNote(null);
          setDraft(emptyDraft);
        } else if (wasSelected && selectedId === id) {
          const fallbackId = [...next].at(-1) ?? null;
          setSelectedId(fallbackId);
          setMobileTreeOpen(false);
        } else if (!wasSelected) {
          setSelectedId(id);
          setMobileTreeOpen(false);
        }
        return;
      }

      selectNote(id);
    },
    [lastSelectedNoteId, selectNote, selectedId, selectedNoteIds],
  );

  const selectRoot = useCallback(() => {
    setSelectedId(null);
    setSelectedNote(null);
    setDraft(emptyDraft);
    clearNoteSelection();
  }, [clearNoteSelection]);

  const reconcileSelection = useCallback(
    (nodes: NoteTreeNode[]) => {
      let pruned = pruneSelectedNoteIds(nodes, selectedNoteIds);

      let nextSelectedId = selectedId;
      if (nextSelectedId === null || !containsNodeId(nodes, nextSelectedId)) {
        nextSelectedId = pruned.size > 0 ? [...pruned].at(-1)! : getFirstNodeId(nodes);
      }

      if (nextSelectedId === null) {
        setSelectedNoteIds(new Set());
        setLastSelectedNoteId(null);
        setSelectedId(null);
        setSelectedNote(null);
        setDraft(emptyDraft);
        return null;
      }

      if (!pruned.has(nextSelectedId)) {
        pruned = new Set(pruned);
        pruned.add(nextSelectedId);
      }

      setSelectedNoteIds(pruned);
      if (nextSelectedId !== selectedId) {
        setSelectedId(nextSelectedId);
      }
      return nextSelectedId;
    },
    [selectedId, selectedNoteIds],
  );

  const selectFirstNote = useCallback(() => {
    const nextId = getFirstNodeId(tree);
    if (nextId !== null) {
      setSelectedNoteIds(new Set([nextId]));
      setLastSelectedNoteId(nextId);
    }
    setSelectedId((current) => current ?? nextId);
    setMobileTreeOpen(false);
  }, [tree]);

  const toggleExpanded = useCallback((id: number) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const updateDraftName = useCallback((name: string) => {
    setDraft((current) => ({ ...current, name }));
    setStatus('idle');
  }, []);

  const updateDraftContent = useCallback((contentHtml: string, contentText: string) => {
    setDraft((current) => ({
      ...current,
      contentHtml,
      contentText,
    }));
    setStatus((currentStatus) => (currentStatus === 'loading' ? currentStatus : 'idle'));
  }, []);

  const createNote = useCallback(
    async (name: string, parentId: number | null) => {
      setStatus('saving');
      setError(null);
      const note = await notesApi.createNote({ name, parentId });
      await refreshTree();
      setExpanded((current) => {
        const next = new Set(current);
        next.add(parentId ?? note.id);
        return next;
      });
      setSelectedNoteIds(new Set([note.id]));
      setLastSelectedNoteId(note.id);
      setSelectedId(note.id);
      setStatus('saved');
    },
    [refreshTree],
  );

  const renameNote = useCallback(
    async (id: number, name: string) => {
      const normalizedName = name.trim();
      if (!normalizedName) {
        return;
      }

      setStatus('saving');
      setError(null);
      const note = await notesApi.updateNote(id, { name: normalizedName });
      setSelectedNote((current) =>
        current?.id === id ? { ...current, name: note.name, updatedAt: note.updatedAt } : current,
      );
      setDraft((current) => (selectedId === id ? { ...current, name: note.name } : current));
      await refreshTree();
      setStatus('saved');
    },
    [refreshTree, selectedId],
  );

  const saveCurrentNote = useCallback(
    async (contentHtml: string, contentText: string) => {
      if (!selectedNote) {
        return;
      }

      setStatus('saving');
      setError(null);
      const note = await notesApi.updateNote(selectedNote.id, {
        name: draft.name,
        contentHtml,
        contentText,
      });

      setSelectedNote(note);
      setDraft({
        name: note.name,
        contentHtml: note.contentHtml,
        contentText: note.contentText,
      });
      await refreshTree();
      setStatus('saved');
    },
    [draft.name, refreshTree, selectedNote],
  );

  const deleteCurrentNote = useCallback(async () => {
    if (!selectedNote) {
      return;
    }

    setStatus('saving');
    setError(null);
    await notesApi.deleteNote(selectedNote.id);
    const nodes = await refreshTree();
    const nextSelectedId = getFirstNodeId(nodes);
    setSelectedNoteIds(nextSelectedId !== null ? new Set([nextSelectedId]) : new Set());
    setLastSelectedNoteId(nextSelectedId);
    setSelectedId(nextSelectedId);
    if (nextSelectedId === null) {
      setSelectedNote(null);
      setDraft(emptyDraft);
    }
    setStatus('saved');
  }, [refreshTree, selectedNote]);

  const deleteNote = useCallback(
    async (id: number) => {
      setStatus('saving');
      setError(null);
      await notesApi.deleteNote(id);
      setSelectedNoteIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      const nodes = await refreshTree();
      const pruned = pruneSelectedNoteIds(nodes, selectedNoteIds);
      setSelectedNoteIds(pruned);

      const nextSelectedId =
        selectedId !== null && containsNodeId(nodes, selectedId)
          ? selectedId
          : pruned.size > 0
            ? [...pruned].at(-1)!
            : getFirstNodeId(nodes);

      if (nextSelectedId !== selectedId) {
        setSelectedNote(null);
        setDraft(emptyDraft);
      }

      setSelectedId(nextSelectedId);
      if (nextSelectedId !== null && !pruned.has(nextSelectedId)) {
        setSelectedNoteIds(new Set([nextSelectedId]));
      }
      setStatus('saved');
    },
    [refreshTree, selectedId, selectedNoteIds],
  );

  const deleteNotes = useCallback(
    async (ids: number[]) => {
      if (ids.length === 0) {
        return;
      }

      setStatus('saving');
      setError(null);
      for (const id of ids) {
        await notesApi.deleteNote(id);
      }
      const nodes = await refreshTree();
      const nextSelectedId = getFirstNodeId(nodes);
      setSelectedNoteIds(nextSelectedId !== null ? new Set([nextSelectedId]) : new Set());
      setLastSelectedNoteId(nextSelectedId);
      setSelectedId(nextSelectedId);
      if (nextSelectedId === null) {
        setSelectedNote(null);
        setDraft(emptyDraft);
      }
      setStatus('saved');
    },
    [refreshTree],
  );

  const moveDraggedNote = useCallback(
    async (parentId: number | null) => {
      if (!draggedId || draggedId === parentId) {
        setDraggedId(null);
        return;
      }

      setStatus('saving');
      setError(null);
      await notesApi.moveNote(draggedId, parentId);
      await refreshTree();
      setDraggedId(null);
      setStatus('saved');
    },
    [draggedId, refreshTree],
  );

  return {
    tree,
    visibleTree,
    selectedId,
    selectedNote,
    draft,
    expanded,
    status,
    error,
    query,
    treeFilter,
    favoriteCount,
    pinnedNodes,
    mobileTreeOpen,
    draggedId,
    selectedNoteIds,
    totalNotes,
    setQuery,
    setTreeFilter,
    setMobileTreeOpen,
    setDraggedId,
    refreshTree,
    loadNote,
    replaceSelectedNote,
    reconcileSelection,
    setActionError,
    selectNote,
    selectNoteItem,
    clearNoteSelection,
    selectRoot,
    selectFirstNote,
    toggleExpanded,
    updateDraftName,
    updateDraftContent,
    createNote,
    renameNote,
    saveCurrentNote,
    deleteCurrentNote,
    deleteNote,
    deleteNotes,
    moveDraggedNote,
  };
}
