import type { TwitchMessage, Platform } from "../types";
import type { YTMessage } from "../../components/chat/unified/types";

export type GiveawayScope = "twitch" | "youtube" | "both";
export type GiveawayEligibility = "everyone" | "subscribers";

export interface GiveawayConfig {
  keyword: string;
  durationSeconds: number;
  scope: GiveawayScope;
  eligibility: GiveawayEligibility;
}

/**
 * Channel-owner identifiers that are always excluded from giveaway entries.
 * Twitch uses the broadcaster's userId; YouTube uses the channel owner id.
 * The Twitch `broadcaster` badge and YouTube `authorIsOwner` signal are
 * also respected automatically — the channel owner is never eligible.
 */
export interface GiveawayOwner {
  twitchBroadcasterId?: string;
  youtubeChannelId?: string;
}

export interface GiveawayEntry {
  /** Stable id (Twitch userId or YouTube authorChannelId), lowercased. */
  userId: string;
  author: string;
  authorAvatar?: string;
  platform: Platform;
}

/**
 * Discriminated union for the chat feed that can feed a giveaway.
 * `YTMessage` from the unified chat does not carry a `platform` field, so
 * we model each source explicitly rather than casting through `AnyMessage`.
 */
export type GiveawayMessage =
  | { platform: "twitch"; msg: TwitchMessage }
  | { platform: "youtube"; msg: YTMessage };

export function normalizeKeyword(raw: string): string {
  return raw.normalize("NFKC").trim().toLowerCase();
}

export function messageMatchesKeyword(
  content: string,
  keywordNormalized: string,
): boolean {
  if (!keywordNormalized) return false;
  const tokens = content
    .normalize("NFKC")
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);
  return tokens.includes(keywordNormalized);
}

function twitchIsSubscriber(msg: TwitchMessage): boolean {
  return Boolean(msg.badges?.subscriber || msg.badges?.["founder"]);
}

function youtubeIsMember(msg: YTMessage): boolean {
  return Boolean(msg.authorIsMember);
}

function isEligible(
  item: GiveawayMessage,
  eligibility: GiveawayEligibility,
): boolean {
  if (eligibility === "everyone") return true;
  if (item.platform === "twitch") {
    return twitchIsSubscriber(item.msg);
  }
  return youtubeIsMember(item.msg);
}

function twitchIsBroadcaster(msg: TwitchMessage): boolean {
  return Boolean(msg.badges?.broadcaster);
}

function isOwnerMessage(item: GiveawayMessage, owner: GiveawayOwner): boolean {
  if (item.platform === "twitch") {
    if (twitchIsBroadcaster(item.msg)) return true;
    if (owner.twitchBroadcasterId) {
      const id = (item.msg.userId || "").toLowerCase();
      if (id && id === owner.twitchBroadcasterId.toLowerCase()) return true;
    }
    return false;
  }
  if (item.msg.authorIsOwner) return true;
  if (owner.youtubeChannelId) {
    const id = (item.msg.authorChannelId || "").toLowerCase();
    if (id && id === owner.youtubeChannelId.toLowerCase()) return true;
  }
  return false;
}

function toEntry(item: GiveawayMessage): GiveawayEntry | null {
  if (item.platform === "twitch") {
    const m = item.msg;
    const id = (m.userId || m.author).toLowerCase();
    if (!id) return null;
    return {
      userId: id,
      author: m.author,
      authorAvatar: m.authorAvatar,
      platform: "twitch",
    };
  }
  const m = item.msg;
  const id = (m.authorChannelId || m.author).toLowerCase();
  if (!id) return null;
  return {
    userId: id,
    author: m.author,
    authorAvatar: m.authorAvatar,
    platform: "youtube",
  };
}

function messageContent(item: GiveawayMessage): string {
  if (item.platform === "twitch") return item.msg.content;
  return item.msg.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text || "")
    .join("");
}

function isSkippable(item: GiveawayMessage): boolean {
  const m = item.msg;
  if ("optimistic" in m && m.optimistic) return true;
  if ("isPreloaded" in m && m.isPreloaded) return true;
  if ("isDeleted" in m && m.isDeleted) return true;
  if (m.messageType && m.messageType !== "chat") return true;
  return false;
}

/**
 * Extract giveaway entries from a chat feed.
 *
 * Rules:
 * - Exact word match (case-insensitive, NFKC-normalized).
 * - First match per (platform, user) wins; duplicates are ignored.
 * - Eligibility and scope filters applied after dedup.
 * - Pre-loaded / optimistic / deleted / non-chat messages are ignored.
 */
export function extractEntries(
  messages: GiveawayMessage[],
  config: GiveawayConfig,
  owner: GiveawayOwner = {},
): GiveawayEntry[] {
  const keyword = normalizeKeyword(config.keyword);
  if (!keyword) return [];
  const seen = new Map<string, GiveawayEntry>();
  const firstMatchByKey = new Map<string, GiveawayMessage>();
  for (const item of messages) {
    if (item.platform === "twitch" && config.scope === "youtube") continue;
    if (item.platform === "youtube" && config.scope === "twitch") continue;
    if (isSkippable(item)) continue;
    if (isOwnerMessage(item, owner)) continue;
    if (!messageMatchesKeyword(messageContent(item), keyword)) continue;
    const entry = toEntry(item);
    if (!entry) continue;
    const key = `${entry.platform}:${entry.userId}`;
    if (!seen.has(key)) {
      seen.set(key, entry);
      firstMatchByKey.set(key, item);
    }
  }
  const result: GiveawayEntry[] = [];
  for (const [key, entry] of seen) {
    const original = firstMatchByKey.get(key);
    if (original && !isEligible(original, config.eligibility)) continue;
    result.push(entry);
  }
  return result;
}

export function pickWinner(entries: GiveawayEntry[]): GiveawayEntry | null {
  if (entries.length === 0) return null;
  const idx = Math.floor(Math.random() * entries.length);
  return entries[idx];
}

export function formatWinnerAnnouncement(
  winner: GiveawayEntry,
  keyword: string,
): string {
  const safe = keyword.replace(/[\r\n]+/g, " ").trim();
  return `🏆 Winner: ${winner.author}! Thanks for playing — keyword was "${safe}".`;
}
