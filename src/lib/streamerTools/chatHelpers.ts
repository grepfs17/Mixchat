/**
 * Shared chat helpers for streamer tools.
 *
 * Both the giveaway and song-queue extractors need the same primitives
 * for: identifying the channel owner, checking subscription / membership
 * eligibility, reading the message text, and skipping non-live messages.
 * Keep them here so the two tools can stay in sync.
 */
import type { TwitchMessage, Platform } from "../types";
import type { YTMessage } from "../../components/chat/unified/types";

/**
 * Channel-owner identifiers that are always excluded from streamer-tool
 * entries. Twitch uses the broadcaster's userId; YouTube uses the channel
 * owner id. The Twitch `broadcaster` badge and YouTube `authorIsOwner`
 * signal are also respected automatically.
 */
export interface StreamerToolsOwner {
  twitchBroadcasterId?: string;
  youtubeChannelId?: string;
}

/**
 * Discriminated union for the chat feed consumed by streamer tools.
 * `YTMessage` from the unified chat does not carry a `platform` field, so
 * we model each source explicitly rather than casting through `AnyMessage`.
 */
export type StreamerToolsMessage =
  | { platform: "twitch"; msg: TwitchMessage }
  | { platform: "youtube"; msg: YTMessage };

export type { Platform };

export function isSkippableMessage(msg: {
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

export function twitchIsBroadcaster(msg: TwitchMessage): boolean {
  return Boolean(msg.badges?.broadcaster);
}

export function twitchIsSubscriber(msg: TwitchMessage): boolean {
  return Boolean(msg.badges?.subscriber || msg.badges?.["founder"]);
}

export function youtubeIsMember(msg: YTMessage): boolean {
  return Boolean(msg.authorIsMember);
}

/**
 * Returns true if the message qualifies under the given eligibility rule.
 * "everyone" always passes; "subscribers" requires a Twitch sub/founder
 * badge or a YouTube membership.
 */
export function isEligibleForSubscribers(item: StreamerToolsMessage): boolean {
  if (item.platform === "twitch") return twitchIsSubscriber(item.msg);
  return youtubeIsMember(item.msg);
}

/**
 * Returns true if the message comes from the channel owner. The Twitch
 * `broadcaster` badge and YouTube `authorIsOwner` flag are honored; an
 * explicit id from the caller is also matched (case-insensitive).
 */
export function isOwnerMessage(
  item: StreamerToolsMessage,
  owner: StreamerToolsOwner,
): boolean {
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

/**
 * Plain-text content of a chat message. For Twitch, `content` is the
 * raw string. For YouTube, we concatenate the `text` parts.
 */
export function messageContent(item: StreamerToolsMessage): string {
  if (item.platform === "twitch") return item.msg.content;
  return item.msg.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text || "")
    .join(" ");
}

/**
 * Stable, lowercased user id (Twitch userId or YouTube authorChannelId),
 * falling back to the author display name when no id is available.
 * Returns `null` if neither resolves to a non-empty string.
 */
export function stableUserId(item: StreamerToolsMessage): string | null {
  if (item.platform === "twitch") {
    const id = (item.msg.userId || item.msg.author).toLowerCase();
    return id || null;
  }
  const id = (item.msg.authorChannelId || item.msg.author).toLowerCase();
  return id || null;
}

/** Convenience: filter to a single platform when scope restricts it. */
export function isInScope(
  item: StreamerToolsMessage,
  scope: "twitch" | "youtube" | "both",
): boolean {
  if (scope === "both") return true;
  return item.platform === scope;
}
