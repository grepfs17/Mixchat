import { useEffect, useCallback, useRef, useState, RefObject } from "react";
import { useScrollToBottomOnKeyboard } from "./useScrollToBottomOnKeyboard";

interface UseChatAutoScrollOptions {
  containerRef: RefObject<HTMLDivElement | null>;
  messages: unknown[];
}

export function useChatAutoScroll({
  containerRef,
  messages,
}: UseChatAutoScrollOptions) {
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [newMessagesCount, setNewMessagesCount] = useState(0);

  // Track the last message identity to detect new messages even when the
  // array length is capped (e.g. MAX_DISPLAYED_MESSAGES). Comparing lengths
  // fails when old messages are sliced off the front as new ones are appended.
  const prevLastItemRef = useRef<unknown>(null);
  const lastItemRef = useRef<unknown>(null);
  useEffect(() => {
    lastItemRef.current =
      messages.length > 0 ? messages[messages.length - 1] : undefined;
  }, [messages]);

  // Flag set during programmatic scrolls (auto-scroll or manual scrollToBottom)
  // so the scroll handler does not falsely flip isAtBottom to false when
  // messages are arriving faster than the browser can lay them out.
  const isAutoScrollingRef = useRef(false);

  // Keep a ref in sync with isAtBottom so the ResizeObserver callback
  // always reads the current value (avoids stale closure).
  const isAtBottomRef = useRef(isAtBottom);
  isAtBottomRef.current = isAtBottom;

  // Track the last seen scrollHeight so the ResizeObserver only scrolls
  // when the content actually grows (e.g. late image/emote loads).
  const lastScrollHeightRef = useRef(0);

  // Auto-scroll when at bottom.
  // Defer the scroll via rAF so the browser has completed layout for the
  // new messages — otherwise scrollHeight can be stale for multi-line text
  // and the view ends up above the true bottom.
  useEffect(() => {
    if (!containerRef.current || !isAtBottom) return;
    const el = containerRef.current;
    isAutoScrollingRef.current = true;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
      lastScrollHeightRef.current = el.scrollHeight;
      requestAnimationFrame(() => {
        isAutoScrollingRef.current = false;
      });
    });
  }, [messages, isAtBottom, containerRef]);

  useScrollToBottomOnKeyboard(containerRef, setIsAtBottom);

  // Detect scroll position
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleScroll = () => {
      if (isAutoScrollingRef.current) return;
      const atBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight < 50;
      setIsAtBottom(atBottom);
      if (atBottom) {
        setNewMessagesCount(0);
        prevLastItemRef.current = lastItemRef.current;
        lastScrollHeightRef.current = el.scrollHeight;
      }
    };
    el.addEventListener("scroll", handleScroll);
    return () => {
      el.removeEventListener("scroll", handleScroll);
    };
  }, [containerRef]);

  // ResizeObserver safety net: catches late layout changes after the
  // primary rAF scroll — e.g. custom emote images loading in, font
  // metrics updating, or async content expanding the message height.
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return;
    const el = containerRef.current;
    if (!el) return;

    // Seed the baseline so we only react to growth, not the initial entry.
    lastScrollHeightRef.current = el.scrollHeight;

    const observer = new ResizeObserver(() => {
      // Bail if a programmatic scroll is already in progress, or if the
      // user has scrolled up since the observer was created.
      if (isAutoScrollingRef.current || !isAtBottomRef.current) return;

      const newHeight = el.scrollHeight;
      if (newHeight > lastScrollHeightRef.current) {
        isAutoScrollingRef.current = true;
        el.scrollTop = newHeight;
        lastScrollHeightRef.current = newHeight;
        requestAnimationFrame(() => {
          isAutoScrollingRef.current = false;
        });
      } else {
        lastScrollHeightRef.current = newHeight;
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [containerRef, isAtBottom]);

  // Count new messages when scrolled up
  useEffect(() => {
    const lastItem =
      messages.length > 0 ? messages[messages.length - 1] : undefined;
    const prev = prevLastItemRef.current;

    if (!isAtBottom && prev != null && lastItem !== prev) {
      // Find where the previous last item sits in the new array.
      // Everything after it is a new message.
      const idx = messages.indexOf(prev);
      const diff = idx >= 0 ? messages.length - 1 - idx : 1;
      if (diff > 0) {
        setNewMessagesCount((p) => p + diff);
      }
    }

    prevLastItemRef.current = lastItem;
  }, [messages, isAtBottom]);

  const scrollToBottom = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    isAutoScrollingRef.current = true;
    setIsAtBottom(true);
    setNewMessagesCount(0);
    prevLastItemRef.current = lastItemRef.current;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
      lastScrollHeightRef.current = el.scrollHeight;
      requestAnimationFrame(() => {
        isAutoScrollingRef.current = false;
      });
    });
  }, [containerRef]);

  return { isAtBottom, newMessagesCount, scrollToBottom };
}
