import { useState, useMemo } from "react";
import { FaShieldAlt } from "react-icons/fa";
import {
  getColorFromName,
  getReadableUsernameColor,
} from "../../../lib/chatColors";
import { useModerationContext } from "../../../contexts/ModerationContext";
import { isMobileDevice } from "../../../lib/device";
import YTMessageParts from "../../YTMessageParts";
import { PlatformTag } from "../unified/PlatformTag";
import { MessageModActions } from "./MessageModActions";
import type { YTMessage } from "../unified/types";
import { splitByTwitchLinks } from "../../../lib/twitchLink";
import {
  approveYouTubeMessage,
  denyYouTubeMessage,
} from "../../../lib/youtubeModeration";
import type { MessagePart } from "../unified/types";

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
  /**
   * When true, render 7TV / BTTV / FFZ emote names in the message body as
   * images. Uses the same emote set as Twitch chat.
   */
  renderThirdPartyEmotes?: boolean;
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
  redirect: {
    label: "RAID / REDIRECT",
    color: "#ff9800",
    bg: "rgba(255, 152, 0, 0.15)",
  },
  automod: {
    label: "HELD FOR REVIEW",
    color: "#fbbf24",
    bg: "rgba(251, 191, 36, 0.15)",
  },
  removed: {
    label: "REMOVED FROM CHAT",
    color: "#ef4444",
    bg: "rgba(239, 68, 68, 0.15)",
  },
  "mod-hidden": {
    label: "MESSAGES REMOVED",
    color: "#f87171",
    bg: "rgba(248, 113, 113, 0.15)",
  },
  raidHost: {
    label: "RAID HOST",
    color: "#4ade80",
    bg: "rgba(74, 222, 128, 0.15)",
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

/**
 * Re-walk each text part of a YouTube message and split it into
 * [text | twitch-link | text | ...] so YTMessageParts can mount a
 * TwitchLinkPreview inline next to the rest of the message body.
 *
 * Memoised on the input parts reference identity — if the message
 * re-renders without new parts, no recomputation.
 */
function expandPartsWithTwitchLinks(parts: MessagePart[]): MessagePart[] {
  const out: MessagePart[] = [];
  for (const part of parts) {
    if (part.type !== "text") {
      out.push(part);
      continue;
    }
    const text = part.text ?? "";
    if (!text) {
      out.push(part);
      continue;
    }
    const segments = splitByTwitchLinks(text);
    if (segments.length === 1 && segments[0].type === "text") {
      out.push(part);
      continue;
    }
    for (const seg of segments) {
      if (seg.type === "twitch-link") {
        out.push({
          type: "twitch-link",
          twitchUrl: seg.url,
          text: seg.url,
        });
      } else if (seg.text) {
        out.push({ type: "text", text: seg.text });
      }
    }
  }
  return out;
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
  renderThirdPartyEmotes = false,
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
    youtubeVideoId,
  } = useModerationContext();
  const [deletedRevealed, setDeletedRevealed] = useState(false);
  const config = getConfig(msg);
  const parityClass = index % 2 === 0 ? "even" : "odd";
  // Split Twitch.tv URLs out of text parts so YTMessageParts can render
  // preview cards next to the message body. The original `msg.parts`
  // shape is preserved for messages without twitch URLs (memo hits the
  // reference equality short-circuit).
  const expandedParts = useMemo(
    () => expandPartsWithTwitchLinks(msg.parts),
    [msg.parts],
  );
  const isMod = Boolean(msg.authorIsModerator);
  const isOwner = Boolean(msg.authorIsOwner);
  const isCurrentUser = Boolean(
    youtubeOwnChannelId && msg.authorChannelId === youtubeOwnChannelId,
  );
  const isUnmoderatable = isMod || isOwner || isCurrentUser;
  const isMobile = isMobileDevice();
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
        forceVisible={isMobile && youtubeModModeActive}
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
        <button
          type="button"
          className="author"
          style={{ color: config.color }}
          onClick={(e) => {
            e.stopPropagation();
            onUsernameClick?.(e, msg.author, msg.authorAvatar);
          }}
        >
          {msg.author}
        </button>
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
                  <YTMessageParts
                    parts={expandedParts}
                    variant={variant}
                    renderThirdPartyEmotes={renderThirdPartyEmotes}
                  />
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
            {msg.messageType === "redirect" && (
              <YTMessageParts
                parts={expandedParts}
                variant={variant}
                renderThirdPartyEmotes={renderThirdPartyEmotes}
              />
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
                  <YTMessageParts
                    parts={expandedParts}
                    variant={variant}
                    renderThirdPartyEmotes={renderThirdPartyEmotes}
                  />
                )}
              </>
            )}
            {msg.messageType === "automod" && (
              <YTMessageParts
                parts={expandedParts}
                variant={variant}
                renderThirdPartyEmotes={renderThirdPartyEmotes}
              />
            )}
            {(msg.messageType === "removed" ||
              msg.messageType === "mod-hidden") && (
              <YTMessageParts
                parts={expandedParts}
                variant={variant}
                renderThirdPartyEmotes={renderThirdPartyEmotes}
              />
            )}
            {msg.messageType === "raidHost" && (
              <YTMessageParts
                parts={expandedParts}
                variant={variant}
                renderThirdPartyEmotes={renderThirdPartyEmotes}
              />
            )}
          </span>
          {!modActionsFirst && renderModActions()}
        </div>
        {showModActions && (msg as any).automodButtons && (
          <div
            style={{
              display: "flex",
              gap: "6px",
              marginTop: "4px",
              flexWrap: "wrap" as const,
            }}
          >
            {(msg as any).automodButtons
              .filter((b: any) => !b.is_disabled)
              .map((b: any, i: number) => (
                <button
                  key={i}
                  type="button"
                  className="action-button mod-action"
                  onClick={async () => {
                    if (!youtubeVideoId || !b.text) return;
                    const decision = b.text.toLowerCase().includes("deny")
                      ? "deny"
                      : "approve";
                    try {
                      if (decision === "approve") {
                        await approveYouTubeMessage(youtubeVideoId, msg.id);
                      } else {
                        await denyYouTubeMessage(youtubeVideoId, msg.id);
                      }
                      // The SSE stream will send RemoveChatItemAction to
                      // remove the automod message from the UI naturally.
                    } catch (e) {
                      console.error("[Automod] Action failed:", e);
                    }
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    border: "1px solid",
                    borderRadius: "4px",
                    padding: "2px 8px",
                    fontSize: "11px",
                    cursor: "pointer",
                    borderColor: config.color,
                    color: config.color,
                    background: config.bg,
                  }}
                >
                  {b.text || "Action"}
                </button>
              ))}
          </div>
        )}
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
        {isMod && <FaShieldAlt className="yt-mod-shield" title="Moderator" />}        <button
          type="button"
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
        </button>
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
            <YTMessageParts
              parts={expandedParts}
              variant={variant}
              renderThirdPartyEmotes={renderThirdPartyEmotes}
            />
          </span>
        )}
        {!modActionsFirst && renderModActions()}
      </div>
    </div>
  );
}

