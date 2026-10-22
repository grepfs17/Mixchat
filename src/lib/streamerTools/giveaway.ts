import type { Platform } from "../types";
import {
  isEligibleForSubscribers,
  isOwnerMessage as isOwnerMessageShared,
  isSkippableMessage,
  messageContent as messageContentShared,
  stableUserId,
  type StreamerToolsMessage,
  type StreamerToolsOwner,
} from "./chatHelpers";

export type GiveawayScope = "twitch" | "youtube" | "both";
export type GiveawayEligibility = "everyone" | "subscribers";

export interface GiveawayConfig {
  keyword: string;
  durationSeconds: number;
  scope: GiveawayScope;
  eligibility: GiveawayEligibility;
}

/** Backward-compat alias for the shared owner shape. */
export type GiveawayOwner = StreamerToolsOwner;

export interface GiveawayEntry {
  /** Stable id (Twitch userId or YouTube authorChannelId), lowercased. */
  userId: string;
  author: string;
  authorAvatar?: string;
  platform: Platform;
}

/** Backward-compat alias for the shared message shape. */
export type GiveawayMessage = StreamerToolsMessage;

/**
 * Strips leading/trailing non-alphanumeric characters from a token so that
 * `!enter`, `"enter"`, and `enter` all normalize to `enter`. Applied to both
 * the configured keyword and each chat token so commands work as keywords.
 */
const TOKEN_EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

function stripTokenEdges(token: string): string {
  return token.replace(TOKEN_EDGE_PUNCTUATION, "");
}

export function normalizeKeyword(raw: string): string {
  return stripTokenEdges(raw.normalize("NFKC").trim().toLowerCase());
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
    .map(stripTokenEdges)
    .filter(Boolean);
  return tokens.includes(keywordNormalized);
}

function isEligible(
  item: GiveawayMessage,
  eligibility: GiveawayEligibility,
): boolean {
  if (eligibility === "everyone") return true;
  return isEligibleForSubscribers(item);
}

function toEntry(item: GiveawayMessage): GiveawayEntry | null {
  const id = stableUserId(item);
  if (!id) return null;
  const author = item.msg.author;
  if (item.platform === "twitch") {
    return {
      userId: id,
      author,
      authorAvatar: item.msg.authorAvatar,
      platform: "twitch",
    };
  }
  return {
    userId: id,
    author,
    authorAvatar: item.msg.authorAvatar,
    platform: "youtube",
  };
}

/**
 * Extract giveaway entries from a chat feed.
 *
 * Rules:
 * - Exact word match (case-insensitive, NFKC-normalized).
 * - First match per (platform, user) wins. Duplicates are ignored.
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
    if (isSkippableMessage(item.msg)) continue;
    if (isOwnerMessageShared(item, owner)) continue;
    if (!messageMatchesKeyword(messageContentShared(item), keyword)) continue;
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
  return `🏆 Winner: ${winner.author} !`;
}

