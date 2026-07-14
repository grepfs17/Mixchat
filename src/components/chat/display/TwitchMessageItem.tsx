import React, { memo } from "react";
import { TwitchMessageContent } from "../shared/TwitchMessageContent";
import type { TwitchMessage } from "../../../lib/types";

function hashChannelColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  const hue = (hash >>> 0) % 360;
  return `hsl(${hue}, 80%, 60%)`;
}

interface TwitchMessageItemProps {
  msg: TwitchMessage;
  index: number;
  filteredMessages: TwitchMessage[];
  authorColorById: Map<string, string>;
  currentUserDisplayName?: string;
  onReply?: (msg: TwitchMessage) => void;
  onCopy: (msg: TwitchMessage) => void;
  onUsernameClick?: (
    e: React.MouseEvent,
    author: string,
    avatar?: string,
  ) => void;
  onTimeoutMenu: (state: {
    x: number;
    y: number;
    userId: string;
    username: string;
  }) => void;
  onScrollToMessage: (id: string) => void;
  onTouchStart: (msg: TwitchMessage) => void;
  onTouchEnd: (msg: TwitchMessage) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  fontSize?: number;
  onContextMenu: (e: React.MouseEvent, msg: TwitchMessage) => void;
}

function SharedChatSource({ msg }: { msg: TwitchMessage }) {
  if (!msg.sourceChannelId) return null;
  const channelColor = hashChannelColor(msg.sourceChannelId);
  return (
    <span
      className="shared-chat-source"
      title={`From ${msg.sourceChannelLogin ?? msg.sourceChannelId}'s chat (Shared Chat)`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        marginRight: "2px",
        position: "relative",
        flexShrink: 0,
      }}
    >
      {msg.sourceChannelAvatar ? (
        <img
          src={msg.sourceChannelAvatar}
          alt={msg.sourceChannelLogin ?? msg.sourceChannelId}
          style={{
            width: "22px",
            height: "22px",
            borderRadius: "50%",
            border: `1.5px solid ${channelColor}`,
            verticalAlign: "middle",
            display: "block",
          }}
        />
      ) : (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "16px",
            height: "16px",
            borderRadius: "50%",
            border: `2px solid ${channelColor}`,
            background: "#18181b",
            fontSize: "9px",
            color: channelColor,
            fontWeight: "bold",
            flexShrink: 0,
          }}
        >
          {(msg.sourceChannelLogin ?? msg.sourceChannelId)
            .charAt(0)
            .toUpperCase()}
        </span>
      )}
    </span>
  );
}

function DisplayTwitchMessageItemBase({
  msg,
  index,
  filteredMessages,
  authorColorById,
  currentUserDisplayName,
  onReply,
  onCopy,
  onUsernameClick,
  onTimeoutMenu,
  onScrollToMessage,
  onTouchStart,
  onTouchEnd,
  onTouchMove,
  onContextMenu,
}: TwitchMessageItemProps) {
  const previousMsg = index > 0 ? filteredMessages[index - 1] : null;

  return (
    <TwitchMessageContent
      msg={msg}
      index={index}
      previousMsg={previousMsg}
      currentUserDisplayName={currentUserDisplayName}
      authorColorById={authorColorById}
      onReply={onReply}
      onCopy={onCopy}
      onUsernameClick={onUsernameClick}
      onTimeoutMenu={(x, y, userId, username) =>
        onTimeoutMenu({ x, y, userId, username })
      }
      onContextMenu={onContextMenu}
      onScrollToMessage={onScrollToMessage}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchMove={onTouchMove}
    >
      <SharedChatSource msg={msg} />
    </TwitchMessageContent>
  );
}

/**
 * Display-mode Twitch message item. Renders inside the legacy ChatDisplay
 * surface (no platform tag), with a Shared Chat source avatar when applicable.
 * Renamed from `TwitchMessageItem` to disambiguate from the unified-chat
 * variant under src/components/chat/unified/.
 */
export const DisplayTwitchMessageItem = memo(DisplayTwitchMessageItemBase, (prev, next) => {
  return (
    prev.msg.id === next.msg.id &&
    prev.msg === next.msg &&
    prev.currentUserDisplayName === next.currentUserDisplayName
  );
});
