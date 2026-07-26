import { createPortal } from "react-dom";
import type { CategoryResult } from "./types";

interface CategoryDropdownProps {
  results: CategoryResult[];
  pos: { x: number; y: number } | null;
  saving: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onSelect: (id: string, name: string) => void;
  onCancel: () => void;
}

export default function CategoryDropdown({
  results,
  pos,
  saving,
  inputRef,
  onSelect,
  onCancel,
}: CategoryDropdownProps) {
  if (!pos || results.length === 0) return null;

  return createPortal(
    <div
      id="category-dropdown-portal"
      className="stream-info-category-dropdown"
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        zIndex: 9999,
      }}
    >
      {results.map((cat) => (
        <button type="button"
          key={cat.id}
          className="stream-info-category-option"
          onClick={() => onSelect(cat.id, cat.name)}
        >
          {cat.name}
        </button>
      ))}
    </div>,
    document.body,
  );
}
