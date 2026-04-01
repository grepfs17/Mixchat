export const PLATFORMS = ["twitch", "youtube"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const MESSAGE_TYPES = [
  "chat",
  "cheer",
  "subscription",
  "resub",
  "subgift",
  "redemption",
] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export interface ChatMessage {
  id: string;
  platform: Platform;
  author: string;
  content: string;
  timestamp: Date;
  authorAvatar?: string;
  authorColor?: string;
  userId?: string;
  mentionsUser?: boolean;
  emotes?: Record<string, string[]>; // Twitch emote data: emoteId -> positions
  replyTo?: {
    id: string;
    author: string;
    content: string;
  };
  isBot?: boolean;
  badges?: Record<string, string>; // badgeName -> imageUrl
  badgeDetails?: Record<string, { url: string; title: string }>; // detailed badge info
  isCurrentUser?: boolean; // True if message is from the logged-in user
  optimistic?: boolean; // True if this message is a local optimistic placeholder
  isPreloaded?: boolean; // True if message is from historical data (not live chat)
  messageType?: MessageType; // Type of message (chat, cheer, subscription, etc.)
  rewardId?: string; // ID of the redeemed reward
  /** Twitch Shared Chat: the originating channel's ID (differs from current channel when message is shared) */
  sourceChannelId?: string;
  /** Twitch Shared Chat: the originating channel's login name */
  sourceChannelLogin?: string;
  /** Twitch Shared Chat: the originating channel's profile image URL */
  sourceChannelAvatar?: string;
}

export interface PlatformSession {
  platform: Platform;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  userId: string;
  displayName: string;
  username?: string;
  profileImageUrl?: string;
  badges?: Record<string, string>; // badgeName -> imageUrl
  badgeDetails?: Record<string, { url: string; title: string }>; // detailed badge info
}
