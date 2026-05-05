export const PLATFORMS = ["twitch", "youtube"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const MAX_DISPLAYED_MESSAGES = 100;

export const MESSAGE_TYPES = [
  "chat",
  "cheer",
  "subscription",
  "resub",
  "subgift",
  "redemption",
  "raid",
  "watch-streak",
  "notice",
  "timeout",
  "ban",
  "announcement",
  "reward-gift",
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
  isDeleted?: boolean; // True if this message was deleted by a moderator
  messageType?: MessageType; // Type of message (chat, cheer, subscription, etc.)
  rewardId?: string; // ID of the redeemed reward
  rewardTitle?: string; // Title/name of the redeemed reward
  targetUsername?: string; // Username of the target for a moderation action
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
  | "lunita";

export const THEME_OPTIONS: { value: ChatTheme; label: string; preview: { bg: string; hover: string } }[] = [
  { value: "default", label: "Default", preview: { bg: "#0c0c0e", hover: "#292930" } },
  { value: "one-dark", label: "One Dark", preview: { bg: "#282c34", hover: "#3e4452" } },
  { value: "catppuccin", label: "Catppuccin", preview: { bg: "#1e1e2e", hover: "#313244" } },
  { value: "night-owl", label: "Night Owl", preview: { bg: "#011627", hover: "#0b2942" } },
  { value: "monokai", label: "Monokai", preview: { bg: "#272822", hover: "#3e3d32" } },
  { value: "sublime-material", label: "Sublime Material", preview: { bg: "#263238", hover: "#37474f" } },
  { value: "mushu", label: "Mushu", preview: { bg: "#1a1111", hover: "#3d1c1c" } },
  { value: "lunita", label: "Lunita", preview: { bg: "#1e2a1e", hover: "#2d4a2d" } },
];
