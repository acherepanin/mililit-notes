import { useCallback, useEffect, useMemo, useState } from 'react';

import { notesApi } from '../../api';
import type { Note, NoteDraft, NoteTreeFilter, NoteTreeNode, SaveStatus } from '../../types';
import {
  collectPinnedNodes,
  containsNodeId,
  countNotes,
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
    setSelectedId(id);
    setMobileTreeOpen(false);
  }, []);

  const selectRoot = useCallback(() => {
    setSelectedId(null);
    setSelectedNote(null);
    setDraft(emptyDraft);
  }, []);

  const reconcileSelection = useCallback(
    (nodes: NoteTreeNode[]) => {
      if (selectedId !== null && containsNodeId(nodes, selectedId)) {
        return selectedId;
      }

      setSelectedId(null);
      setSelectedNote(null);
      setDraft(emptyDraft);
      return null;
    },
    [selectedId],
  );

  const selectFirstNote = useCallback(() => {
    setSelectedId((current) => current ?? getFirstNodeId(tree));
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
    setSelectedId(null);
    setSelectedNote(null);
    setDraft(emptyDraft);
    const nodes = await refreshTree();
    setSelectedId(getFirstNodeId(nodes));
    setStatus('saved');
  }, [refreshTree, selectedNote]);

  const deleteNote = useCallback(
    async (id: number) => {
      setStatus('saving');
      setError(null);
      await notesApi.deleteNote(id);
      const nodes = await refreshTree();
      const nextSelectedId =
        selectedId !== null && containsNodeId(nodes, selectedId)
          ? selectedId
          : getFirstNodeId(nodes);

      if (nextSelectedId !== selectedId) {
        setSelectedNote(null);
        setDraft(emptyDraft);
      }

      setSelectedId(nextSelectedId);
      setStatus('saved');
    },
    [refreshTree, selectedId],
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
    moveDraggedNote,
  };
}
