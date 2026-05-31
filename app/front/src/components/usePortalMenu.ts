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
    const freeBelow = window.innerHeight - rect.bottom - gap;
    const freeAbove = rect.top - gap;
    const width = matchAnchorWidth
      ? Math.max(rect.width, minWidth || rect.width)
      : Math.max(minWidth, rect.width);
    const nextDirection =
      freeBelow >= flipThreshold && freeBelow >= freeAbove
        ? 'down'
        : freeAbove >= freeBelow
          ? 'up'
          : 'down';
    const availableSpace = nextDirection === 'down' ? freeBelow : freeAbove;
    const maxHeight = Math.max(
      minHeight,
      Math.min(maxHeightCap, availableSpace - 8),
    );

    let left = rect.left;
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, rect.right - width);
    }
    left = Math.min(Math.max(8, left), Math.min(anchorMaxLeft, Math.max(8, window.innerWidth - width - 8)));

    setDirection((current) => (current === nextDirection ? current : nextDirection));
    setMenuStyle((current) => {
      const nextStyle: CSSProperties = {
        left,
        top: nextDirection === 'down' ? rect.bottom + gap : undefined,
        bottom: nextDirection === 'up' ? window.innerHeight - rect.top + gap : undefined,
        width,
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
