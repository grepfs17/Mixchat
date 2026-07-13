import { getBadgeDetail } from "./badges";
import type { TwitchMessage, MessageType } from "./types";
import { getCachedAvatar } from "./twitchChatCache";

/** Extract badge images and details from a Twurple user info object. */
export function extractBadges(userInfo: { badges: Map<string, string> }): {
  badges: Record<string, string>;
  badgeDetails: Record<string, { url: string; title: string }>;
} {
  const badges: Record<string, string> = {};
  const badgeDetails: Record<string, { url: string; title: string }> = {};
  userInfo.badges.forEach((version, badgeName) => {
    const detail = getBadgeDetail(badgeName, version);
    if (detail) {
      badges[badgeName] = detail.url;
      badgeDetails[badgeName] = { url: detail.url, title: detail.title };
    }
  });
  return { badges, badgeDetails };
}

/** Parse badges from a raw IRC badges tag string. */
export function parseBadgeString(badgesStr: string): {
  badges: Record<string, string>;
  badgeDetails: Record<string, { url: string; title: string }>;
} {
  const badges: Record<string, string> = {};
  const badgeDetails: Record<string, { url: string; title: string }> = {};
  if (!badgesStr) return { badges, badgeDetails };
  badgesStr.split(",").forEach((badge) => {
    const [name, version] = badge.split("/");
    if (!name || !version) return;
    const detail = getBadgeDetail(name, version);
    if (detail) {
      badges[name] = detail.url;
      badgeDetails[name] = { url: detail.url, title: detail.title };
    }
  });
  return { badges, badgeDetails };
}

/** Build a standard system TwitchMessage (mod actions, mode changes, etc.). */
export function createSystemMessage(
  content: string,
  messageType: MessageType,
  extra?: Partial<TwitchMessage>,
): TwitchMessage {
  const isError = messageType === "timeout" || messageType === "ban";
  return {
    id: `${messageType}-${Date.now()}`,
    platform: "twitch",
    author: "System",
    content,
    timestamp: new Date(),
    userId: "system",
    authorColor: isError ? "#ef4444" : "#94a3b8",
    mentionsUser: false,
    emotes: {},
    isBot: true,
    badges: {},
    badgeDetails: {},
    messageType,
    ...extra,
  };
}

/** Build a TwitchMessage from a user-triggered IRC event (sub, raid, etc.). */
export function buildUserTwitchMessage(
  msg: {
    id: string;
    date: Date;
    userInfo: {
      userId: string;
      userName: string;
      displayName: string;
      color?: string | null;
      badges: Map<string, string>;
    };
  },
  content: string,
  username: string,
  overrides?: Partial<TwitchMessage>,
): TwitchMessage {
  const { badges, badgeDetails } = extractBadges(msg.userInfo);
  return {
    id: msg.id,
    platform: "twitch",
    author: msg.userInfo.displayName || msg.userInfo.userName || "Anonymous",
    userName: msg.userInfo.userName,
    content,
    timestamp: msg.date,
    userId: msg.userInfo.userId,
    authorColor: msg.userInfo.color || "#FFFFFF",
    authorAvatar: getCachedAvatar(msg.userInfo.userId),
    mentionsUser: false,
    emotes: {},
    isBot: msg.userInfo.badges.has("bot"),
    badges,
    badgeDetails,
    isCurrentUser:
      msg.userInfo.userName.toLowerCase() === username.toLowerCase(),
    ...overrides,
  };
}

/** Shift Twitch emote offsets by a prefix length so they align with prefixed content. */
export function shiftEmoteOffsets(
  emoteOffsets: Map<string, string[]>,
  shift: number,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  emoteOffsets.forEach((offsets, emoteId) => {
    result[emoteId] = offsets.map((pos) => {
      const [start, end] = pos.split("-").map(Number);
      return `${start + shift}-${end + shift}`;
    });
  });
  return result;
}
