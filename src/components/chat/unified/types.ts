export interface MessagePart {
  type: "text" | "emoji";
  text?: string;
  url?: string;
  alt?: string;
  emojiText?: string;
  isCustomEmoji?: boolean;
}

export interface YTMessage {
  id: string;
  author: string;
  authorAvatar?: string;
  badges?: Record<string, string>;
  parts: MessagePart[];
  timestamp: Date;
  authorChannelId?: string;
  optimistic?: boolean;
  messageType?: string;
  giftCount?: number;
  recipientName?: string;
  isDeleted?: boolean;
  authorIsModerator?: boolean;
  authorIsOwner?: boolean;
  superchat?: {
    amount: string;
    color: string;
    sticker?: {
      url: string;
      alt: string;
    };
  };
}

export type UnifiedEntry =
  | { source: "twitch"; msg: import("../../../lib/types").TwitchMessage }
  | { source: "youtube"; msg: YTMessage };

export function getKey(e: UnifiedEntry) {
  return e.source + ":" + e.msg.id;
}

export function getTime(e: UnifiedEntry) {
  return e.msg.timestamp instanceof Date
    ? e.msg.timestamp.getTime()
    : new Date(e.msg.timestamp).getTime();
}
