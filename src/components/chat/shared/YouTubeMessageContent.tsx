import { useState } from "react";
import { FaShieldAlt } from "react-icons/fa";
import {
  getColorFromName,
  getReadableUsernameColor,
} from "../../../lib/chatColors";
import { useModerationContext } from "../../../contexts/ModerationContext";
import YTMessageParts from "../../YTMessageParts";
import { PlatformTag } from "../unified/PlatformTag";
import { MessageModActions } from "./MessageModActions";
import type { YTMessage } from "../unified/types";

export interface YouTubeMessageContentProps {
  msg: YTMessage;
  index?: number;
  showPlatformTag?: boolean;
  variant?: "unified" | "standalone";
  onTouchStart?: () => void;
  onTouchEnd?: () => void;
  onTouchMove?: (e: React.TouchEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onTimeoutMenu?: (e: React.MouseEvent) => void;
  onUsernameClick?: (
    e: React.MouseEvent,
    author: string,
    avatar?: string,
  ) => void;
  /** When true, deleted messages are dimmed and clickable to reveal; otherwise they collapse. */
  showDeletedMessages?: boolean;
}

const YT_EVENT_CONFIG: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  membership: {
    label: "MEMBER",
    color: "#0f9d58",
    bg: "rgba(15, 157, 88, 0.15)",
  },
  "gift-purchase": {
    label: "GIFT",
    color: "#9c27b0",
    bg: "rgba(156, 39, 176, 0.15)",
  },
  "gift-redemption": {
    label: "GIFT RECEIVED",
    color: "#4caf50",
    bg: "rgba(76, 80, 0.15)",
  },
};

function getConfig(msg: YTMessage) {
  if (msg.messageType && YT_EVENT_CONFIG[msg.messageType])
    return YT_EVENT_CONFIG[msg.messageType];
  if (msg.superchat)
    return {
      label: "SUPER CHAT",
      color: msg.superchat.color,
      bg: `${msg.superchat.color}26`,
    };
  return null;
}

function formatTimestamp(timestamp: Date | string) {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Format the "Message deleted by @..." line. YouTube's
 * `deleted_state_message` already contains the full text in many cases
 * ("Message deleted by @mod", "Message removed by author", etc.), so we
 * trust it when present. Otherwise we fall back to "Message deleted by a
 * moderator" so we never regress to the bare "click to see..." line.
 */
function formatDeletedByText(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim();
  if (trimmed) return trimmed;
  return "Message deleted by a moderator";
}

export function YouTubeMessageContent({
  msg,
  index = 0,
  showPlatformTag = false,
  variant = "unified",
  onTouchStart,
  onTouchEnd,
  onTouchMove,
  onContextMenu,
  onTimeoutMenu,
  onUsernameClick,
  showDeletedMessages = false,
}: YouTubeMessageContentProps) {
  const {
    isYouTubeModerator,
    youtubeModModeActive,
    youtubeOwnChannelId,
    modActionsFirst,
    doubleClickConfirmModActions,
    onDeleteYouTubeMessage,
    onBanYouTubeUser,
    onTimeoutYouTubeUser,
  } = useModerationContext();
  const [deletedRevealed, setDeletedRevealed] = useState(false);
  const config = getConfig(msg);
  const parityClass = index % 2 === 0 ? "even" : "odd";
  const isMod = Boolean(msg.authorIsModerator);
  const isOwner = Boolean(msg.authorIsOwner);
  const isCurrentUser = Boolean(
    youtubeOwnChannelId && msg.authorChannelId === youtubeOwnChannelId,
  );
  const isUnmoderatable = isMod || isOwner || isCurrentUser;
  const showModActions =
    isYouTubeModerator &&
    youtubeModModeActive &&
    !msg.isDeleted &&
    msg.authorChannelId;

  const renderModActions = () => {
    if (!showModActions) return null;
    return (
      <MessageModActions
        onDelete={() => onDeleteYouTubeMessage?.(msg.id)}
        onTimeout={(e) => {
          e?.preventDefault?.();
          e?.stopPropagation?.();
          onTimeoutMenu?.(e);
        }}
        onTimeoutContextMenu={(e) => {
          e.preventDefault();
        }}
        onBan={() => onBanYouTubeUser?.(msg.authorChannelId!, msg.author)}
        banTitle="Ban (this chat) - Data API only supports per-broadcast bans"
        showUserActions={!isUnmoderatable && Boolean(msg.authorChannelId)}
        doubleClickConfirm={doubleClickConfirmModActions}
      />
    );
  };

  if (config) {
    return (
      <div
        className={`message yt-event ${parityClass}`}
        style={
          {
            "--event-color": config.color,
            "--event-bg": config.bg,
          } as React.CSSProperties
        }
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchMove={onTouchMove}
        onContextMenu={onContextMenu}
      >
        <div
          className="yt-event-label"
          style={{
            color: config.color,
            background: config.bg,
            borderColor: config.color,
          }}
        >
          {config.label}
        </div>
        <div className="message-single-line">
          {modActionsFirst && renderModActions()}
          <span className="timestamp">{formatTimestamp(msg.timestamp)}</span>
          {showPlatformTag && <PlatformTag source="youtube" />}
          {msg.authorAvatar && (
            <img src={msg.authorAvatar} alt={msg.author} className="avatar" />
          )}
          {isMod && <FaShieldAlt className="yt-mod-shield" title="Moderator" />}
          <span
            className="author"
            style={{ color: config.color }}
            onClick={(e) => {
              e.stopPropagation();
              onUsernameClick?.(e, msg.author, msg.authorAvatar);
            }}
          >
            {msg.author}
          </span>
          <span className="message-separator">:</span>
          <span className="message-text">
            {msg.messageType === "membership" && (
              <>
                <span
                  className="yt-superchat-amount-inline"
                  style={{ marginRight: "5px" }}
                >
                  [{msg.superchat!.amount}]
                </span>
                {msg.parts.length > 0 && (
                  <YTMessageParts parts={msg.parts} variant={variant} />
                )}
              </>
            )}
            {msg.messageType === "gift-purchase" && (
              <>
                Bought {msg.giftCount || 1} gift
                {msg.giftCount !== 1 ? "s" : ""}
              </>
            )}
            {msg.messageType === "gift-redemption" && (
              <>Received a gift membership</>
            )}
            {msg.superchat && !msg.messageType && (
              <>
                <span
                  className="yt-superchat-amount-inline"
                  style={{ marginRight: "5px" }}
                >
                  [{msg.superchat.amount}]
                </span>
                {msg.parts.length > 0 && (
                  <YTMessageParts parts={msg.parts} variant={variant} />
                )}
              </>
            )}
          </span>
          {!modActionsFirst && renderModActions()}
        </div>
        {msg.superchat?.sticker && (
          <div className="yt-superchat-sticker-row">
            <img
              src={msg.superchat.sticker.url}
              alt={msg.superchat.sticker.alt}
              className="yt-superchat-sticker"
              style={{
                width: "72px",
                height: "72px",
                marginTop: "4px",
                objectFit: "contain",
              }}
              loading="lazy"
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`message${msg.optimistic ? " yt-optimistic" : ""}${msg.isDeleted ? " deleted" : ""} ${parityClass}`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchMove={onTouchMove}
      onContextMenu={onContextMenu}
    >
      <div className="message-single-line">
        {modActionsFirst && renderModActions()}
        <span className="timestamp">{formatTimestamp(msg.timestamp)}</span>
        {showPlatformTag && <PlatformTag source="youtube" />}
        {msg.authorAvatar && (
          <img src={msg.authorAvatar} alt={msg.author} className="avatar" />
        )}
        {isMod && <FaShieldAlt className="yt-mod-shield" title="Moderator" />}
        <span
          className="author"
          style={{
            color: getReadableUsernameColor(getColorFromName(msg.author)),
          }}
          onClick={(e) => {
            e.stopPropagation();
            onUsernameClick?.(e, msg.author, msg.authorAvatar);
          }}
        >
          {msg.author}
        </span>
        <span className="message-separator">:</span>
        {msg.isDeleted && !deletedRevealed ? (
          <span className="message-text deleted-clickable">
            {formatDeletedByText(msg.deletedByText)}{" "}
            {showDeletedMessages ? (
              <button
                type="button"
                className="yt-deleted-reveal"
                onClick={() => setDeletedRevealed(true)}
              >
                View deleted message
              </button>
            ) : null}
          </span>
        ) : (
          <span className="message-text">
            <YTMessageParts parts={msg.parts} variant={variant} />
          </span>
        )}
        {!modActionsFirst && renderModActions()}
      </div>
    </div>
  );
}
