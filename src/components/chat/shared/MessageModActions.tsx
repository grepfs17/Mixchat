import { useState, useCallback } from "react";
import type { ReactNode } from "react";
import { MdDelete, MdHourglassEmpty, MdBlock, MdWarning, MdPushPin } from "react-icons/md";

interface BaseProps {
  onDelete?: () => void;
  onPin?: () => void;
  onTimeout?: (e: React.MouseEvent) => void;
  onTimeoutContextMenu?: (e: React.MouseEvent) => void;
  onBan?: () => void;
  onWarn?: () => void;
  deleteTitle?: string;
  pinTitle?: string;
  timeoutTitle?: string;
  banTitle?: string;
  warnTitle?: string;
  showUserActions?: boolean;
  doubleClickConfirm?: boolean;
  forceVisible?: boolean;
}

const btnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "4px",
};

type PendingAction = "ban" | "timeout" | "warn" | "delete" | null;

/**
 * Renders the moderator action buttons (delete / timeout / ban / warn)
 * inside a `message-actions` strip. Each handler is optional; missing
 * handlers simply skip their button. Used by both Twitch and YouTube
 * message rows so the buttons stay visually consistent.
 */
export function MessageModActions({
  onDelete,
  onPin,
  onTimeout,
  onTimeoutContextMenu,
  onBan,
  onWarn,
  deleteTitle = "Delete message",
  pinTitle = "Pin message",
  timeoutTitle = "Timeout",
  banTitle = "Ban user",
  warnTitle = "Warn user",
  showUserActions = true,
  doubleClickConfirm = false,
  forceVisible = false,
}: BaseProps): ReactNode {
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const handleClick = useCallback(
    (
      e: React.MouseEvent,
      action: PendingAction,
      handler?: (() => void) | ((e: React.MouseEvent) => void),
    ) => {
      e.stopPropagation();
      e.preventDefault();

      if (!handler) return;

      if (!doubleClickConfirm) {
        if (action === "timeout" && typeof handler === "function") {
          (handler as (e: React.MouseEvent) => void)(e);
        } else if (typeof handler === "function") {
          (handler as () => void)();
        }
        return;
      }

      if (pendingAction === action) {
        if (action === "timeout" && typeof handler === "function") {
          (handler as (e: React.MouseEvent) => void)(e);
        } else if (typeof handler === "function") {
          (handler as () => void)();
        }
        setPendingAction(null);
      } else {
        setPendingAction(action);
        setTimeout(() => setPendingAction(null), 2000);
      }
    },
    [doubleClickConfirm, pendingAction],
  );

  const hasAny =
    onDelete || onPin || (showUserActions && (onTimeout || onBan || onWarn));
  if (!hasAny) return null;

  const getButtonClass = (action: PendingAction) => {
    const baseClass = "action-button mod-action";
    if (doubleClickConfirm && pendingAction === action) {
      return `${baseClass} mod-action--confirm`;
    }
    return baseClass;
  };

  const getTitle = (action: PendingAction, baseTitle: string) => {
    if (doubleClickConfirm && pendingAction === action) {
      return `Click again to confirm: ${baseTitle}`;
    }
    return baseTitle;
  };

  return (
    <div className={`message-actions${forceVisible ? " message-actions--mod-active" : ""}`}>
      {showUserActions && onBan && (
        <button type="button"
          onClick={(e) => handleClick(e, "ban", onBan)}
          className={getButtonClass("ban")}
          title={getTitle("ban", banTitle)}
          style={btnStyle}
        >
          <MdBlock size={12} />
        </button>
      )}
      {showUserActions && onTimeout && (
        <button type="button"
          onClick={(e) => handleClick(e, "timeout", onTimeout)}
          onContextMenu={onTimeoutContextMenu}
          className={getButtonClass("timeout")}
          title={getTitle("timeout", timeoutTitle)}
          style={btnStyle}
        >
          <MdHourglassEmpty size={12} />
        </button>
      )}
      {showUserActions && onWarn && (
        <button type="button"
          onClick={(e) => handleClick(e, "warn", onWarn)}
          className={getButtonClass("warn")}
          title={getTitle("warn", warnTitle)}
          style={btnStyle}
        >
          <MdWarning size={12} />
        </button>
      )}
      {onPin && (
        <button type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onPin();
          }}
          className="action-button mod-action"
          title={pinTitle}
          style={btnStyle}
        >
          <MdPushPin size={12} />
        </button>
      )}
      {onDelete && (
        <button type="button"
          onClick={(e) => handleClick(e, "delete", onDelete)}
          className={getButtonClass("delete")}
          title={getTitle("delete", deleteTitle)}
          style={btnStyle}
        >
          <MdDelete size={12} />
        </button>
      )}
    </div>
  );
}
