import type { TwitchMessage } from "../../../lib/types";
import type { UnifiedEntry, YTMessage } from "../unified/types";
import { useModerationContext } from "../../../contexts/ModerationContext";
import { ContextMenuShell } from "./ContextMenuShell";

interface MessageMenuProps {
  x: number;
  y: number;
  entry: TwitchMessage | UnifiedEntry;
  onReply?: (msg: TwitchMessage) => void;
  onCopy: (msg: any) => void;
  onViewHistory?: (author: string, avatar?: string) => void;
  onClose: () => void;
}

export default function MessageMenu({
  x,
  y,
  entry,
  onReply,
  onCopy,
  onViewHistory,
  onClose,
}: MessageMenuProps) {
  const {
    isModerator,
    modModeActive,
    isYouTubeModerator,
    youtubeModModeActive,
    onDeleteMessage,
    onTimeoutUser,
    onBanUser,
    onWarnUser,
    onDeleteYouTubeMessage,
    onTimeoutYouTubeUser,
    onBanYouTubeUser,
  } = useModerationContext();
  // Normalize entry to a common format for logic
  const isUnified = "source" in entry;
  const source = isUnified ? entry.source : "twitch";
  const msg = isUnified ? entry.msg : entry;

  const isTwitch = source === "twitch";
  const isYouTube = source === "youtube";
  const isTwitchMessage = isTwitch; // In this app, only twitch uses TwitchMessage directly
  const chatMsg = isTwitch ? (msg as TwitchMessage) : null;
  const ytMsg = isYouTube ? (msg as YTMessage) : null;

  const isSystemMessage =
    chatMsg?.messageType && chatMsg.messageType !== "chat";
  const author = chatMsg ? chatMsg.author : ytMsg?.author || "Unknown";
  const authorAvatar = chatMsg?.authorAvatar || ytMsg?.authorAvatar;

  const items: Array<{ key: string; label: string; onClick: () => void }> = [];

  // Reply (Twitch only for now)
  if (isTwitch && !isSystemMessage && onReply && chatMsg) {
    items.push({
      key: "reply",
      label: "Reply",
      onClick: () => {
        onReply(chatMsg);
        onClose();
      },
    });
  }

  // Copy
  items.push({
    key: "copy",
    label: "Copy message",
    onClick: () => {
      onCopy(msg as TwitchMessage | YTMessage);
      onClose();
    },
  });

  // View History
  if (onViewHistory) {
    items.push({
      key: "history",
      label: "View History",
      onClick: () => {
        onViewHistory(author, authorAvatar);
        onClose();
      },
    });
  }

  // Twitch moderation
  if (isTwitch && !isSystemMessage && isModerator && modModeActive && chatMsg) {
    const isBroadcaster = Boolean(chatMsg.badges?.["broadcaster"]);
    const isModeratorMsg = Boolean(chatMsg.badges?.["moderator"]);
    if (!isBroadcaster && !isModeratorMsg && !chatMsg.isCurrentUser) {
      items.push({
        key: "delete",
        label: "Delete",
        onClick: () => {
          onDeleteMessage?.(chatMsg.id);
          onClose();
        },
      });
      items.push({
        key: "timeout",
        label: "Timeout (10m)",
        onClick: () => {
          onTimeoutUser?.(chatMsg.userId || "", 600, chatMsg.author);
          onClose();
        },
      });
      items.push({
        key: "ban",
        label: "Ban",
        onClick: () => {
          onBanUser?.(chatMsg.userId || "", chatMsg.author);
          onClose();
        },
      });
      items.push({
        key: "warn",
        label: "Warn",
        onClick: () => {
          onWarnUser?.(chatMsg.author);
          onClose();
        },
      });
    }
  }

  // YouTube moderation
  if (
    isYouTube &&
    ytMsg &&
    isYouTubeModerator &&
    youtubeModModeActive &&
    ytMsg.authorChannelId &&
    !ytMsg.authorIsModerator &&
    !ytMsg.authorIsOwner
  ) {
    items.push({
      key: "yt-delete",
      label: "Delete",
      onClick: () => {
        onDeleteYouTubeMessage?.(ytMsg.id);
        onClose();
      },
    });
    items.push({
      key: "yt-timeout",
      label: "Timeout (10m)",
      onClick: () => {
        onTimeoutYouTubeUser?.(ytMsg.authorChannelId!, 600, ytMsg.author);
        onClose();
      },
    });
    items.push({
      key: "yt-ban",
      label: "Ban",
      onClick: () => {
        onBanYouTubeUser?.(ytMsg.authorChannelId!, ytMsg.author);
        onClose();
      },
    });
  }

  return (
    <ContextMenuShell x={x} y={y} extraClass="message-context-menu">
      <div className="context-menu-header">@{author}</div>
      {items.map((it) => (
        <button key={it.key} onClick={it.onClick} className="context-menu-item">
          {it.label}
        </button>
      ))}
    </ContextMenuShell>
  );
}
