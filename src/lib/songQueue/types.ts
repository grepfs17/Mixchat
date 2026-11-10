/**
 * Song Queue streamer tool.
 *
 * The streamer app collects YouTube URLs from chat, validates them via the
 * public `youtube.com/oembed` endpoint, and persists a server-side session
 * (see `lib/server/songQueueStore.ts`). A local IDB mirror (`idb.ts`) keeps the
 * UI snappy. Mutations are optimistic (IDB first, then server, revert on
 * failure). A public Astro page (`pages/s/[sessionId].astro`) renders the queue
 * via the YouTube IFrame Player API.
 *
 * No new OAuth scopes: only `youtube.com/iframe_api` and `youtube.com/oembed`
 * are called, neither authenticated.
 */

export type SongQueueScope = "twitch" | "youtube" | "both";
export type SongQueueEligibility = "everyone" | "subscribers";
export type SongQueuePlatform = "twitch" | "youtube";
export type SongQueueItemStatus = "pending" | "playing" | "played" | "skipped";

export interface SongQueueSubmitter {
  /** Stable id: Twitch userId or YouTube authorChannelId, lowercased. */
  userId: string;
  author: string;
  authorAvatar?: string;
  platform: SongQueuePlatform;
}

export interface SongQueueItem {
  id: string;
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  /**
   * Duration in seconds. Stays 0 until the player reports it, then updates
   * lazily on the first PLAYING event for that item. Used to enforce
   * `maxSongDurationSec`.
   */
  durationSec: number;
  submitter: SongQueueSubmitter;
  submittedAt: string;
  status: SongQueueItemStatus;
}

export interface SongQueueConfig {
  title: string;
  maxQueueLength: number;
  maxSongDurationSec: number;
  perSubmitterLimit: number;
  eligibility: SongQueueEligibility;
  scope: SongQueueScope;
  isPublic: boolean;
  announceOnPlay: boolean;
  loop: boolean;
}

export interface SongQueueSession {
  sessionId: string;
  title: string;
  /** Channel display name (e.g. "streamerlogin") used for the public page link. */
  channelName: string;
  /** Platform origin ("twitch" or "youtube") for building the channel link. */
  channelPlatform: string;
  ownerTokenHash: string;
  createdAt: string;
  lastSeenAt: string;
  isPublic: boolean;
  /**
   * Full streamer-side configuration for this session. Optional for
   * backward compatibility with sessions created before this field was
   * added. Absent values fall back to `DEFAULT_SONG_QUEUE_CONFIG`.
   */
  config?: SongQueueConfig;
  currentIndex: number;
  /**
   * Shared play/pause intent. The audio host (streamer browser) follows
   * this flag with its local iframe; moderators toggle it to pause or
   * resume playback on the broadcaster's device. Absent = not paused.
   */
  isPlaying?: boolean;
  /**
   * Shared volume 0-100 for the audio host's iframe. Moderators may
   * change it; the host applies it locally. Absent = 100.
   */
  volume?: number;
  /**
   * Id of the item most recently claimed for the "now playing" chat
   * announcement. Server-side so only one open client posts it.
   */
  announcedItemId?: string | null;
  /** Monotonic counter incremented on every mutation. Used by the public
   * page's polling loop to detect changes. */
  version: number;
  /** True after the streamer calls /close. */
  ended: boolean;
  items: SongQueueItem[];
}

export interface SongQueueOwnerBootstrap {
  sessionId: string;
  ownerToken: string;
  isPublic: boolean;
  publicUrl: string;
  title: string;
  channelName: string;
  channelPlatform: string;
  createdAt: string;
}

/**
 * Public, stripped-down view served to anyone with the share link. The
 * `userId` of the submitter is dropped so a public viewer cannot pivot to a
 * platform profile.
 */
export interface SongQueuePublicView {
  title: string;
  /** Channel display name for the public page link. */
  channelName: string;
  /** Platform origin ("twitch" or "youtube") for building the channel link. */
  channelPlatform: string;
  currentIndex: number;
  version: number;
  ended: boolean;
  /** ISO timestamp of when this session was created. */
  createdAt: string;
  items: Array<
    Pick<
      SongQueueItem,
      | "id"
      | "videoId"
      | "title"
      | "channelTitle"
      | "thumbnail"
      | "status"
      | "submittedAt"
      | "durationSec"
    > & {
      submitter: Pick<SongQueueSubmitter, "author" | "platform">;
    }
  >;
}

/**
 * Streamer owner-side message shape. Mirrors the giveaway's `GiveawayMessage`
 * (see `src/lib/streamerTools/giveaway.ts`).
 */
export type SongQueueMessage =
  | { platform: "twitch"; msg: import("../types").TwitchMessage }
  | {
      platform: "youtube";
      msg: import("../../components/chat/unified/types").YTMessage;
    };

export const DEFAULT_SONG_QUEUE_CONFIG: SongQueueConfig = {
  title: "",
  maxQueueLength: 50,
  maxSongDurationSec: 600, // 10 minutes
  perSubmitterLimit: 1,
  eligibility: "everyone",
  scope: "both",
  isPublic: false,
  announceOnPlay: false,
  loop: false,
};

/**
 * The hard ceiling the streamer cannot exceed. Above this, the queue UX
 * becomes unusable (200 songs × ~30s each ≈ 1.5 hours of pre-loaded metadata).
 */
export const MAX_QUEUE_LENGTH_CEILING = 200;

export const MAX_SONG_DURATION_CEILING_SEC = 60 * 60; // 1 hour absolute max

/**
 * URL parser for YouTube videos. Accepts:
 * - `https://www.youtube.com/watch?v=ID`
 * - `https://youtube.com/watch?v=ID&t=42s`
 * - `https://youtu.be/ID`
 * - `https://www.youtube.com/shorts/ID`
 * - bare `ID` (11 chars)
 *
 * Returns the 11-char id, or `null` for anything else.
 */
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const YT_PATTERNS = [
  /(?:youtube\.com\/watch\?(?:.*&)?v=)([A-Za-z0-9_-]{11})/,
  /(?:youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
  /(?:youtu\.be\/)([A-Za-z0-9_-]{11})/,
];

export function parseYouTubeId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (YT_ID.test(trimmed)) return trimmed;
  for (const pattern of YT_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}
