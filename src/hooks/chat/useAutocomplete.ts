import { useState, useCallback } from "react";

interface UseAutocompleteOptions<T> {
  onSelect: (item: T) => void;
  onSend?: () => void;
  onClose?: () => void;
}

interface UseAutocompleteReturn<T> {
  results: T[];
  selectedIndex: number;
  isOpen: boolean;
  show: (items: T[]) => void;
  hide: () => void;
  setSelectedIndex: (i: number) => void;
  select: (index: number) => void;
  handleKeyDown: (e: React.KeyboardEvent) => boolean;
}

/**
 * Generic autocomplete state + keyboard navigation.
 * handleKeyDown returns true if the event was handled (caller should return early).
 */
export function useAutocomplete<T>({
  onSelect,
  onSend,
  onClose,
}: UseAutocompleteOptions<T>): UseAutocompleteReturn<T> {
  const [results, setResults] = useState<T[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);

  const show = useCallback((items: T[]) => {
    setResults(items);
    setSelectedIndex(-1);
    setIsOpen(true);
  }, []);

  const hide = useCallback(() => {
    setIsOpen(false);
    setResults([]);
    setSelectedIndex(-1);
  }, []);

  const select = useCallback(
    (index: number) => {
      if (results[index] !== undefined) {
        onSelect(results[index]);
        hide();
      }
    },
    [results, onSelect, hide],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (!isOpen || results.length === 0) return false;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((p) => Math.min(p + 1, results.length - 1));
          return true;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((p) => Math.max(p - 1, 0));
          return true;
        case "Enter":
        case "Tab": {
          if (selectedIndex >= 0 && results[selectedIndex] !== undefined) {
            e.preventDefault();
            onSelect(results[selectedIndex]);
            hide();
          } else if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            hide();
            onSend?.();
          }
          return true;
        }
        case "Escape":
          e.preventDefault();
          hide();
          onClose?.();
          return true;
        default:
          return false;
      }
    },
    [isOpen, results, selectedIndex, onSelect, onSend, hide, onClose],
  );

  return {
    results,
    selectedIndex,
    isOpen,
    show,
    hide,
    setSelectedIndex,
    select,
    handleKeyDown,
  };
}
