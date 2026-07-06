import { useCallback, useRef, type RefObject } from "react";

interface UseInsertAtCursorOptions {
  message: string;
  setMessage: (val: string) => void;
  inputRef: RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
}

interface UseInsertAtCursorReturn {
  insertWithPrefix: (name: string, prefix?: string) => void;
  insertAtPosition: (before: string, text: string, after?: string) => void;
  replaceCurrentWord: (text: string) => void;
}

export function useInsertAtCursor({
  message,
  setMessage,
  inputRef,
}: UseInsertAtCursorOptions): UseInsertAtCursorReturn {
  const focusTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const focusInput = useCallback(
    (pos: number) => {
      if (focusTimeout.current) clearTimeout(focusTimeout.current);
      focusTimeout.current = setTimeout(() => {
        inputRef.current?.setSelectionRange(pos, pos);
        inputRef.current?.focus();
      }, 0);
    },
    [inputRef],
  );

  const insertWithPrefix = useCallback(
    (name: string, prefix = "") => {
      if (!inputRef.current) return;
      const cursor = inputRef.current.selectionStart ?? message.length;
      const before = message.substring(0, cursor);
      const after = message.substring(cursor);
      const lastSpace = before.lastIndexOf(" ");
      const beforeWord = before.substring(0, lastSpace + 1);
      const newVal = beforeWord + prefix + name + " " + after;
      setMessage(newVal);
      focusInput((beforeWord + prefix + name + " ").length);
    },
    [message, setMessage, inputRef, focusInput],
  );

  const insertAtPosition = useCallback(
    (before: string, text: string, after = " ") => {
      if (!inputRef.current) return;
      const newVal = before + text + after;
      setMessage(newVal);
      focusInput((before + text + after).length);
    },
    [setMessage, inputRef, focusInput],
  );

  const replaceCurrentWord = useCallback(
    (text: string) => {
      if (!inputRef.current) return;
      const cursor = inputRef.current.selectionStart ?? message.length;
      const after = message.substring(cursor);
      const newVal = text + " " + after;
      setMessage(newVal);
      focusInput((text + " ").length);
    },
    [message, setMessage, inputRef, focusInput],
  );

  return { insertWithPrefix, insertAtPosition, replaceCurrentWord };
}
