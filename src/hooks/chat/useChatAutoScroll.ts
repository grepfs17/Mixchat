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
  const prevCountRef = useRef(0);
  const messagesLengthRef = useRef(messages.length);
  messagesLengthRef.current = messages.length;

  useEffect(() => {
    if (containerRef.current && isAtBottom) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages, isAtBottom, containerRef]);

  useScrollToBottomOnKeyboard(containerRef, setIsAtBottom);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) setIsAtBottom(false);
    };
    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      const prev = (el as HTMLDivElement & { __lastTouchY?: number })
        .__lastTouchY;
      if (prev !== undefined && touch.clientY > prev) setIsAtBottom(false);
      (el as HTMLDivElement & { __lastTouchY?: number }).__lastTouchY =
        touch.clientY;
    };
    const handleTouchEnd = () => {
      delete (el as HTMLDivElement & { __lastTouchY?: number }).__lastTouchY;
    };
    const handleScroll = () => {
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 50) {
        setIsAtBottom(true);
        setNewMessagesCount(0);
        prevCountRef.current = messagesLengthRef.current;
      }
    };
    el.addEventListener("wheel", handleWheel, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: true });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });
    el.addEventListener("scroll", handleScroll);
    return () => {
      el.removeEventListener("wheel", handleWheel);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
      el.removeEventListener("scroll", handleScroll);
    };
  }, [containerRef]);

  useEffect(() => {
    if (!isAtBottom) {
      const diff = messages.length - prevCountRef.current;
      if (diff > 0) setNewMessagesCount((p) => p + diff);
    } else {
      prevCountRef.current = messages.length;
    }
  }, [messages, isAtBottom]);

  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      setIsAtBottom(true);
      setNewMessagesCount(0);
      prevCountRef.current = messagesLengthRef.current;
    }
  }, [containerRef]);

  return { isAtBottom, newMessagesCount, scrollToBottom };
}
