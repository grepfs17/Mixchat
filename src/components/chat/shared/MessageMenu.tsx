import type { TwitchMessage } from "../../../lib/types";
import type { UnifiedEntry, YTMessage } from "../unified/types";
import { useModerationContext } from "../../../contexts/ModerationContext";
import { isMobileDevice } from "../../../lib/device";
import { ContextMenuShell } from "./ContextMenuShell";

interface MessageMenuProps {
  x: number;
  y: number;
  entry: TwitchMessage | UnifiedEntry;
  onReply?: (msg: TwitchMessage) => void;
  onCopy: (msg: any) => void;
  onViewHistory?: (author: string, avatar?: string) => void;
  /**
   * Opens the YouTube-specific duration picker at the given screen
   * coordinates for the given YouTube author. Used to expose the
   * 1m / 5m / 10m / 1h / 24h / Custom presets the official YouTube Studio
   * live-chat moderation dialog surfaces.
   */
  onOpenYouTubeTimeoutMenu?: (
    x: number,
    y: number,
    channelId: string,
    username: string,
  ) => void;
  /**
   * Opens the Twitch timeout duration picker dialog for the given user.
   */
  onOpenTwitchTimeoutMenu?: (userId: string, username: string) => void;
  onClose: () => void;
}

export default function MessageMenu({
  x,
  y,
  entry,
  onReply,
  onCopy,
  onViewHistory,
  onOpenYouTubeTimeoutMenu,
  onOpenTwitchTimeoutMenu,
  onClose,
}: MessageMenuProps) {
  const {
    isModerator,
    modModeActive,
    compactActions,
    keepModActionsVisible,
    isYouTubeModerator,
    youtubeModModeActive,
    youtubeOwnChannelId,
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

  type MenuItem = {
    key: string;
    label: string;
    title?: string;
    onClick: () => void;
  };
  type MenuDivider = { key: string; divider: true };
  const items: Array<MenuItem | MenuDivider> = [];

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
      onCopy(entry);
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
  const isMobile = isMobileDevice();
  const twitchModActionsVisibleInline =
    isTwitch &&
    !isSystemMessage &&
    isModerator &&
    modModeActive &&
    chatMsg &&
    !chatMsg.badges?.["broadcaster"] &&
    !chatMsg.badges?.["moderator"] &&
    !chatMsg.isCurrentUser &&
    (isMobile || !compactActions || keepModActionsVisible);

  if (isTwitch && !isSystemMessage && isModerator && modModeActive && chatMsg) {
    const isBroadcaster = Boolean(chatMsg.badges?.["broadcaster"]);
    const isModeratorMsg = Boolean(chatMsg.badges?.["moderator"]);
    if (
      !isBroadcaster &&
      !isModeratorMsg &&
      !chatMsg.isCurrentUser &&
      !twitchModActionsVisibleInline
    ) {
      items.push({ key: "mod-divider-twitch", divider: true });
      items.push({
        key: "ban",
        label: "Ban",
        onClick: () => {
          onBanUser?.(chatMsg.userId || "", chatMsg.author);
          onClose();
        },
      });
      items.push({
        key: "timeout",
        label: "Timeout...",
        onClick: () => {
          if (onOpenTwitchTimeoutMenu && chatMsg.userId) {
            onOpenTwitchTimeoutMenu(chatMsg.userId, chatMsg.author);
          } else {
            onTimeoutUser?.(chatMsg.userId || "", 600, chatMsg.author);
          }
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
      items.push({
        key: "delete",
        label: "Delete",
        onClick: () => {
          onDeleteMessage?.(chatMsg.id);
          onClose();
        },
      });
    }
  }

  // YouTube moderation
  const youtubeModActionsVisibleInline =
    isYouTube &&
    ytMsg &&
    isYouTubeModerator &&
    youtubeModModeActive &&
    ytMsg.authorChannelId &&
    !ytMsg.authorIsModerator &&
    !ytMsg.authorIsOwner &&
    !(youtubeOwnChannelId && ytMsg.authorChannelId === youtubeOwnChannelId) &&
    (isMobile || !compactActions || keepModActionsVisible);

  if (
    isYouTube &&
    ytMsg &&
    isYouTubeModerator &&
    youtubeModModeActive &&
    ytMsg.authorChannelId &&
    !ytMsg.authorIsModerator &&
    !ytMsg.authorIsOwner &&
    !(youtubeOwnChannelId && ytMsg.authorChannelId === youtubeOwnChannelId) &&
    !youtubeModActionsVisibleInline
  ) {
    items.push({ key: "mod-divider-youtube", divider: true });
    items.push({
      key: "yt-ban",
      label: "Ban (this chat)",
      title: "Data API only supports per-broadcast bans",
      onClick: () => {
        onBanYouTubeUser?.(ytMsg.authorChannelId!, ytMsg.author);
        onClose();
      },
    });
    items.push({
      key: "yt-timeout",
      label: "Timeout…",
      onClick: () => {
        if (onOpenYouTubeTimeoutMenu && ytMsg.authorChannelId) {
          onOpenYouTubeTimeoutMenu(x, y, ytMsg.authorChannelId, ytMsg.author);
        } else {
          onTimeoutYouTubeUser?.(ytMsg.authorChannelId!, 600, ytMsg.author);
        }
        onClose();
      },
    });
    items.push({
      key: "yt-delete",
      label: "Delete",
      onClick: () => {
        onDeleteYouTubeMessage?.(ytMsg.id);
        onClose();
      },
    });
  }

  return (
    <ContextMenuShell x={x} y={y} extraClass="message-context-menu">
      <div className="context-menu-header">@{author}</div>
      {items.map((it) =>
        "divider" in it ? (
          <div key={it.key} role="separator" className="context-menu-divider" />
        ) : (
          <button
            key={it.key}
            onClick={it.onClick}
            className="context-menu-item"
            title={it.title}
          >
            {it.label}
          </button>
        ),
      )}
    </ContextMenuShell>
  );
}
