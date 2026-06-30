import type { ReactNode } from "react";
import { MdDelete, MdHourglassEmpty, MdBlock, MdWarning } from "react-icons/md";

interface BaseProps {
  onDelete?: () => void;
  onTimeout?: (e: React.MouseEvent) => void;
  onTimeoutContextMenu?: (e: React.MouseEvent) => void;
  onBan?: () => void;
  onWarn?: () => void;
  deleteTitle?: string;
  timeoutTitle?: string;
  banTitle?: string;
  warnTitle?: string;
  showUserActions?: boolean;
}

const btnStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "4px",
};

/**
 * Renders the moderator action buttons (delete / timeout / ban / warn)
 * inside a `message-actions` strip. Each handler is optional; missing
 * handlers simply skip their button. Used by both Twitch and YouTube
 * message rows so the buttons stay visually consistent.
 */
export function MessageModActions({
  onDelete,
  onTimeout,
  onTimeoutContextMenu,
  onBan,
  onWarn,
  deleteTitle = "Delete message",
  timeoutTitle = "Timeout (10m) - Right-click for more",
  banTitle = "Ban user",
  warnTitle = "Warn user",
  showUserActions = true,
}: BaseProps): ReactNode {
  const hasAny =
    onDelete || (showUserActions && (onTimeout || onBan || onWarn));
  if (!hasAny) return null;
  return (
    <div className="message-actions">
      {onDelete && (
        <button
          onClick={onDelete}
          className="action-button mod-action"
          title={deleteTitle}
          style={btnStyle}
        >
          <MdDelete size={12} />
        </button>
      )}
      {showUserActions && onTimeout && (
        <button
          onClick={onTimeout}
          onContextMenu={onTimeoutContextMenu}
          className="action-button mod-action"
          title={timeoutTitle}
          style={btnStyle}
        >
          <MdHourglassEmpty size={12} />
        </button>
      )}
      {showUserActions && onBan && (
        <button
          onClick={onBan}
          className="action-button mod-action"
          title={banTitle}
          style={btnStyle}
        >
          <MdBlock size={12} />
        </button>
      )}
      {showUserActions && onWarn && (
        <button
          onClick={onWarn}
          className="action-button mod-action"
          title={warnTitle}
          style={btnStyle}
        >
          <MdWarning size={12} />
        </button>
      )}
    </div>
  );
}
