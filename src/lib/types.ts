export type Platform = "twitch" | "youtube";

export const MAX_DISPLAYED_MESSAGES = 150;

const MESSAGE_TYPES = [
  "chat",
  "cheer",
  "subscription",
  "resub",
  "subgift",
  "redemption",
  "highlight",
  "raid",
  "watch-streak",
  "notice",
  "timeout",
  "ban",
  "untimeout",
  "unban",
  "announcement",
  "reward-gift",
  "gift-purchase",
  "gift-redemption",
  "automod",
] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export interface TwitchMessage {
  id: string;
  platform: Platform;
  author: string;
  /** Twitch login (lowercase, ASCII). Only populated for Twitch messages. */
  userName?: string;
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
  isDeleted?: boolean; // True if this message was deleted by a moderator
  messageType?: MessageType; // Type of message (chat, cheer, subscription, etc.)
  rewardId?: string; // ID of the redeemed reward
  rewardTitle?: string; // Title/name of the redeemed reward
  rewardCost?: number; // Point cost of the redeemed reward
  targetUsername?: string; // Username of the target for a moderation action
  /** Twitch Shared Chat: the originating channel's ID (differs from current channel when message is shared) */
  sourceChannelId?: string;
  /** Twitch Shared Chat: the originating channel's login name */
  sourceChannelLogin?: string;
  /** Twitch Shared Chat: the originating channel's profile image URL */
  sourceChannelAvatar?: string;
  /** True when Twitch's "Gigantify an Emote" power-up (100 bits) was used on this message. */
  isGigantifiedEmote?: boolean;
  /** Twitch Power-up type applied to this message (message_effect or celebration). */
  powerUpType?: "message_effect" | "celebration";
  /** Twitch Power-up message effect ID (e.g. "slide-in", "bouncy") when powerUpType is message_effect. */
  messageEffectId?: string;
  /** True when this message is the user's first message in the channel (from the first-msg IRC tag). */
  isFirstMessage?: boolean;
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
  broadcasterType?: string;
  badges?: Record<string, string>; // badgeName -> imageUrl
  badgeDetails?: Record<string, { url: string; title: string }>; // detailed badge info
}

export type ChatFont =
  | "inter"
  | "open-sans"
  | "roboto"
  | "rubik"
  | "josefin-sans"
  | "nunito"
  | "montserrat";

export const FONT_FAMILY_MAP: Record<ChatFont, string> = {
  inter: "Inter, sans-serif",
  "open-sans": '"Open Sans", sans-serif',
  roboto: "Roboto, sans-serif",
  rubik: "Rubik, sans-serif",
  "josefin-sans": '"Josefin Sans", sans-serif',
  nunito: "Nunito, sans-serif",
  montserrat: "Montserrat, sans-serif",
};

export const CHAT_FONT_OPTIONS: { value: ChatFont; label: string }[] = [
  { value: "inter", label: "Inter" },
  { value: "josefin-sans", label: "Josefin Sans" },
  { value: "rubik", label: "Rubik" },
  { value: "open-sans", label: "Open Sans" },
  { value: "roboto", label: "Roboto" },
  { value: "nunito", label: "Nunito" },
  { value: "montserrat", label: "Montserrat" },
];

export type ChatTheme =
  | "default"
  | "one-dark"
  | "catppuccin"
  | "night-owl"
  | "monokai"
  | "sublime-material"
  | "mushu"
  | "lunita"
  | "twitch";

export const THEME_OPTIONS: {
  value: ChatTheme;
  label: string;
  preview: { bg: string; hover: string; accent: string };
  section?: string;
}[] = [
  {
    value: "default",
    label: "Default",
    preview: { bg: "#0c0c0e", hover: "#292930", accent: "#9e4073" },
  },
  {
    value: "twitch",
    label: "Twitched",
    preview: { bg: "#18181B", hover: "#1f1f23", accent: "#9146ff" },
  },
  {
    value: "one-dark",
    label: "One Dark",
    preview: { bg: "#282c34", hover: "#3e4452", accent: "#56b6c2" },
  },
  {
    value: "catppuccin",
    label: "Catppuccin",
    preview: { bg: "#1e1e2e", hover: "#313244", accent: "#74c7ec" },
  },
  {
    value: "night-owl",
    label: "Night Owl",
    preview: { bg: "#011627", hover: "#0b2942", accent: "#21c7a8" },
  },
  {
    value: "monokai",
    label: "Monokai",
    preview: { bg: "#272822", hover: "#3e3d32", accent: "#f92672" },
  },
  {
    value: "sublime-material",
    label: "Sublime Material",
    preview: { bg: "#263238", hover: "#37474f", accent: "#ff5370" },
  },
  {
    value: "mushu",
    label: "Mushu",
    preview: { bg: "#1a1111", hover: "#3d1c1c", accent: "#e83333" },
    section: "Custom",
  },
  {
    value: "lunita",
    label: "Lunita",
    preview: { bg: "#1e2a1e", hover: "#2d4a2d", accent: "#d4a54a" },
    section: "Custom",
  },
];
