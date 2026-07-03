import React, { memo, useState } from "react";
import { MdReply, MdContentCopy } from "react-icons/md";
import { parseMessageWithEmotes } from "../../../lib/emotes";
import { getReadableUsernameColor } from "../../../lib/chatColors";
import { useModerationContext } from "../../../contexts/ModerationContext";
import MessageBadges from "../../MessageBadges";
import AutomodActions from "./AutomodActions";
import { MessageModActions } from "./MessageModActions";
import TwitchEventIcon, { EVENT_CONFIG } from "../../TwitchEventIcon";
import type { TwitchMessage } from "../../../lib/types";

export interface TwitchMessageContentProps {
  msg: TwitchMessage;
  index: number;
  previousMsg: TwitchMessage | null;
  currentUserDisplayName?: string;
  authorColorById?: Map<string, string>;
  onReply?: (msg: TwitchMessage) => void;
  onCopy: (msg: TwitchMessage) => void;
  onUsernameClick?: (
    e: React.MouseEvent,
    author: string,
    avatar?: string,
  ) => void;
  onTimeoutMenu: (
    x: number,
    y: number,
    userId: string,
    username: string,
  ) => void;
  onContextMenu: (e: React.MouseEvent, msg: TwitchMessage) => void;
  onScrollToMessage: (id: string) => void;
  onTouchStart: (msg: TwitchMessage) => void;
  onTouchEnd: (msg: TwitchMessage) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  children?: React.ReactNode;
}

function TwitchMessageContentBase({
  msg,
  index,
  previousMsg,
  currentUserDisplayName,
  authorColorById,
  onReply,
  onCopy,
  onUsernameClick,
  onTimeoutMenu,
  onContextMenu,
  onScrollToMessage,
  onTouchStart,
  onTouchEnd,
  onTouchMove,
  children,
}: TwitchMessageContentProps) {
  const {
    isModerator,
    modModeActive,
    compactActions,
    keepModActionsVisible,
    modActionsFirst,
    onDeleteMessage,
    onBanUser,
    onTimeoutUser,
    onUntimeoutUser,
    onWarnUser,
  } = useModerationContext();
  const [deletedRevealed, setDeletedRevealed] = useState(false);
  const isMentioned =
    currentUserDisplayName && msg.content.includes(currentUserDisplayName);
  const isFirstLive =
    !msg.isPreloaded && previousMsg !== null && previousMsg.isPreloaded;
  const parityClass = index % 2 === 0 ? "even" : "odd";
  const powerUpClass =
    msg.powerUpType === "message_effect"
      ? "message-effect"
      : msg.powerUpType === "celebration"
        ? "celebration"
        : "";
  const gigantifiedClass = msg.isGigantifiedEmote ? "gigantified-emote" : "";
  const messageClasses = [
    "message",
    msg.messageType || "chat",
    powerUpClass,
    gigantifiedClass,
    msg.isPreloaded ? "preloaded" : "",
    msg.isDeleted ? "deleted" : "",
    msg.isBot ? "bot" : "",
    (msg.mentionsUser || isMentioned) && !msg.isBot ? "mention" : "",
    parityClass,
  ]
    .filter(Boolean)
    .join(" ");

  const isBroadcaster = Boolean(msg.badges && msg.badges["broadcaster"]);
  const isModeratorMsg = Boolean(msg.badges && msg.badges["moderator"]);
  const isUnmoderatable = isBroadcaster || isModeratorMsg || msg.isCurrentUser;

  const eventStyle = (() => {
    const cfg = msg.messageType ? EVENT_CONFIG[msg.messageType] : undefined;
    const powerUpCfg = msg.powerUpType
      ? EVENT_CONFIG[msg.powerUpType.replace(/_/g, "-")]
      : undefined;
    const gigantifiedCfg = msg.isGigantifiedEmote
      ? EVENT_CONFIG["gigantified-emote"]
      : undefined;
    const activeCfg = cfg || powerUpCfg || gigantifiedCfg;
    return activeCfg
      ? ({
          "--event-color": activeCfg.color,
          "--event-bg": activeCfg.bg,
        } as React.CSSProperties)
      : undefined;
  })();

  const handleCtx = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e, msg);
  };

  const replyAuthorColor = authorColorById
    ? getReadableUsernameColor(authorColorById.get(msg.replyTo?.id ?? "")) ||
      "#94a3b8"
    : "#94a3b8";

  const showActionsStrip =
    (!compactActions || keepModActionsVisible) &&
    (!msg.messageType ||
      msg.messageType === "chat" ||
      ((msg.messageType === "timeout" || msg.messageType === "ban") &&
        isModerator &&
        msg.targetUsername));

  const showInlineActions = !compactActions;

  const isModAction =
    msg.messageType === "timeout" || msg.messageType === "ban";

  const inlineActionButtons = showInlineActions && showActionsStrip && !isModAction && (
    <div className="message-actions">
      {onReply && (
        <button
          onClick={() => onReply(msg)}
          className="action-button"
          title="Reply to this message"
          style={{ display: "flex", alignItems: "center", gap: "4px" }}
        >
          <MdReply size={12} />
        </button>
      )}
      <button
        onClick={() => onCopy(msg)}
        className="action-button"
        title="Copy message"
        style={{ display: "flex", alignItems: "center", gap: "4px" }}
      >
        <MdContentCopy size={12} />
      </button>
    </div>
  );

  const modActionButtons = (() => {
    if (!showActionsStrip) return null;
    if (isModAction) {
      return (
        <div className="message-actions">
          <button
            onClick={() => onUntimeoutUser?.(msg.targetUsername!)}
            className="action-button mod-action"
            title="Undo moderation action"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              border: "1px solid currentColor",
              borderRadius: "4px",
              padding: "2px 6px",
              fontSize: "11px",
              marginTop: "2px",
            }}
          >
            Undo
          </button>
        </div>
      );
    }
    if (!isModerator || !modModeActive) return null;
    return (
      <MessageModActions
        onDelete={() => onDeleteMessage?.(msg.id)}
        onTimeout={() => onTimeoutUser?.(msg.userId || "", 600, msg.author)}
        onTimeoutContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onTimeoutMenu(e.clientX, e.clientY, msg.userId || "", msg.author);
        }}
        onBan={() => onBanUser?.(msg.userId || "", msg.author)}
        onWarn={() => onWarnUser?.(msg.author)}
        showUserActions={!isUnmoderatable}
      />
    );
  })();

  return (
    <React.Fragment key={msg.id}>
      {isFirstLive && (
        <div className="live-start-marker">
          <span>Live</span>
        </div>
      )}
      <div
        className={messageClasses}
        data-message-id={msg.id}
        style={eventStyle}
        onTouchStart={() => onTouchStart(msg)}
        onTouchEnd={() => onTouchEnd(msg)}
        onTouchMove={onTouchMove}
        onContextMenu={handleCtx}
      >
        {msg.replyTo && (
          <div
            className="reply-info reply-info-clickable"
            onClick={() => onScrollToMessage(msg.replyTo!.id)}
            title="Jump to original message"
          >
            <span>
              response to{" "}
              <span style={{ color: replyAuthorColor }}>
                @{msg.replyTo.author}
              </span>
              {msg.replyTo.content && (
                <>
                  {": "}
                  <span
                    className="reply-target-content"
                    dangerouslySetInnerHTML={{
                      __html: parseMessageWithEmotes(msg.replyTo.content),
                    }}
                  />
                </>
              )}
            </span>
          </div>
        )}

        <TwitchEventIcon
          messageType={msg.messageType}
          powerUpType={msg.powerUpType}
          isGigantifiedEmote={msg.isGigantifiedEmote}
        />

        <div className="message-single-line">
          {modActionsFirst && modActionButtons}
          <span className="timestamp">
            {msg.timestamp.toLocaleTimeString()}
          </span>
          {children}
          {msg.messageType === "redemption" && msg.rewardTitle && (
            <span className="reward-title-badge">
              {msg.rewardTitle}
              {typeof msg.rewardCost === "number" ? ` (${msg.rewardCost})` : ""}
            </span>
          )}
          <MessageBadges badgeDetails={msg.badgeDetails} badges={msg.badges} />
          <a
            href={`https://twitch.tv/${msg.author}`}
            target="_blank"
            rel="noopener noreferrer"
            className={`author author-link ${msg.isCurrentUser ? "self" : ""}`}
            style={{
              color: msg.isCurrentUser
                ? "#ffffff"
                : getReadableUsernameColor(msg.authorColor),
            }}
            onClick={(e) => onUsernameClick?.(e, msg.author, msg.authorAvatar)}
          >
            {msg.author}
          </a>
          <span className="message-separator">:</span>
          {msg.isDeleted && !deletedRevealed ? (
            <span
              className="message-text deleted-clickable"
              onClick={() => setDeletedRevealed(true)}
            >
              click to see the deleted message
            </span>
          ) : (
            <span
              className="message-text"
              dangerouslySetInnerHTML={{
                __html: parseMessageWithEmotes(msg.content, msg.emotes, {
                  gigantified: msg.isGigantifiedEmote,
                }),
              }}
            />
          )}
          {msg.messageType === "automod" && isModerator && (
            <AutomodActions
              heldMsgId={msg.targetUsername || ""}
              userId={msg.userId || ""}
              username={msg.author}
            />
          )}
          {inlineActionButtons}
          {inlineActionButtons && modActionButtons && !modActionsFirst && (
            <div
              className="message-actions-divider"
              role="separator"
              aria-orientation="vertical"
            />
          )}
          {!modActionsFirst && modActionButtons}
        </div>
        {msg.isDeleted && (
          <div className="deleted-notice">Deleted by a moderator</div>
        )}
      </div>
    </React.Fragment>
  );
}

export const TwitchMessageContent = memo(
  TwitchMessageContentBase,
  (prev, next) => {
    return (
      prev.msg.id === next.msg.id &&
      prev.msg === next.msg &&
      prev.currentUserDisplayName === next.currentUserDisplayName
    );
  },
);
