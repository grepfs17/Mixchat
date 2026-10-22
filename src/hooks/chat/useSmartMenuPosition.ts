import { useRef, useEffect, useState } from "react";

const MARGIN = 8;

/**
 * Returns a ref to attach to the menu element and a `pos` object with the
 * adjusted top/left coordinates that keep the menu inside the viewport.
 * The initial value matches the raw click coordinates so there is no flash
 * on the first paint. The corrected position is applied after the first layout.
 */
export function useSmartMenuPosition(x: number, y: number) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({
    top: y,
    left: x,
  });

  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;

    const { offsetHeight, offsetWidth } = el;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top = y;
    let left = x;

    if (y + offsetHeight + MARGIN > vh) {
      top = Math.max(MARGIN, y - offsetHeight);
    }
    if (x + offsetWidth + MARGIN > vw) {
      left = Math.max(MARGIN, vw - offsetWidth - MARGIN);
    }

    setPos({ top, left });
  }, [x, y]);

  return { menuRef, pos };
}
