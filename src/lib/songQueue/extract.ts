import type { TwitchMessage, Platform } from "../types";
import type { YTMessage } from "../../components/chat/unified/types";
import {
  parseYouTubeId,
  type SongQueueConfig,
  type SongQueueItem,
  type SongQueueMessage,
  type SongQueueSubmitter,
} from "./types";

export type { Platform };

/**
 * Channel-owner identifiers that are always excluded from queue submissions.
 * Same model as `giveaway.ts`.
 */
export interface SongQueueOwner {
  twitchBroadcasterId?: string;
  youtubeChannelId?: string;
}

export interface SongQueueSubmission {
  videoId: string;
  raw: string;
  submitter: SongQueueSubmitter;
  messageId: string;
  submittedAt: string;
}

const YT_URL_IN_TEXT =
  /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/g;

function twitchIsBroadcaster(msg: TwitchMessage): boolean {
  return Boolean(msg.badges?.broadcaster);
}

function youtubeIsMember(msg: YTMessage): boolean {
  return Boolean(msg.authorIsMember);
}

function twitchIsSubscriber(msg: TwitchMessage): boolean {
  return Boolean(msg.badges?.subscriber || msg.badges?.["founder"]);
}

function isSkippable(msg: {
  optimistic?: boolean;
  isPreloaded?: boolean;
  isDeleted?: boolean;
  messageType?: string;
}): boolean {
  if ("optimistic" in msg && msg.optimistic) return true;
  if ("isPreloaded" in msg && msg.isPreloaded) return true;
  if ("isDeleted" in msg && msg.isDeleted) return true;
  if (msg.messageType && msg.messageType !== "chat") return true;
  return false;
}

function isOwner(item: SongQueueMessage, owner: SongQueueOwner): boolean {
  if (item.platform === "twitch") {
    const m = item.msg;
    if (twitchIsBroadcaster(m)) return true;
    if (owner.twitchBroadcasterId) {
      const id = (m.userId || "").toLowerCase();
      if (id && id === owner.twitchBroadcasterId.toLowerCase()) return true;
    }
    return false;
  }
  const m = item.msg;
  if (m.authorIsOwner) return true;
  if (owner.youtubeChannelId) {
    const id = (m.authorChannelId || "").toLowerCase();
    if (id && id === owner.youtubeChannelId.toLowerCase()) return true;
  }
  return false;
}

function isEligible(item: SongQueueMessage, eligibility: SongQueueConfig["eligibility"]): boolean {
  if (eligibility === "everyone") return true;
  if (item.platform === "twitch") return twitchIsSubscriber(item.msg);
  return youtubeIsMember(item.msg);
}

function submitterFromItem(item: SongQueueMessage): SongQueueSubmitter {
  if (item.platform === "twitch") {
    const m = item.msg;
    return {
      userId: (m.userId || m.author).toLowerCase(),
      author: m.author,
      authorAvatar: m.authorAvatar,
      platform: "twitch",
    };
  }
  const m = item.msg;
  return {
    userId: (m.authorChannelId || m.author).toLowerCase(),
    author: m.author,
    authorAvatar: m.authorAvatar,
    platform: "youtube",
  };
}

function messageContent(item: SongQueueMessage): string {
  if (item.platform === "twitch") return item.msg.content;
  return item.msg.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text || "")
    .join(" ");
}

/**
 * YouTube's structured MessagePart does not have a dedicated "link" type —
 * URLs arrive as plain text. We keep this helper so a future schema change
 * can plug in without rewriting the rest of the extractor.
 */
function urlsFromItem(item: SongQueueMessage): string[] {
  if (item.platform === "twitch") {
    return [item.msg.content];
  }
  return item.msg.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text || "");
}

function extractVideoIdsFromItem(item: SongQueueMessage): string[] {
  const ids = new Set<string>();
  const content = messageContent(item);
  const match = content.match(/^!songadd\s+(\S[\s\S]*)/i);
  if (!match) return [];
  const afterCommand = match[1];
  for (const text of [afterCommand]) {
    for (const m of text.matchAll(YT_URL_IN_TEXT)) {
      if (m[1]) ids.add(m[1]);
    }
    const bare = parseYouTubeId(text);
    if (bare) ids.add(bare);
  }
  return Array.from(ids);
}

function messageId(item: SongQueueMessage): string {
  return item.msg.id;
}

function messageTimestamp(item: SongQueueMessage): string {
  return item.msg.timestamp.toISOString();
}

/**
 * Extract new song submissions from a chat feed.
 *
 * Rules (mirroring `extractEntries` from giveaway.ts):
 * - Only YouTube URLs are accepted. Other links are ignored.
 * - For YouTube messages, `link` parts are preferred over text scraping.
 * - First submission per (platform, userId, videoId) wins; duplicates ignored.
 * - The streamer's account is always excluded.
 * - Eligibility and scope filters applied after dedup.
 * - Pre-loaded, deleted, non-chat messages are ignored.
 * - `perSubmitterLimit` enforced after dedup: existing pending items by the
 *   same submitter are kept; the new one is rejected when the count is at
 *   the limit. The caller decides whether to "replace" the existing pick
 *   by setting `perSubmitterLimit: 0` upstream — we keep the logic simple
 *   here.
 *
 * The function is pure; the caller is responsible for persisting accepted
 * submissions and surfacing rejected ones in the UI.
 */
export function extractSubmissions(
  messages: SongQueueMessage[],
  config: Pick<SongQueueConfig, "scope" | "eligibility" | "perSubmitterLimit">,
  owner: SongQueueOwner = {},
  existingQueue: SongQueueItem[] = [],
): { accepted: SongQueueSubmission[]; rejected: { messageId: string; reason: string }[] } {
  const accepted: SongQueueSubmission[] = [];
  const rejected: { messageId: string; reason: string }[] = [];
  // Per-(platform, userId, videoId) so the same chatter submitting the same
  // song twice keeps only the first.
  const seen = new Set<string>();
  // Per-(platform, userId) tally of currently pending items.
  const pendingBySubmitter = new Map<string, number>();
  for (const item of existingQueue) {
    if (item.status !== "pending") continue;
    const k = `${item.submitter.platform}:${item.submitter.userId}`;
    pendingBySubmitter.set(k, (pendingBySubmitter.get(k) || 0) + 1);
  }

  for (const item of messages) {
    if (item.platform === "twitch" && config.scope === "youtube") continue;
    if (item.platform === "youtube" && config.scope === "twitch") continue;
    if (isSkippable(item.msg)) continue;
    if (isOwner(item, owner)) continue;
    if (!isEligible(item, config.eligibility)) {
      rejected.push({ messageId: messageId(item), reason: "not eligible" });
      continue;
    }
    const videoIds = extractVideoIdsFromItem(item);
    if (videoIds.length === 0) {
      // No URL in the message — not a rejection we need to surface; skip silently.
      continue;
    }
    for (const videoId of videoIds) {
      const key = `${item.platform}:${submitterFromItem(item).userId}:${videoId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const submitter = submitterFromItem(item);
      const submitterKey = `${submitter.platform}:${submitter.userId}`;
      const current = pendingBySubmitter.get(submitterKey) || 0;
      if (current >= config.perSubmitterLimit) {
        rejected.push({
          messageId: messageId(item),
          reason: "per-submitter limit reached",
        });
        continue;
      }
      accepted.push({
        videoId,
        raw: messageContent(item),
        submitter,
        messageId: messageId(item),
        submittedAt: messageTimestamp(item),
      });
      pendingBySubmitter.set(submitterKey, current + 1);
    }
  }

  return { accepted, rejected };
}
