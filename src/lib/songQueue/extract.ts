import type { Platform } from "../types";
import {
  parseYouTubeId,
  type SongQueueConfig,
  type SongQueueItem,
  type SongQueueMessage,
  type SongQueueSubmitter,
} from "./types";
import {
  isEligibleForSubscribers,
  isOwnerMessage,
  isSkippableMessage,
  messageContent,
  stableUserId,
  type StreamerToolsOwner,
} from "../streamerTools/chatHelpers";

/**
 * Channel-owner identifiers that are always excluded from queue submissions.
 * Mirrors the giveaway owner shape (see `chatHelpers.ts`).
 */
export type SongQueueOwner = StreamerToolsOwner;

export interface SongQueueSubmission {
  videoId: string;
  raw: string;
  submitter: SongQueueSubmitter;
  messageId: string;
  submittedAt: string;
}

const YT_URL_IN_TEXT =
  /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/g;

function isEligible(item: SongQueueMessage, eligibility: SongQueueConfig["eligibility"]): boolean {
  if (eligibility === "everyone") return true;
  return isEligibleForSubscribers(item);
}

function submitterFromItem(item: SongQueueMessage): SongQueueSubmitter {
  const userId = stableUserId(item) || "";
  const author = item.msg.author;
  if (item.platform === "twitch") {
    return {
      userId,
      author,
      authorAvatar: item.msg.authorAvatar,
      platform: "twitch",
    };
  }
  return {
    userId,
    author,
    authorAvatar: item.msg.authorAvatar,
    platform: "youtube",
  };
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
 * Extract new song submissions from a chat feed, mirroring giveaway rules:
 * - Only YouTube URLs are accepted. YouTube `link` parts are preferred.
 * - First submission per (platform, userId, videoId) wins.
 * - The streamer's account is always excluded.
 * - Eligibility/scope filters and `perSubmitterLimit` are applied after dedup.
 * - Pre-loaded, deleted, non-chat messages are ignored.
 *
 * Pure: the caller persists accepted submissions and surfaces rejections.
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
    if (isSkippableMessage(item.msg)) continue;
    if (isOwnerMessage(item, owner)) continue;
    if (!isEligible(item, config.eligibility)) {
      rejected.push({ messageId: messageId(item), reason: "not eligible" });
      continue;
    }
    const videoIds = extractVideoIdsFromItem(item);
    if (videoIds.length === 0) {
      // No URL in the message, not a rejection we need to surface, so skip silently.
      continue;
    }
    for (const videoId of videoIds) {
      const submitter = submitterFromItem(item);
      const key = `${item.platform}:${submitter.userId}:${videoId}`;
      if (seen.has(key)) continue;
      seen.add(key);
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

