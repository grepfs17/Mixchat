import { useState } from "react";
import {
  MdDelete,
  MdHourglassEmpty,
  MdBlock,
} from "react-icons/md";
import { FaShieldAlt } from "react-icons/fa";
import {
  getColorFromName,
  getReadableUsernameColor,
} from "../../../lib/chatColors";
import { useModerationContext } from "../../../contexts/ModerationContext";
import YTMessageParts from "../../YTMessageParts";
import { PlatformTag } from "../unified/PlatformTag";
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
}: YouTubeMessageContentProps) {
  const {
    isYouTubeModerator,
    youtubeModModeActive,
    youtubeOwnChannelId,
    onDeleteYouTubeMessage,
    onBanYouTubeUser,
    onTimeoutYouTubeUser,
  } = useModerationContext();
  const [deletedRevealed, setDeletedRevealed] = useState(false);
  const config = getConfig(msg);
  const parityClass = index % 2 === 0 ? "even" : "odd";
  // Trust the authoritative server-side flags only; the per-message badge
  // labels are user-visible and can be set by community roles or mod-bot
  // integrations, so we no longer use them to gate action availability.
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
      <div className="message-actions">
        <button
          onClick={() => onDeleteYouTubeMessage?.(msg.id)}
          className="action-button mod-action"
          title="Delete message"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <MdDelete size={12} />
        </button>
        {!isUnmoderatable && msg.authorChannelId && (
          <>
            <button
              onClick={() =>
                onTimeoutYouTubeUser?.(msg.authorChannelId!, 600, msg.author)
              }
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onTimeoutMenu?.(e);
              }}
              className="action-button mod-action"
              title="Timeout (10m) - Right-click for more"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <MdHourglassEmpty size={12} />
            </button>
            <button
              onClick={() => onBanYouTubeUser?.(msg.authorChannelId!, msg.author)}
              className="action-button mod-action"
              title="Ban (this chat) - Data API only supports per-broadcast bans"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <MdBlock size={12} />
            </button>
          </>
        )}
      </div>
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
          {renderModActions()}
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
          <span
            className="message-text deleted-clickable"
            onClick={() => setDeletedRevealed(true)}
          >
            click to see the deleted message
          </span>
        ) : (
          <span className="message-text">
            <YTMessageParts parts={msg.parts} variant={variant} />
          </span>
        )}
        {renderModActions()}
      </div>
      {msg.isDeleted && (
        <div className="deleted-notice">Deleted by a moderator</div>
      )}
    </div>
  );
}
