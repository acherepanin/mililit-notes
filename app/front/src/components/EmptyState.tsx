import type { ReactNode } from 'react';

type EmptyStateTone = 'workspace' | 'panel' | 'inline' | 'plain';

interface EmptyStateProps {
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  tone?: EmptyStateTone;
  className?: string;
  children?: ReactNode;
}

export function EmptyState({
  title,
  hint,
  actionLabel,
  onAction,
  actionDisabled = false,
  tone = 'workspace',
  className = '',
  children,
}: EmptyStateProps) {
  const toneClass =
    tone === 'panel'
      ? 'empty-state--panel'
      : tone === 'inline'
        ? 'empty-state--inline'
        : tone === 'plain'
          ? 'empty-state--plain'
          : '';

  return (
    <div className={`empty-state ${toneClass} ${className}`.trim()}>
      <p className="empty-state__title">{title}</p>
      {hint ? <p className="empty-state__hint">{hint}</p> : null}
      {children}
      {actionLabel && onAction ? (
        <button
          type="button"
          className="empty-state__action"
          disabled={actionDisabled}
          onClick={onAction}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
