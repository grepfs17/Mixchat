import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { getBadgeDetail } from "../../lib/badges";
import type { TwitchMessage } from "../../lib/types";

export interface VodChatPlayerLike {
  getCurrentTime(): number;
}

interface VodChatFragment {
  text: string;
  emote: { id: string; from: number } | null;
}

interface VodChatComment {
  id: string;
  offsetSeconds: number;
  createdAt: string;
  authorId: string;
  authorLogin: string;
  author: string;
  color: string | null;
  fragments: VodChatFragment[];
  badges: Array<{ name: string; version: string }>;
}

interface VodChatResponse {
  comments?: VodChatComment[];
  cursor?: string | null;
  hasNextPage?: boolean;
  error?: string;
}

export interface UseVodChatOptions {
  videoId: string | null | undefined;
  playerRef?: RefObject<VodChatPlayerLike | null>;
  currentUserId?: string;
  enabled?: boolean;
}

export interface UseVodChatResult {
  messages: TwitchMessage[];
  loading: boolean;
  error: string | null;
}

const TICK_MS = 1000;
const FETCH_AHEAD_SECONDS = 20;
const SEEK_THRESHOLD_SECONDS = 4;
const MAX_PAGES_PER_TICK = 8;
const MAX_PENDING_MESSAGES = 5000;
const MAX_SEEN_IDS = 20_000;
const MAX_RETAINED_MESSAGES = 2000;
const RETRY_DELAY_MS = 3000;

function buildEmoteMap(
  fragments: VodChatFragment[],
): Record<string, string[]> {
  const emotes: Record<string, string[]> = {};
  let position = 0;

  for (const fragment of fragments) {
    const text = fragment.text ?? "";
    if (fragment.emote?.id) {
      const start = fragment.emote.from ?? position;
      const end = start + Math.max(0, text.length - 1);
      (emotes[fragment.emote.id] ??= []).push(`${start}-${end}`);
    }
    position += text.length;
  }

  return emotes;
}

function toTwitchMessage(
  comment: VodChatComment,
  currentUserId: string,
): TwitchMessage {
  const content = comment.fragments.map((fragment) => fragment.text).join("");
  const badges: Record<string, string> = {};
  const badgeDetails: Record<string, { url: string; title: string }> = {};

  for (const badge of comment.badges) {
    const detail = getBadgeDetail(badge.name, badge.version);
    if (!detail?.url) continue;
    badges[badge.name] = detail.url;
    badgeDetails[badge.name] = { url: detail.url, title: detail.title };
  }

  return {
    id: comment.id,
    platform: "twitch",
    author: comment.author || comment.authorLogin || "unknown",
    userName: comment.authorLogin || undefined,
    content,
    timestamp: comment.createdAt ? new Date(comment.createdAt) : new Date(),
    authorColor: comment.color || undefined,
    userId: comment.authorId || undefined,
    emotes: buildEmoteMap(comment.fragments),
    badges,
    badgeDetails,
    isCurrentUser: Boolean(
      currentUserId && comment.authorId === currentUserId,
    ),
    isPreloaded: true,
  };
}

/**
 * Replays a Twitch VOD's chat in sync with the embedded player. Comments are
 * fetched a little ahead of the playhead and revealed as the video reaches
 * them. A backward seek clears the visible replay. A forward seek keeps what
 * is already visible and rebases the fetch window at the new position.
 */
export function useVodChat({
  videoId,
  playerRef,
  currentUserId = "",
  enabled = true,
}: UseVodChatOptions): UseVodChatResult {
  const [messages, setMessages] = useState<TwitchMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentUserIdRef = useRef(currentUserId);
  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    if (!videoId || !enabled) {
      setMessages([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    let initialized = false;
    let lastTime = -1;
    let cursor: string | null = null;
    let bufferEnd = 0;
    let hasMore = true;
    let fetching = false;
    let retryAt = 0;
    let generation = 0;
    let pending: Array<{ offset: number; message: TwitchMessage }> = [];
    const seenIds = new Set<string>();

    setMessages([]);
    setLoading(true);
    setError(null);

    const resetAt = (time: number, clearMessages: boolean) => {
      generation += 1;
      cursor = null;
      bufferEnd = Math.max(0, time);
      hasMore = true;
      retryAt = 0;
      pending = [];
      seenIds.clear();
      setError(null);
      if (clearMessages) {
        setMessages([]);
        setLoading(true);
      } else {
        setLoading(false);
      }
    };

    const appendReady = (time: number) => {
      if (pending.length === 0) return;

      let readyCount = 0;
      while (
        readyCount < pending.length &&
        pending[readyCount].offset <= time + 0.5
      ) {
        readyCount += 1;
      }
      if (readyCount === 0) return;

      const ready = pending
        .slice(0, readyCount)
        .map((entry) => entry.message);
      pending = pending.slice(readyCount);

      setMessages((previous) => {
        const existing = new Set(previous.map((message) => message.id));
        const fresh = ready.filter((message) => !existing.has(message.id));
        if (fresh.length === 0) return previous;
        const next = [...previous, ...fresh];
        return next.length > MAX_RETAINED_MESSAGES
          ? next.slice(-MAX_RETAINED_MESSAGES)
          : next;
      });
    };

    const fetchMore = async (time: number) => {
      if (fetching || !hasMore || Date.now() < retryAt) return;
      if (bufferEnd >= time + FETCH_AHEAD_SECONDS) return;

      fetching = true;
      const fetchGeneration = generation;
      try {
        let pages = 0;
        while (
          !cancelled &&
          fetchGeneration === generation &&
          hasMore &&
          pages < MAX_PAGES_PER_TICK &&
          pending.length < MAX_PENDING_MESSAGES &&
          bufferEnd < time + FETCH_AHEAD_SECONDS
        ) {
          const params = new URLSearchParams({ video_id: videoId });
          if (cursor) {
            params.set("cursor", cursor);
          } else {
            params.set("offset", String(Math.max(0, Math.floor(bufferEnd))));
          }

          const res = await fetch(`/api/twitch-vod-chat?${params}`);
          if (cancelled || fetchGeneration !== generation) return;
          if (!res.ok) {
            const data = (await res.json().catch(() => ({}))) as VodChatResponse;
            throw new Error(data.error || "Failed to load VOD chat");
          }

          const data = (await res.json()) as VodChatResponse;
          if (cancelled || fetchGeneration !== generation) return;

          const comments = Array.isArray(data.comments) ? data.comments : [];
          if (comments.length === 0) {
            hasMore = false;
            break;
          }

          for (const comment of comments) {
            if (seenIds.has(comment.id)) continue;
            seenIds.add(comment.id);
            if (seenIds.size > MAX_SEEN_IDS) {
              const oldest = seenIds.values().next().value;
              if (oldest !== undefined) seenIds.delete(oldest);
            }
            pending.push({
              offset: comment.offsetSeconds,
              message: toTwitchMessage(comment, currentUserIdRef.current),
            });
          }

          // Keep the messages due soonest. Fetching stops once the buffer is
          // full, so trimming only trims the far end of an unusually busy page.
          if (pending.length > MAX_PENDING_MESSAGES) {
            pending = pending.slice(0, MAX_PENDING_MESSAGES);
          }

          const lastOffset = comments[comments.length - 1].offsetSeconds;
          bufferEnd = Math.max(bufferEnd, lastOffset);
          cursor = data.cursor ?? null;
          hasMore = Boolean(data.hasNextPage && cursor);
          pages += 1;

          if (!cursor) {
            hasMore = false;
            break;
          }
        }

        if (!cancelled && fetchGeneration === generation) setLoading(false);
      } catch (err) {
        if (cancelled || fetchGeneration !== generation) return;
        retryAt = Date.now() + RETRY_DELAY_MS;
        setError(err instanceof Error ? err.message : "Failed to load VOD chat");
        setLoading(false);
      } finally {
        fetching = false;
      }
    };

    const tick = () => {
      if (cancelled) return;
      const player = playerRef?.current;
      if (!player) return;

      let time: number;
      try {
        time = player.getCurrentTime();
      } catch {
        return;
      }
      if (!Number.isFinite(time) || time < 0) return;

      if (!initialized) {
        initialized = true;
        lastTime = time;
        resetAt(time, true);
      } else if (time < lastTime - SEEK_THRESHOLD_SECONDS) {
        lastTime = time;
        resetAt(time, true);
      } else if (time > lastTime + SEEK_THRESHOLD_SECONDS) {
        lastTime = time;
        resetAt(time, false);
      } else {
        lastTime = time;
      }

      appendReady(time);
      void fetchMore(time);
    };

    tick();
    const interval = setInterval(tick, TICK_MS);
    const readyTimeout = setTimeout(() => {
      if (!cancelled && !initialized) {
        setLoading(false);
        setError("Play the VOD to load its chat replay.");
      }
    }, 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(readyTimeout);
    };
  }, [videoId, enabled, playerRef]);

  return { messages, loading, error };
}
