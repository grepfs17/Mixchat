import { createPortal } from "react-dom";
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
    onPinMessage,
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
    const canModerate = !isBroadcaster && !isModeratorMsg && !chatMsg.isCurrentUser;
    if (canModerate && !twitchModActionsVisibleInline) {
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
    // Pin works on any message (broadcaster, moderator, or the current user
    // included) and has no inline button, so it always lives here. It needs
    // a divider only when it is not grouped with the mod action items above.
    if (!canModerate || twitchModActionsVisibleInline) {
      items.push({ key: "pin-divider", divider: true });
    }
    items.push({
      key: "pin",
      label: "Pin message",
      onClick: () => {
        onPinMessage?.(chatMsg.id);
        onClose();
      },
    });
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

  const menuItems = (
    <>
      <div className="context-menu-header">@{author}</div>
      {items.map((it) =>
        "divider" in it ? (
          <hr key={it.key} className="context-menu-divider" />
        ) : (
          <button type="button"
            key={it.key}
            onClick={it.onClick}
            className="context-menu-item"
            title={it.title}
          >
            {it.label}
          </button>
        ),
      )}
    </>
  );

  // On mobile the menu becomes a full-width bottom sheet anchored to the
  // top edge of the fixed message input(s) instead of floating at the
  // press point. The sheet's bottom sits just above the bottom-most input
  // so it can never cover the input row.
  if (isMobile) {
    // Anchor to the bottom-most input on screen so the sheet never covers
    // any input row; fall back to a 64px placeholder when none is found.
    let inputTop = window.innerHeight - 64;
    let lowestBottom = -1;
    document
      .querySelectorAll<HTMLElement>(
        ".unified-input, .message-input, .youtube-input-wrapper",
      )
      .forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.height <= 0) return;
        if (rect.bottom > lowestBottom) {
          lowestBottom = rect.bottom;
          inputTop = rect.top;
        }
      });
    return createPortal(
      <div
        role="menu"
        tabIndex={-1}
        aria-label="Context menu"
        className="context-menu message-context-menu message-context-menu--mobile"
        onContextMenu={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") e.stopPropagation();
        }}
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          width: "100%",
          bottom: window.innerHeight - inputTop + 4,
          zIndex: 9999,
        }}
      >
        {menuItems}
      </div>,
      document.body,
    );
  }

  return (
    <ContextMenuShell x={x} y={y} extraClass="message-context-menu">
      {menuItems}
    </ContextMenuShell>
  );
}
