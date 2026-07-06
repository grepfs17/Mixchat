import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type RefObject,
} from "react";
import { isMobileDevice } from "../../lib/device";
import type { UseAutocompleteReturn } from "./useAutocomplete";

interface UseAutocompleteMenuOptions {
  inputRef: RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  autocompleteInstances: UseAutocompleteReturn<any>[];
}

interface UseAutocompleteMenuReturn {
  menuRect: DOMRect | null;
  menuRef: React.RefObject<HTMLDivElement | null>;
  closeAll: () => void;
}

export function useAutocompleteMenu({
  inputRef,
  autocompleteInstances,
}: UseAutocompleteMenuOptions): UseAutocompleteMenuReturn {
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Derive isOpen states for dependency arrays
  const openStates = useMemo(
    () => autocompleteInstances.map((ac) => ac.isOpen),
    [autocompleteInstances],
  );

  const selectedIndices = useMemo(
    () => autocompleteInstances.map((ac) => [ac.isOpen, ac.selectedIndex]),
    [autocompleteInstances],
  );

  // Track input rect when any autocomplete opens
  useEffect(() => {
    const anyOpen = openStates.some(Boolean);
    if (!anyOpen || !inputRef.current) {
      setMenuRect(null);
      return;
    }
    setMenuRect(inputRef.current.getBoundingClientRect());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, openStates);

  // Scroll selected item into view
  useEffect(() => {
    for (const ac of autocompleteInstances) {
      if (ac.isOpen && menuRef.current && ac.selectedIndex >= 0) {
        const el = menuRef.current.children[ac.selectedIndex] as HTMLElement;
        el?.scrollIntoView(
          isMobileDevice()
            ? { inline: "nearest", block: "nearest" }
            : { block: "nearest" },
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, selectedIndices);

  const closeAll = useCallback(() => {
    autocompleteInstances.forEach((ac) => ac.hide());
  }, [autocompleteInstances]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        inputRef.current &&
        !inputRef.current.contains(target)
      ) {
        closeAll();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [closeAll, inputRef]);

  return { menuRect, menuRef, closeAll };
}
