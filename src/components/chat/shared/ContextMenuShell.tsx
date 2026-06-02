import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { useSmartMenuPosition } from "../../../hooks/useSmartMenuPosition";

interface ContextMenuShellProps {
  x: number;
  y: number;
  extraClass?: string;
  onContextMenu?: (e: React.MouseEvent) => void;
  onClick?: (e: React.MouseEvent) => void;
  children: ReactNode;
}

/**
 * Renders children inside a portal-based context menu that automatically
 * flips upward / shifts horizontally when it would overflow the viewport.
 */
export function ContextMenuShell({
  x,
  y,
  extraClass,
  onContextMenu,
  onClick,
  children,
}: ContextMenuShellProps) {
  const { menuRef, pos } = useSmartMenuPosition(x, y);

  return createPortal(
    <div
      ref={menuRef}
      className={["context-menu", extraClass].filter(Boolean).join(" ")}
      onContextMenu={onContextMenu ?? ((e) => e.stopPropagation())}
      onClick={onClick ?? ((e) => e.stopPropagation())}
      style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
    >
      {children}
    </div>,
    document.body,
  );
}
