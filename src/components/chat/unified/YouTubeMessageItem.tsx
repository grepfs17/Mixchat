import { YouTubeMessageContent } from "../shared/YouTubeMessageContent";
import type { UnifiedEntry, YTMessage } from "./types";

interface YouTubeMessageItemProps {
  entry: UnifiedEntry;
  index: number;
  onTouchStart: (entry: UnifiedEntry) => void;
  onTouchEnd: (entry: UnifiedEntry) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onUsernameClick?: (
    e: React.MouseEvent,
    author: string,
    avatar?: string,
  ) => void;
}

export function YouTubeMessageItem({
  entry,
  index,
  onTouchStart,
  onTouchEnd,
  onTouchMove,
  onUsernameClick,
}: YouTubeMessageItemProps) {
  const msg = entry.msg as YTMessage;

  return (
    <YouTubeMessageContent
      msg={msg}
      index={index}
      showPlatformTag
      variant="unified"
      onTouchStart={() => onTouchStart(entry)}
      onTouchEnd={() => onTouchEnd(entry)}
      onTouchMove={onTouchMove}
      onUsernameClick={onUsernameClick}
    />
  );
}
