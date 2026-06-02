import { createPortal } from "react-dom";

interface TimeoutMenuProps {
  userId: string;
  username: string;
  x: number;
  y: number;
  onTimeout: (userId: string, seconds: number, username: string) => void;
  onClose: () => void;
}

const TIMEOUT_OPTIONS = [
  { label: "10 Seconds", seconds: 10 },
  { label: "10 Minutes", seconds: 600 },
  { label: "1 Day", seconds: 86400 },
];

export default function TimeoutMenu({
  userId,
  username,
  x,
  y,
  onTimeout,
  onClose,
}: TimeoutMenuProps) {
  return createPortal(
    <div
      className="mod-context-menu"
      onContextMenu={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        top: y,
        right: window.innerWidth - x,
        left: "auto",
        zIndex: 9999,
      }}
    >
      <div className="mod-context-menu-header">Timeout {username}</div>
      {TIMEOUT_OPTIONS.map((opt) => (
        <button
          key={opt.seconds}
          onClick={() => {
            onTimeout(userId, opt.seconds, username);
            onClose();
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
