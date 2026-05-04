import { useEffect, useRef } from 'react';

function scrollHorizontally(event: WheelEvent, element: HTMLElement) {
  const hasHorizontalScroll = element.scrollWidth > element.clientWidth + 1;
  const hasVerticalScroll = element.scrollHeight > element.clientHeight + 1;

  if (!hasHorizontalScroll || (hasVerticalScroll && !event.shiftKey)) {
    return;
  }

  const dominantDelta =
    Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;

  if (dominantDelta === 0) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  element.scrollLeft += dominantDelta;
}

export function useHorizontalWheel<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return;
    }

    const onWheel = (event: WheelEvent) => scrollHorizontally(event, element);

    element.addEventListener('wheel', onWheel, { capture: true, passive: false });

    return () => {
      element.removeEventListener('wheel', onWheel, { capture: true });
    };
  }, []);

  return ref;
}
