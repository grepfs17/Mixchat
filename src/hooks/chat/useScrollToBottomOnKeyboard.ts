import { useEffect, RefObject } from "react";

export function useScrollToBottomOnKeyboard(
  containerRef: RefObject<HTMLDivElement | null>,
  setIsAtBottom?: (atBottom: boolean) => void,
) {
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;

    const handleViewportResize = () => {
      if (containerRef.current) {
        containerRef.current.scrollTop = containerRef.current.scrollHeight;
        setIsAtBottom?.(true);
      }
    };

    window.visualViewport.addEventListener("resize", handleViewportResize);
    return () =>
      window.visualViewport?.removeEventListener(
        "resize",
        handleViewportResize,
      );
  }, [containerRef, setIsAtBottom]);
}
