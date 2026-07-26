import React from "react";
import { createPortal } from "react-dom";
import { isMobileDevice } from "../../../lib/device";

interface AutocompleteMenuProps<T> {
  isOpen: boolean;
  results: T[];
  selectedIndex: number;
  menuRect: DOMRect | null;
  maxHeight?: string;
  menuRef?: React.RefObject<HTMLDivElement | null>;
  onSelect: (index: number) => void;
  renderItem: (item: T, index: number, isSelected: boolean) => React.ReactNode;
  className?: string;
}

export default function AutocompleteMenu<T>({
  isOpen,
  results,
  selectedIndex,
  menuRect,
  maxHeight = "40vh",
  menuRef,
  onSelect,
  renderItem,
  className = "autocomplete-menu",
}: AutocompleteMenuProps<T>) {
  if (!isOpen || results.length === 0 || !menuRect) return null;

  const isMobile = isMobileDevice();

  return createPortal(
    <div
      ref={menuRef}
      className={className}
      style={{
        position: "fixed",
        bottom: window.innerHeight - menuRect.top + 6,
        left: isMobile ? 0 : menuRect.left,
        ...(isMobile ? { right: 0 } : { width: menuRect.width }),
        maxHeight: isMobile ? "60px" : maxHeight,
        ...(isMobile
          ? {
              display: "flex",
              flexDirection: "row",
              overflowX: "auto",
              overflowY: "hidden",
              scrollbarWidth: "none",
              gap: 4,
              padding: "4px 8px",
              background: "var(--color-autocomplete-bg)",
              borderTop: "1px solid var(--color-autocomplete-border)",
              borderBottom: "1px solid var(--color-autocomplete-border)",
            }
          : {}),
      }}
    >
      {results.map((item, index) =>
        renderItem(item, index, index === selectedIndex),
      )}
    </div>,
    document.body,
  );
}

interface MenuItemProps {
  index: number;
  isSelected: boolean;
  onSelect: (index: number) => void;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  isMobile?: boolean;
  title?: string;
}

export function MenuItem({
  index,
  isSelected,
  onSelect,
  children,
  className = "autocomplete-item",
  style,
  isMobile = false,
  title,
}: MenuItemProps) {
  return (
    <div
      role="option"
      aria-selected={isSelected}
      tabIndex={-1}
      onClick={() => onSelect(index)}
      className={`${className}${isSelected ? " selected" : ""}`}
      title={title}
      style={{
        ...(isMobile
          ? {
              flexShrink: 0,
              borderRadius: 6,
              border: isSelected
                ? "1px solid var(--color-accent)"
                : "1px solid transparent",
              padding: 4,
            }
          : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
}
