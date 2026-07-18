import { YouTubeMessageContent } from "../shared/YouTubeMessageContent";
import type { UnifiedEntry, YTMessage } from "./types";

interface YouTubeMessageItemProps {
  entry: UnifiedEntry;
  index: number;
  onTouchStart: (entry: UnifiedEntry) => void;
  onTouchEnd: (entry: UnifiedEntry) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onContextMenu?: (x: number, y: number, entry: UnifiedEntry) => void;
  onTimeoutMenu?: (
    x: number,
    y: number,
    channelId: string,
    username: string,
  ) => void;
  onUsernameClick?: (
    e: React.MouseEvent,
    author: string,
    avatar?: string,
  ) => void;
  showDeletedMessages?: boolean;
  renderThirdPartyEmotes?: boolean;
}

export function YouTubeMessageItem({
  entry,
  index,
  onTouchStart,
  onTouchEnd,
  onTouchMove,
  onContextMenu,
  onTimeoutMenu,
  onUsernameClick,
  showDeletedMessages = false,
  renderThirdPartyEmotes = false,
}: YouTubeMessageItemProps) {
  const msg = entry.msg as YTMessage;

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!onContextMenu) return;
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e.clientX, e.clientY, entry);
  };

  const handleTimeoutMenu = (e: React.MouseEvent) => {
    if (!onTimeoutMenu || !msg.authorChannelId) return;
    e?.preventDefault?.();
    e?.stopPropagation?.();
    const x = typeof e?.clientX === "number" ? e.clientX : 0;
    const y = typeof e?.clientY === "number" ? e.clientY : 0;
    onTimeoutMenu(x, y, msg.authorChannelId, msg.author);
  };

  return (
    <YouTubeMessageContent
      msg={msg}
      index={index}
      showPlatformTag
      variant="unified"
      onTouchStart={() => onTouchStart(entry)}
      onTouchEnd={() => onTouchEnd(entry)}
      onTouchMove={onTouchMove}
      onContextMenu={onContextMenu ? handleContextMenu : undefined}
      onTimeoutMenu={onTimeoutMenu ? handleTimeoutMenu : undefined}
      onUsernameClick={onUsernameClick}
      showDeletedMessages={showDeletedMessages}
      renderThirdPartyEmotes={renderThirdPartyEmotes}
    />
  );
}
