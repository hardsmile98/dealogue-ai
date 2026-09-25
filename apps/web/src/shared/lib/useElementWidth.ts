import { useLayoutEffect, useRef, useState } from 'react';

/**
 * Ширина элемента в пикселях, живая при ресайзе (ResizeObserver). До
 * первого измерения — 0: рисовать по ширине стоит только после него.
 */
export function useElementWidth<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    setWidth(node.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);

  return { ref, width };
}
