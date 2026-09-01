import React, { memo } from "react";
import { TwitchMessageContent } from "../shared/TwitchMessageContent";
import { PlatformTag } from "./PlatformTag";
import type { TwitchMessage } from "../../../lib/types";
import type { UnifiedEntry } from "./types";

interface TwitchMessageItemProps {
  entry: UnifiedEntry;
  index: number;
  entries: UnifiedEntry[];
  currentUserDisplayName?: string;
  onReply?: (msg: TwitchMessage) => void;
  onCopyMessage?: () => void;
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
  onMessageMenu: (x: number, y: number, entry: UnifiedEntry) => void;
  onTouchStart: (entry: UnifiedEntry) => void;
  onTouchEnd: (entry: UnifiedEntry) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onScrollToMessage?: (id: string) => void;
}

function UnifiedTwitchMessageItemBase({
  entry,
  index,
  entries,
  currentUserDisplayName,
  onReply,
  onCopyMessage,
  onUsernameClick,
  onTimeoutMenu,
  onMessageMenu,
  onTouchStart,
  onTouchEnd,
  onTouchMove,
  onScrollToMessage,
}: TwitchMessageItemProps) {
  const msg = entry.msg as TwitchMessage;
  const previousMsg =
    index > 0 ? (entries[index - 1].msg as TwitchMessage) : null;

  return (
    <TwitchMessageContent
      msg={msg}
      index={index}
      previousMsg={previousMsg}
      currentUserDisplayName={currentUserDisplayName}
      onReply={onReply}
      onCopy={() => {
        if (navigator.clipboard) {
          navigator.clipboard
            .writeText(msg.content)
            .then(() => onCopyMessage?.())
            .catch(() => {});
        }
      }}
      onUsernameClick={onUsernameClick}
      onTimeoutMenu={onTimeoutMenu}
      onContextMenu={(e, m) => onMessageMenu(e.clientX, e.clientY, entry)}
      onScrollToMessage={onScrollToMessage ?? (() => {})}
      onTouchStart={() => onTouchStart(entry)}
      onTouchEnd={() => onTouchEnd(entry)}
      onTouchMove={onTouchMove}
    >
      <PlatformTag source="twitch" />
    </TwitchMessageContent>
  );
}

/**
 * Unified-mode Twitch message item. Renders inside the merged Twitch+YouTube
 * chat surface with a `PlatformTag` so the source platform is visible.
 * The runtime toggle `unifyChatEnabled` picks between this variant and the
 * split-chat `DisplayTwitchMessageItem`.
 */
export const UnifiedTwitchMessageItem = memo(UnifiedTwitchMessageItemBase, (prev, next) => {
  return (
    prev.entry === next.entry &&
    prev.entry.msg.id === next.entry.msg.id &&
    prev.index === next.index &&
    prev.currentUserDisplayName === next.currentUserDisplayName
  );
});
