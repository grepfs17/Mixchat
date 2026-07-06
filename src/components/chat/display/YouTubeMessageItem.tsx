import { YouTubeMessageContent } from "../shared/YouTubeMessageContent";
import type { YTMessage } from "../unified/types";

interface YouTubeMessageItemProps {
  msg: YTMessage;
  index: number;
  onTouchStart: (msg: YTMessage) => void;
  onTouchEnd: (msg: YTMessage) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onUsernameClick?: (
    e: React.MouseEvent,
    author: string,
    avatar?: string,
  ) => void;
  showDeletedMessages?: boolean;
}

export function YouTubeMessageItem({
  msg,
  index,
  onTouchStart,
  onTouchEnd,
  onTouchMove,
  onUsernameClick,
  showDeletedMessages = false,
}: YouTubeMessageItemProps) {
  return (
    <YouTubeMessageContent
      msg={msg}
      index={index}
      variant="standalone"
      onTouchStart={() => onTouchStart(msg)}
      onTouchEnd={() => onTouchEnd(msg)}
      onTouchMove={onTouchMove}
      onUsernameClick={onUsernameClick}
      showDeletedMessages={showDeletedMessages}
    />
  );
}
