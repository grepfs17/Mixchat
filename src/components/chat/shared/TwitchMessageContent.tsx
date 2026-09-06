import React, { memo, useState } from "react";
import { MdReply, MdContentCopy } from "react-icons/md";
import { parseMessageWithEmotes } from "../../../lib/emotes";
import { getReadableUsernameColor } from "../../../lib/chatColors";
import { renderAuthorLabel } from "../../../lib/twitchAuthorLabel";
import { useModerationContext } from "../../../contexts/ModerationContext";
import { isMobileDevice } from "../../../lib/device";
import MessageBadges from "../../MessageBadges";
import AutomodActions from "./AutomodActions";
import TwitchLinkPreview from "../TwitchLinkPreview";
import { rebaseEmotesForSegment, splitByTwitchLinks } from "../../../lib/twitchLink";
import { splitMessageByGifs, type TwitchGif } from "../../../lib/twitchGifs";
import { MessageModActions } from "./MessageModActions";
import TwitchEventIcon, { EVENT_CONFIG } from "../../TwitchEventIcon";
import type { TwitchMessage } from "../../../lib/types";

interface TwitchMessageContentProps {
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
    doubleClickConfirmModActions,
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
    msg.isFirstMessage ? "first-message" : "",
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
    const firstMessageCfg = msg.isFirstMessage
      ? EVENT_CONFIG["first-message"]
      : undefined;
    const activeCfg = cfg || powerUpCfg || gigantifiedCfg || firstMessageCfg;
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

  const isMobile = isMobileDevice();
  const modActionsAlwaysVisible = isMobile && modModeActive;

  const showActionsStrip =
    (modActionsAlwaysVisible || !compactActions || keepModActionsVisible) &&
    (!msg.messageType ||
      msg.messageType === "chat" ||
      ((msg.messageType === "timeout" || msg.messageType === "ban") &&
        isModerator &&
        msg.targetUsername));

  const showInlineActions = !compactActions && !modActionsAlwaysVisible;

  const isModAction =
    msg.messageType === "timeout" || msg.messageType === "ban";

  const inlineActionButtons = showInlineActions &&
    showActionsStrip &&
    !isModAction && (
      <div className="message-actions">
        {onReply && (
          <button type="button"
            onClick={() => onReply(msg)}
            className="action-button"
            title="Reply to this message"
            style={{ display: "flex", alignItems: "center", gap: "4px" }}
          >
            <MdReply size={12} />
          </button>
        )}
        <button type="button"
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
        <div className={`message-actions${modActionsAlwaysVisible ? " message-actions--mod-active" : ""}`}>
          <button type="button"
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
        onTimeout={(e) => onTimeoutMenu(e?.clientX || 0, e?.clientY || 0, msg.userId || "", msg.author)}
        onBan={() => onBanUser?.(msg.userId || "", msg.author)}
        onWarn={() => onWarnUser?.(msg.author)}
        showUserActions={!isUnmoderatable}
        doubleClickConfirm={doubleClickConfirmModActions}
        forceVisible={modActionsAlwaysVisible}
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
        {msg.replyTo && (            <button
              type="button"
              className="reply-info reply-info-clickable"
              onClick={() => onScrollToMessage(msg.replyTo!.id)}
              title="Jump to original message"
            >
            <span className="reply-info-label">
              <span>response to <span>&nbsp;</span></span>
              <span style={{ color: replyAuthorColor }}>
                @{msg.replyTo.author}:
              </span>
              {msg.replyTo.content && (
                <>
                  <span
                    className="reply-target-content"
                    dangerouslySetInnerHTML={{
                      __html: parseMessageWithEmotes(msg.replyTo.content),
                    }}
                  />
                </>
              )}
            </span>
          </button>
        )}

        <TwitchEventIcon
          messageType={msg.messageType}
          powerUpType={msg.powerUpType}
          isGigantifiedEmote={msg.isGigantifiedEmote}
          isFirstMessage={msg.isFirstMessage}
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
            {renderAuthorLabel(msg.author, msg.userName)}
          </a>
          <span className="message-separator">:</span>
          {msg.isDeleted && !deletedRevealed ? (
        <button
          type="button"
          className="message-text deleted-clickable"
          onClick={() => setDeletedRevealed(true)}
        >
              click to see the deleted message
            </button>
          ) : (
            <TwitchMessageText
              content={msg.content}
              emotes={msg.emotes}
              gigantified={msg.isGigantifiedEmote}
              gifs={msg.gifs}
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
      prev.index === next.index &&
      prev.previousMsg === next.previousMsg &&
      prev.currentUserDisplayName === next.currentUserDisplayName
    );
  },
);

/**
 * Renders a Twitch chat message body with rich preview cards swapped in
 * wherever a `twitch.tv/...` URL appears. Text segments between URLs are
 * still parsed via the existing emote+link pipeline so Twitch emotes,
 * third-party emotes, mentions, links and Twemoji all behave exactly as
 * before. Emote character ranges live in absolute coordinates within
 * `content`, so we re-base them for each text segment.
 *
 * Memoised with content/emote-key identity — React reconciliation handles
 * new messages, edits, and message-removal as the parent passes new data;
 * within a single message the segments are stable for its lifetime.
 */
function TwitchMessageTextBase({
  content,
  emotes,
  gigantified,
  gifs,
}: {
  content: string;
  emotes?: Record<string, string[]>;
  gigantified?: boolean;
  gifs?: TwitchGif[];
}) {
  const gifSegments = React.useMemo(
    () => splitMessageByGifs(content, gifs),
    [content, gifs],
  );
  const segments = React.useMemo(() => splitByTwitchLinks(content), [content]);
  const hasGifs = gifSegments.some((s) => s.type === "gif");
  const hasTwitchLinks = segments.some((s) => s.type === "twitch-link");
  const html = React.useMemo(() => {
    if (hasTwitchLinks || hasGifs) return null;
    return parseMessageWithEmotes(content, emotes, {
      gigantified,
    });
  }, [content, emotes, gigantified, hasTwitchLinks, hasGifs]);

  // Giphy GIF messages: splice the image in where the GIF range sits and
  // keep the surrounding caption text on the regular emote pipeline. The
  // segments from splitMessageByGifs carry absolute offsets, so the emote
  // re-basing inside TwitchMessageTextSegment still lines up with `content`.
  if (hasGifs) {
    return (
      <span className="message-text">
        {gifSegments.map((seg, i) =>
          seg.type === "gif" ? (
            <img
              key={`tw-gif-${i}-${seg.id}`}
              className="chat-gif"
              src={seg.url}
              alt={content.slice(seg.start, seg.end)}
              loading="lazy"
              draggable={false}
            />
          ) : (
            <TwitchMessageTextSegment
              key={`tw-seg-${i}-text`}
              segment={seg}
              emotes={emotes}
              gigantified={gigantified}
            />
          ),
        )}
      </span>
    );
  }

  // Quick path: no Twitch URLs in the message. The original logic used
  // `dangerouslySetInnerHTML` once for emotes + unicode emoji + general
  // link wrapping. We keep that exact behaviour here to avoid behavioural
  // changes for messages without a twitch URL.
  if (!hasTwitchLinks && html !== null) {
    return (
      <span
        className="message-text"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <span className="message-text">
      {segments.map((seg, i) => (
        <TwitchMessageTextSegment
          key={`tw-seg-${i}-${seg.type}`}
          segment={seg}
          emotes={emotes}
          gigantified={gigantified}
        />
      ))}
    </span>
  );
}

/**
 * Memoised renderer for one segment of a Twitch message body. Pulled out of
 * `TwitchMessageText` so each segment's `parseMessageWithEmotes` call (and
 * the DOMPurify pass it triggers) only re-runs when this segment's text or
 * the re-based emote offsets actually change.
 */
function TwitchMessageTextSegmentBase({
  segment,
  emotes,
  gigantified,
}: {
  segment: ReturnType<typeof splitByTwitchLinks>[number];
  emotes?: Record<string, string[]>;
  gigantified?: boolean;
}) {
  // Compute the emote rebase and the parsed HTML unconditionally so the
  // hooks order stays stable across renders regardless of segment type.
  // Twitch-link segments skip the parseMessageWithEmotes call.
  const isTwitchLink = segment.type === "twitch-link";
  const segEmotes = isTwitchLink
    ? undefined
    : rebaseEmotesForSegment(emotes, segment.start, segment.end);
  const segText = isTwitchLink ? "" : segment.text;
  const segHtml = React.useMemo(
    () =>
      isTwitchLink
        ? ""
        : parseMessageWithEmotes(segText, segEmotes, {
            gigantified,
          }),
    [segText, segEmotes, gigantified, isTwitchLink],
  );

  if (isTwitchLink) {
    return (
      <TwitchLinkPreview
        url={segment.url}
        parts={segment.parts}
      />
    );
  }
  return <span dangerouslySetInnerHTML={{ __html: segHtml }} />;
}

const TwitchMessageTextSegment = memo(TwitchMessageTextSegmentBase);

const TwitchMessageText = memo(TwitchMessageTextBase);
