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

  // Auto-scroll when at bottom
  useEffect(() => {
    if (containerRef.current && isAtBottom) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, isAtBottom, containerRef]);

  useScrollToBottomOnKeyboard(containerRef, setIsAtBottom);

  // Detect scroll position
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleScroll = () => {
      const atBottom =
        el.scrollHeight - el.scrollTop - el.clientHeight < 50;
      setIsAtBottom(atBottom);
      if (atBottom) {
        setNewMessagesCount(0);
        prevLastItemRef.current = lastItemRef.current;
      }
    };
    el.addEventListener("scroll", handleScroll);
    return () => {
      el.removeEventListener("scroll", handleScroll);
    };
  }, [containerRef]);

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
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      setIsAtBottom(true);
      setNewMessagesCount(0);
      prevLastItemRef.current = lastItemRef.current;
    }
  }, [containerRef]);

  return { isAtBottom, newMessagesCount, scrollToBottom };
}
