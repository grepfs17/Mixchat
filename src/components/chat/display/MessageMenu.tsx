import { createPortal } from 'react-dom';
import type { ChatMessage } from '../../../lib/types';

interface MessageMenuProps {
  message: ChatMessage;
  x: number;
  y: number;
  isModerator: boolean;
  modModeActive: boolean;
  compactActions: boolean;
  onReply?: (message: ChatMessage) => void;
  onCopy: (message: ChatMessage) => void;
  onDeleteMessage?: (messageId: string) => void;
  onTimeoutUser?: (userId: string, seconds: number, displayName?: string) => void;
  onBanUser?: (userId: string, displayName?: string) => void;
  onWarnUser?: (userName: string) => void;
  onClose: () => void;
}

export default function MessageMenu({
  message,
  x,
  y,
  isModerator,
  modModeActive,
  compactActions,
  onReply,
  onCopy,
  onDeleteMessage,
  onTimeoutUser,
  onBanUser,
  onWarnUser,
  onClose,
}: MessageMenuProps) {
  const isSystemMessage = message.messageType && message.messageType !== 'chat';
  const items: Array<{ key: string; label: string; onClick: () => void }> = [];

  if (!isSystemMessage && onReply) {
    items.push({ key: 'reply', label: 'Reply', onClick: () => { onReply(message); onClose(); } });
  }
  items.push({ key: 'copy', label: 'Copy message', onClick: () => { onCopy(message); onClose(); } });

  if (!isSystemMessage && isModerator && modModeActive) {
    const isBroadcaster = Boolean(message.badges && message.badges['broadcaster']);
    const isModeratorMsg = Boolean(message.badges && message.badges['moderator']);
    const isUnmoderatable = isBroadcaster || isModeratorMsg || message.isCurrentUser;
    if (!isUnmoderatable) {
      items.push({ key: 'delete', label: 'Delete', onClick: () => { onDeleteMessage?.(message.id); onClose(); } });
      items.push({ key: 'timeout', label: 'Timeout (10m)', onClick: () => { onTimeoutUser?.(message.userId || '', 600, message.author); onClose(); } });
      items.push({ key: 'ban', label: 'Ban', onClick: () => { onBanUser?.(message.userId || '', message.author); onClose(); } });
      items.push({ key: 'warn', label: 'Warn', onClick: () => { onWarnUser?.(message.author); onClose(); } });
    }
  }

  if (compactActions) {
    items.sort((a, b) => a.label.localeCompare(b.label));
  }

  return createPortal(
    <div
      className="context-menu message-context-menu"
      onContextMenu={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{ position: 'fixed', top: y, left: x, zIndex: 9999 }}
    >
      <div className="context-menu-header">@{message.author}</div>
      {items.map((it) => (
        <button key={it.key} onClick={it.onClick} className="context-menu-item">{it.label}</button>
      ))}
    </div>,
    document.body
  );
}
