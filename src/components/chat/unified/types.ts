export interface MessagePart {
  type: "text" | "emoji" | "twitch-link";
  text?: string;
  url?: string;
  alt?: string;
  emojiText?: string;
  isCustomEmoji?: boolean;
  /** When type === "twitch-link", the original text/url the user typed. */
  twitchUrl?: string;
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
  deletedByText?: string;
  authorIsModerator?: boolean;
  authorIsOwner?: boolean;
  authorIsMember?: boolean;
  /** Username of the target when this message is a system note (e.g. "X was removed from the chat"). */
  targetUsername?: string;
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
