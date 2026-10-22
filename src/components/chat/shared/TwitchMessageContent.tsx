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
import { stripReplyMention } from "../../../lib/twitchReply";
import { MessageModActions } from "./MessageModActions";
import TwitchEventIcon, { EVENT_CONFIG } from "../../TwitchEventIcon";
import type { TwitchMessage } from "../../../lib/types";

interface TwitchMessageContentProps {
  msg: TwitchMessage;
  index: number;
  previousMsg: TwitchMessage | null;
  currentUserDisplayName?: string;
  authorColorById?: Map<string, string>;
  mentionColors?: Map<string, string>;
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

function computeEventStyle(
  msg: TwitchMessage,
): React.CSSProperties | undefined {
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
}

function computeMessageClasses(
  msg: TwitchMessage,
  parityClass: string,
  isMentioned: boolean,
): string {
  const powerUpClass =
    msg.powerUpType === "message_effect"
      ? "message-effect"
      : msg.powerUpType === "celebration"
        ? "celebration"
        : "";
  const gigantifiedClass = msg.isGigantifiedEmote ? "gigantified-emote" : "";
  return [
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
}

function computeIdentity(
  msg: TwitchMessage,
  index: number,
  previousMsg: TwitchMessage | null,
  currentUserDisplayName?: string,
): {
  isFirstLive: boolean;
  messageClasses: string;
  isUnmoderatable: boolean;
} {
  const isMentioned = Boolean(
    currentUserDisplayName && msg.content.includes(currentUserDisplayName),
  );
  const isFirstLive = Boolean(
    !msg.isPreloaded && previousMsg !== null && previousMsg.isPreloaded,
  );
  const parityClass = index % 2 === 0 ? "even" : "odd";
  const messageClasses = computeMessageClasses(msg, parityClass, isMentioned);
  const isBroadcaster = Boolean(msg.badges && msg.badges["broadcaster"]);
  const isModeratorMsg = Boolean(msg.badges && msg.badges["moderator"]);
  const isUnmoderatable = Boolean(
    isBroadcaster || isModeratorMsg || msg.isCurrentUser,
  );
  return { isFirstLive, messageClasses, isUnmoderatable };
}

function computeShowActionsStrip(
  msg: TwitchMessage,
  isModerator: boolean,
  modActionsAlwaysVisible: boolean,
  compactActions: boolean,
  keepModActionsVisible: boolean | undefined,
): boolean {
  return Boolean(
    (modActionsAlwaysVisible || !compactActions || keepModActionsVisible) &&
      (!msg.messageType ||
        msg.messageType === "chat" ||
        ((msg.messageType === "timeout" || msg.messageType === "ban") &&
          isModerator &&
          msg.targetUsername)),
  );
}

function computeReplyAuthorColor(
  msg: TwitchMessage,
  mentionColors?: Map<string, string>,
  authorColorById?: Map<string, string>,
): string {
  const replyAuthorName = msg.replyTo?.author;
  return (
    (replyAuthorName
      ? mentionColors?.get(replyAuthorName.toLowerCase())
      : undefined) ||
    getReadableUsernameColor(authorColorById?.get(msg.replyTo?.id ?? "")) ||
    "#94a3b8"
  );
}

function computeModActionStripShown(
  showActionsStrip: boolean,
  isModAction: boolean,
  isModerator: boolean,
  modModeActive: boolean,
): boolean {
  return showActionsStrip && (isModAction || (isModerator && modModeActive));
}

function computeInlineActionsShown(
  showInlineActions: boolean,
  showActionsStrip: boolean,
  isModAction: boolean,
): boolean {
  return showInlineActions && showActionsStrip && !isModAction;
}

function computeDividerShown(
  inlineActionsShown: boolean,
  modActionStripShown: boolean,
  modActionsFirst: boolean | undefined,
): boolean {
  return inlineActionsShown && modActionStripShown && !modActionsFirst;
}

function TwitchReplyInfo({
  replyTo,
  authorColor,
  content,
  mentionColors,
  onScrollToMessage,
}: {
  replyTo: TwitchMessage["replyTo"];
  authorColor: string;
  content: string;
  mentionColors?: Map<string, string>;
  onScrollToMessage: (id: string) => void;
}) {
  if (!replyTo) return null;
  return (
    <button
      type="button"
      className="reply-info reply-info-clickable"
      onClick={() => onScrollToMessage(replyTo.id)}
      title="Jump to original message"
    >
      <span className="reply-info-label">
        <span>response to <span>&nbsp;</span></span>
        <span style={{ color: authorColor }}>
          @{replyTo.author}:
        </span>
        {content && (
          <span
            className="reply-target-content"
            dangerouslySetInnerHTML={{
              __html: parseMessageWithEmotes(content, undefined, {
                mentionColors,
              }),
            }}
          />
        )}
      </span>
    </button>
  );
}

function TwitchInlineActions({
  msg,
  onReply,
  onCopy,
}: {
  msg: TwitchMessage;
  onReply?: (msg: TwitchMessage) => void;
  onCopy: (msg: TwitchMessage) => void;
}) {
  return (
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
}

function TwitchModActionButtons({
  isModAction,
  modActionsAlwaysVisible,
  msg,
  isUnmoderatable,
  doubleClickConfirmModActions,
  onUntimeoutUser,
  onDeleteMessage,
  onTimeoutMenu,
  onBanUser,
  onWarnUser,
}: {
  isModAction: boolean;
  modActionsAlwaysVisible: boolean;
  msg: TwitchMessage;
  isUnmoderatable: boolean;
  doubleClickConfirmModActions: boolean | undefined;
  onUntimeoutUser?: (userName: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onTimeoutMenu: TwitchMessageContentProps["onTimeoutMenu"];
  onBanUser?: (userId: string, displayName?: string) => void;
  onWarnUser?: (userName: string) => void;
}) {
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
}

function TwitchRedemptionBadge({ msg }: { msg: TwitchMessage }) {
  if (
    msg.messageType !== "redemption" ||
    !msg.rewardTitle ||
    msg.isGigantifiedEmote
  ) {
    return null;
  }
  return (
    <span className="reward-title-badge">
      {msg.rewardTitle}
      {typeof msg.rewardCost === "number" && msg.rewardCost > 0
        ? ` (${msg.rewardCost})`
        : ""}
    </span>
  );
}

function TwitchAuthorLink({
  msg,
  onUsernameClick,
}: {
  msg: TwitchMessage;
  onUsernameClick?: TwitchMessageContentProps["onUsernameClick"];
}) {
  return (
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
  );
}

function TwitchMessageBody({
  msg,
  deletedRevealed,
  onReveal,
  mentionColors,
}: {
  msg: TwitchMessage;
  deletedRevealed: boolean;
  onReveal: () => void;
  mentionColors?: Map<string, string>;
}) {
  if (msg.isDeleted && !deletedRevealed) {
    return (
      <button
        type="button"
        className="message-text deleted-clickable"
        onClick={onReveal}
      >
        click to see the deleted message
      </button>
    );
  }
  return (
    <TwitchMessageText
      content={msg.content}
      emotes={msg.emotes}
      gigantified={msg.isGigantifiedEmote}
      gifs={msg.gifs}
      mentionColors={mentionColors}
    />
  );
}

function TwitchMessageLine({
  msg,
  children,
  mentionColors,
  modActionsFirst,
  modActionStripShown,
  inlineActionsShown,
  dividerShown,
  modActionsAlwaysVisible,
  isModAction,
  isModerator,
  isUnmoderatable,
  doubleClickConfirmModActions,
  deletedRevealed,
  onReveal,
  onReply,
  onCopy,
  onUsernameClick,
  onTimeoutMenu,
  onDeleteMessage,
  onBanUser,
  onWarnUser,
  onUntimeoutUser,
}: {
  msg: TwitchMessage;
  children?: React.ReactNode;
  mentionColors?: Map<string, string>;
  modActionsFirst?: boolean;
  modActionStripShown: boolean;
  inlineActionsShown: boolean;
  dividerShown: boolean;
  modActionsAlwaysVisible: boolean;
  isModAction: boolean;
  isModerator: boolean;
  isUnmoderatable: boolean;
  doubleClickConfirmModActions: boolean | undefined;
  deletedRevealed: boolean;
  onReveal: () => void;
  onReply?: TwitchMessageContentProps["onReply"];
  onCopy: (msg: TwitchMessage) => void;
  onUsernameClick?: TwitchMessageContentProps["onUsernameClick"];
  onTimeoutMenu: TwitchMessageContentProps["onTimeoutMenu"];
  onDeleteMessage?: (messageId: string) => void;
  onBanUser?: (userId: string, displayName?: string) => void;
  onWarnUser?: (userName: string) => void;
  onUntimeoutUser?: (userName: string) => void;
}) {
  return (
    <div className="message-single-line">
      {modActionsFirst && modActionStripShown && (
        <TwitchModActionButtons
          isModAction={isModAction}
          modActionsAlwaysVisible={modActionsAlwaysVisible}
          msg={msg}
          isUnmoderatable={isUnmoderatable}
          doubleClickConfirmModActions={doubleClickConfirmModActions}
          onUntimeoutUser={onUntimeoutUser}
          onDeleteMessage={onDeleteMessage}
          onTimeoutMenu={onTimeoutMenu}
          onBanUser={onBanUser}
          onWarnUser={onWarnUser}
        />
      )}
      <span className="timestamp">
        {msg.timestamp.toLocaleTimeString()}
      </span>
      {children}
      <TwitchRedemptionBadge msg={msg} />
      <MessageBadges badgeDetails={msg.badgeDetails} badges={msg.badges} />
      <TwitchAuthorLink msg={msg} onUsernameClick={onUsernameClick} />
      <span className="message-separator">:</span>
      <TwitchMessageBody
        msg={msg}
        deletedRevealed={deletedRevealed}
        onReveal={onReveal}
        mentionColors={mentionColors}
      />
      {msg.messageType === "automod" && isModerator && (
        <AutomodActions
          heldMsgId={msg.targetUsername || ""}
          userId={msg.userId || ""}
          username={msg.author}
        />
      )}
      {inlineActionsShown && (
        <TwitchInlineActions
          msg={msg}
          onReply={onReply}
          onCopy={onCopy}
        />
      )}
      {dividerShown && (
        <div
          className="message-actions-divider"
          role="separator"
          aria-orientation="vertical"
        />
      )}
      {!modActionsFirst && modActionStripShown && (
        <TwitchModActionButtons
          isModAction={isModAction}
          modActionsAlwaysVisible={modActionsAlwaysVisible}
          msg={msg}
          isUnmoderatable={isUnmoderatable}
          doubleClickConfirmModActions={doubleClickConfirmModActions}
          onUntimeoutUser={onUntimeoutUser}
          onDeleteMessage={onDeleteMessage}
          onTimeoutMenu={onTimeoutMenu}
          onBanUser={onBanUser}
          onWarnUser={onWarnUser}
        />
      )}
    </div>
  );
}

function TwitchMessageContentBase({
  msg,
  index,
  previousMsg,
  currentUserDisplayName,
  authorColorById,
  mentionColors,
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
  const { isFirstLive, messageClasses, isUnmoderatable } = computeIdentity(
    msg,
    index,
    previousMsg,
    currentUserDisplayName,
  );
  const eventStyle = computeEventStyle(msg);

  const handleCtx = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e, msg);
  };

  const replyAuthorColor = computeReplyAuthorColor(
    msg,
    mentionColors,
    authorColorById,
  );

  const replyContent = msg.replyTo
    ? stripReplyMention(msg.replyTo.content, msg.replyTo.author)
    : "";

  const isMobile = isMobileDevice();
  const modActionsAlwaysVisible = isMobile && modModeActive;

  const showActionsStrip = computeShowActionsStrip(
    msg,
    isModerator,
    modActionsAlwaysVisible,
    compactActions,
    keepModActionsVisible,
  );

  const showInlineActions = !compactActions && !modActionsAlwaysVisible;
  const isModAction =
    msg.messageType === "timeout" || msg.messageType === "ban";
  const modActionStripShown = computeModActionStripShown(
    showActionsStrip,
    isModAction,
    isModerator,
    modModeActive,
  );
  const inlineActionsShown = computeInlineActionsShown(
    showInlineActions,
    showActionsStrip,
    isModAction,
  );
  const dividerShown = computeDividerShown(
    inlineActionsShown,
    modActionStripShown,
    modActionsFirst,
  );

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
        <TwitchReplyInfo
          replyTo={msg.replyTo}
          authorColor={replyAuthorColor}
          content={replyContent}
          mentionColors={mentionColors}
          onScrollToMessage={onScrollToMessage}
        />

        <TwitchEventIcon
          messageType={msg.messageType}
          powerUpType={msg.powerUpType}
          isGigantifiedEmote={msg.isGigantifiedEmote}
          isFirstMessage={msg.isFirstMessage}
        />

        <TwitchMessageLine
          msg={msg}
          mentionColors={mentionColors}
          modActionsFirst={modActionsFirst}
          modActionStripShown={modActionStripShown}
          inlineActionsShown={inlineActionsShown}
          dividerShown={dividerShown}
          modActionsAlwaysVisible={modActionsAlwaysVisible}
          isModAction={isModAction}
          isModerator={isModerator}
          isUnmoderatable={isUnmoderatable}
          doubleClickConfirmModActions={doubleClickConfirmModActions}
          deletedRevealed={deletedRevealed}
          onReveal={() => setDeletedRevealed(true)}
          onReply={onReply}
          onCopy={onCopy}
          onUsernameClick={onUsernameClick}
          onTimeoutMenu={onTimeoutMenu}
          onDeleteMessage={onDeleteMessage}
          onBanUser={onBanUser}
          onWarnUser={onWarnUser}
          onUntimeoutUser={onUntimeoutUser}
        >
          {children}
        </TwitchMessageLine>
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
      prev.currentUserDisplayName === next.currentUserDisplayName &&
      prev.mentionColors === next.mentionColors
    );
  },
);

/**
 * Renders a Twitch message body with preview cards for `twitch.tv/...`
 * URLs. Surrounding text keeps the normal emote/link pipeline. Emote
 * ranges use absolute offsets in `content`, so each segment re-bases them.
 * Memoised on content/emote identity.
 */
function TwitchMessageTextBase({
  content,
  emotes,
  gigantified,
  gifs,
  mentionColors,
}: {
  content: string;
  emotes?: Record<string, string[]>;
  gigantified?: boolean;
  gifs?: TwitchGif[];
  mentionColors?: Map<string, string>;
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
      mentionColors,
    });
  }, [content, emotes, gigantified, hasTwitchLinks, hasGifs, mentionColors]);

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
              mentionColors={mentionColors}
            />
          ),
        )}
      </span>
    );
  }

  // Quick path: no Twitch URLs, keep the original single-shot
  // dangerouslySetInnerHTML emote/link pipeline unchanged.
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
          mentionColors={mentionColors}
        />
      ))}
    </span>
  );
}

/**
 * Memoised renderer for one Twitch message segment, so its
 * parseMessageWithEmotes/DOMPurify pass only re-runs when the text or
 * re-based emote offsets change.
 */
function TwitchMessageTextSegmentBase({
  segment,
  emotes,
  gigantified,
  mentionColors,
}: {
  segment: ReturnType<typeof splitByTwitchLinks>[number];
  emotes?: Record<string, string[]>;
  gigantified?: boolean;
  mentionColors?: Map<string, string>;
}) {
  // Compute unconditionally to keep hook order stable. Twitch-link
  // segments skip parseMessageWithEmotes.
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
            mentionColors,
          }),
    [segText, segEmotes, gigantified, isTwitchLink, mentionColors],
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
