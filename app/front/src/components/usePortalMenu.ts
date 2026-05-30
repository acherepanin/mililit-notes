import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';

export interface PortalMenuConfig {
  flipThreshold?: number;
  minHeight?: number;
  maxHeightCap?: number;
  gap?: number;
  minWidth?: number;
  matchAnchorWidth?: boolean;
  anchorMaxLeft?: number;
}

const defaultFlipThreshold = 232;
const defaultMinHeight = 120;
const defaultMaxHeightCap = 260;
const defaultGap = 5;
const defaultMinWidth = 0;
const defaultMatchAnchorWidth = true;
const defaultAnchorMaxLeft = Number.POSITIVE_INFINITY;

export function usePortalMenu(
  isOpen: boolean,
  setIsOpen: (open: boolean) => void,
  anchorRef: RefObject<HTMLElement | null>,
  menuRef: RefObject<HTMLElement | null>,
  rootRef?: RefObject<HTMLElement | null>,
  config: PortalMenuConfig = {},
) {
  const flipThreshold = config.flipThreshold ?? defaultFlipThreshold;
  const minHeight = config.minHeight ?? defaultMinHeight;
  const maxHeightCap = config.maxHeightCap ?? defaultMaxHeightCap;
  const gap = config.gap ?? defaultGap;
  const minWidth = config.minWidth ?? defaultMinWidth;
  const matchAnchorWidth = config.matchAnchorWidth ?? defaultMatchAnchorWidth;
  const anchorMaxLeft = config.anchorMaxLeft ?? defaultAnchorMaxLeft;

  const [direction, setDirection] = useState<'up' | 'down'>('down');
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});

  const close = useCallback(() => {
    setIsOpen(false);
  }, [setIsOpen]);

  const updateMenuPosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) {
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const freeBelow = window.innerHeight - rect.bottom;
    const freeAbove = rect.top;
    const nextDirection =
      freeBelow >= flipThreshold || freeBelow >= freeAbove ? 'down' : 'up';
    const maxHeight = Math.max(
      minHeight,
      Math.min(maxHeightCap, (nextDirection === 'down' ? freeBelow : freeAbove) - 12),
    );
    const width = matchAnchorWidth ? Math.max(rect.width, minWidth) : minWidth;

    setDirection((current) => (current === nextDirection ? current : nextDirection));
    setMenuStyle((current) => {
      const nextStyle: CSSProperties = {
        left: Math.min(rect.left, anchorMaxLeft),
        top: nextDirection === 'down' ? rect.bottom + gap : undefined,
        bottom: nextDirection === 'up' ? window.innerHeight - rect.top + gap : undefined,
        width: width || undefined,
        maxHeight,
      };

      if (
        current.left === nextStyle.left &&
        current.top === nextStyle.top &&
        current.bottom === nextStyle.bottom &&
        current.width === nextStyle.width &&
        current.maxHeight === nextStyle.maxHeight
      ) {
        return current;
      }

      return nextStyle;
    });
  }, [
    anchorMaxLeft,
    anchorRef,
    flipThreshold,
    gap,
    matchAnchorWidth,
    maxHeightCap,
    minHeight,
    minWidth,
  ]);

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    updateMenuPosition();
  }, [isOpen, updateMenuPosition]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);

    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [isOpen, updateMenuPosition]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const closeOnOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      const isInside =
        menuRef.current?.contains(target) ||
        rootRef?.current?.contains(target) ||
        (!rootRef && anchorRef.current?.contains(target));

      if (!isInside) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        anchorRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', closeOnOutside);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [anchorRef, isOpen, menuRef, rootRef, setIsOpen]);

  return {
    close,
    direction,
    menuStyle,
    updateMenuPosition,
  };
}
