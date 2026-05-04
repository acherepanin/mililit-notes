import { ChevronDown, ChevronRight, FileText, Pencil, Pin, Save, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { IconButton } from '../../components/IconButton';
import { TooltipText } from '../../components/TooltipText';
import type { Translator } from '../../i18n';
import type { NoteTreeNode } from '../../types';

interface NotesTreeProps {
  nodes: NoteTreeNode[];
  selectedId: number | null;
  expanded: Set<number>;
  draggedId: number | null;
  onToggle: (id: number) => void;
  onSelect: (id: number) => void;
  onRename: (id: number, name: string) => void;
  onDelete: (id: number) => void;
  onDragStart: (id: number | null) => void;
  onDrop: (parentId: number | null) => void;
  t: Translator;
  isDraggable?: boolean;
}

export function NotesTree({
  nodes,
  selectedId,
  expanded,
  draggedId,
  onToggle,
  onSelect,
  onRename,
  onDelete,
  onDragStart,
  onDrop,
  t,
  isDraggable = true,
}: NotesTreeProps) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState('');

  const startEditing = (node: NoteTreeNode) => {
    setEditingId(node.id);
    setDraftName(node.name);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setDraftName('');
  };

  const saveEditing = (id: number) => {
    const normalizedName = draftName.trim();
    if (!normalizedName) {
      return;
    }

    onRename(id, normalizedName);
    cancelEditing();
  };

  const renderNodes = (items: NoteTreeNode[]) =>
    items.map((node) => {
      const isExpanded = expanded.has(node.id);
      const hasChildren = node.children.length > 0;
      const isActive = selectedId === node.id;
      const isEditing = editingId === node.id;

      return (
        <li
          className="tree__item"
          key={node.id}
          role="treeitem"
          aria-expanded={hasChildren ? isExpanded : undefined}
        >
          <div
            className={`tree__row ${isActive ? 'tree__row--active' : ''} ${draggedId === node.id ? 'tree__row--dragging' : ''}`}
            draggable={isDraggable && !isEditing}
            onDragStart={(event) => {
              if (!isDraggable || isEditing) {
                event.preventDefault();
                return;
              }

              onDragStart(node.id);
            }}
            onDragEnd={() => onDragStart(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onDrop(node.id);
            }}
          >
            <button
              className="tree__toggle"
              type="button"
              onClick={() => onToggle(node.id)}
              aria-label={isExpanded ? t('collapse') : t('expand')}
              disabled={!hasChildren}
            >
              {hasChildren ? (
                isExpanded ? (
                  <ChevronDown size={13} />
                ) : (
                  <ChevronRight size={13} />
                )
              ) : (
                <FileText size={13} />
              )}
            </button>

            {isEditing ? (
              <input
                className="tree__name-input"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    saveEditing(node.id);
                  }

                  if (event.key === 'Escape') {
                    cancelEditing();
                  }
                }}
                onClick={(event) => event.stopPropagation()}
                aria-label={t('noteName')}
                autoFocus
              />
            ) : (
              <button className="tree__name" type="button" onClick={() => onSelect(node.id)}>
                <TooltipText value={node.name} />
              </button>
            )}

            {node.isFavorite || node.isPinned ? (
              <div className="tree__badges" aria-hidden="true">
                {node.isFavorite ? <Star fill="currentColor" size={11} /> : null}
                {node.isPinned ? <Pin fill="currentColor" size={11} /> : null}
              </div>
            ) : null}

            <div className="tree__actions" onMouseDown={(event) => event.stopPropagation()}>
              {isEditing ? (
                <IconButton
                  label={t('save')}
                  icon={<Save size={13} />}
                  variant="primary"
                  className="tree__action"
                  onClick={() => saveEditing(node.id)}
                  disabled={!draftName.trim()}
                />
              ) : (
                <IconButton
                  label={t('editName')}
                  icon={<Pencil size={13} />}
                  className="tree__action"
                  onClick={() => startEditing(node)}
                />
              )}
              <IconButton
                label={t('delete')}
                icon={<Trash2 size={13} />}
                variant="danger"
                className="tree__action"
                onClick={() => onDelete(node.id)}
              />
            </div>
          </div>

          {hasChildren && isExpanded ? (
            <ul className="tree" role="group">
              {renderNodes(node.children)}
            </ul>
          ) : null}
        </li>
      );
    });

  return (
    <ul className="tree" role="tree">
      {renderNodes(nodes)}
    </ul>
  );
}
