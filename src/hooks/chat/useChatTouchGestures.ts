import { useRef, useCallback } from "react";

interface UseChatTouchGesturesOptions<T> {
  /** Called after a 500 ms long press. Only fires when provided. */
  onReply?: (msg: T) => void;
  /** Called after a 500 ms long press to perform a custom long-press action (e.g. open actions menu). If provided, takes precedence over `onReply`. */
  onLongPress?: (msg: T) => void;
  /** Called after a successful double-tap copy. */
  onCopyMessage?: () => void;
  /** Extract the plain-text content to copy from a message. */
  getContent: (msg: T) => string;
  /**
   * Return `false` to suppress long-press-to-reply for a specific message.
   * Defaults to always enabled when `onReply` is provided.
   */
  canReply?: (msg: T) => boolean;
}

/**
 * Provides **double-tap** (copy) and **long-press** (reply) touch gesture
 * handlers that can be attached to any chat message element.
 *
 * @example
 * const { handleTouchStart, handleTouchEnd, handleTouchMove } = useChatTouchGestures({ ... });
 * <div
 *   onTouchStart={() => handleTouchStart(msg)}
 *   onTouchEnd={() => handleTouchEnd(msg)}
 *   onTouchMove={handleTouchMove}
 * >
 */
export function useChatTouchGestures<T>({
  onReply,
  onLongPress,
  onCopyMessage,
  getContent,
  canReply,
}: UseChatTouchGesturesOptions<T>) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapTime = useRef<number>(0);
  const touchStartTime = useRef<number>(0);

  const copyMsg = useCallback(
    (msg: T) => {
      const text = getContent(msg);
      if (navigator.clipboard) {
        navigator.clipboard
          .writeText(text)
          .then(() => onCopyMessage?.())
          .catch(() => {});
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand("copy");
          onCopyMessage?.();
        } catch (_) {}
        document.body.removeChild(textArea);
      }
    },
    [getContent, onCopyMessage],
  );

  const handleTouchStart = useCallback(
    (msg: T) => {
      touchStartTime.current = Date.now();
      // Prefer an explicit long-press handler (e.g. open menu). Fall back
      // to `onReply` for backward compatibility.
      if (onLongPress) {
        longPressTimer.current = setTimeout(() => {
          longPressTimer.current = null;
          onLongPress(msg);
        }, 500);
      } else if (onReply && canReply?.(msg) !== false) {
        longPressTimer.current = setTimeout(() => {
          longPressTimer.current = null;
          onReply(msg);
        }, 500);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onReply, canReply],
  );

  const handleTouchEnd = useCallback(
    (msg: T) => {
      const elapsed = Date.now() - touchStartTime.current;
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      if (elapsed < 250) {
        const now = Date.now();
        if (now - lastTapTime.current < 300) {
          copyMsg(msg);
          lastTapTime.current = 0;
        } else {
          lastTapTime.current = now;
        }
      }
    },
    [copyMsg],
  );

  const handleTouchMove = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  return {
    handleTouchStart,
    handleTouchEnd,
    handleTouchMove,
    handleCopy: copyMsg,
  };
}
