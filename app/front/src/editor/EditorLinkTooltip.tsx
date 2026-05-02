import type { CSSProperties, RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface LinkTooltipState {
  href: string;
  style: CSSProperties;
}

interface EditorLinkTooltipProps {
  containerRef: RefObject<HTMLElement | null>;
  isEditing: boolean;
}

function findAnchor(target: EventTarget | null, root: HTMLElement): HTMLAnchorElement | null {
  if (!(target instanceof Element)) {
    return null;
  }

  const anchor = target.closest<HTMLAnchorElement>('a[href]');
  return anchor && root.contains(anchor) ? anchor : null;
}

export function EditorLinkTooltip({ containerRef, isEditing }: EditorLinkTooltipProps) {
  const [tooltip, setTooltip] = useState<LinkTooltipState | null>(null);
  const anchorRef = useRef<HTMLAnchorElement | null>(null);

  const updateTooltip = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor || !isEditing) {
      setTooltip(null);
      return;
    }

    const href = anchor.getAttribute('href');
    if (!href) {
      setTooltip(null);
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const top = rect.top > 56 ? rect.top - 8 : rect.bottom + 8;
    const placement = rect.top > 56 ? 'up' : 'down';

    setTooltip({
      href,
      style: {
        left: Math.min(Math.max(rect.left + rect.width / 2, 16), window.innerWidth - 16),
        top,
        transform: placement === 'up' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
      },
    });
  }, [isEditing]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) {
      return;
    }

    const showTooltip = (event: PointerEvent | FocusEvent) => {
      if (!isEditing) {
        return;
      }

      const anchor = findAnchor(event.target, root);
      if (!anchor) {
        return;
      }

      anchorRef.current = anchor;
      updateTooltip();
    };

    const hideTooltip = () => {
      anchorRef.current = null;
      setTooltip(null);
    };

    const openLink = (event: MouseEvent) => {
      if (isEditing) {
        return;
      }

      const anchor = findAnchor(event.target, root);
      const href = anchor?.getAttribute('href');
      if (!anchor || !href) {
        return;
      }

      event.preventDefault();
      window.open(href, anchor.target || '_blank', 'noopener,noreferrer');
    };

    root.addEventListener('pointerover', showTooltip);
    root.addEventListener('focusin', showTooltip);
    root.addEventListener('pointerout', hideTooltip);
    root.addEventListener('focusout', hideTooltip);
    root.addEventListener('click', openLink);
    window.addEventListener('resize', updateTooltip);
    window.addEventListener('scroll', updateTooltip, true);

    return () => {
      root.removeEventListener('pointerover', showTooltip);
      root.removeEventListener('focusin', showTooltip);
      root.removeEventListener('pointerout', hideTooltip);
      root.removeEventListener('focusout', hideTooltip);
      root.removeEventListener('click', openLink);
      window.removeEventListener('resize', updateTooltip);
      window.removeEventListener('scroll', updateTooltip, true);
    };
  }, [containerRef, isEditing, updateTooltip]);

  return tooltip
    ? createPortal(
        <span className="app-tooltip editor-link-tooltip" role="tooltip" style={tooltip.style}>
          {tooltip.href}
        </span>,
        document.body,
      )
    : null;
}
