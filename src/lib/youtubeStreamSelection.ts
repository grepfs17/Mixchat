/**
 * Shared helpers for choosing which live broadcast drives the YouTube chat
 * and embed when a channel runs more than one at the same time.
 */

const STORAGE_KEY = "mixchat_youtube_stream:v1";
const VIDEO_ID_RE = /^[\w-]{11}$/;

export interface YoutubeLiveCandidate {
  videoId: string;
  title?: string;
  thumbnailUrl?: string;
  isVertical?: boolean;
}

export function isYoutubeVideoId(value: unknown): value is string {
  return typeof value === "string" && VIDEO_ID_RE.test(value);
}

/** Extract a video ID from a direct watch, live, shorts, or youtu.be URL. */
export function parseDirectVideoId(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (isYoutubeVideoId(trimmed)) return trimmed;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    try {
      parsed = new URL(`https://${trimmed}`);
    } catch {
      return null;
    }
  }

  try {
    const host = parsed.hostname.replace(/^(www|m)\./, "");

    if (host === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return isYoutubeVideoId(id) ? id : null;
    }

    if (host === "youtube.com" || host === "music.youtube.com") {
      const fromQuery = parsed.searchParams.get("v");
      if (isYoutubeVideoId(fromQuery)) return fromQuery;

      const segments = parsed.pathname.split("/").filter(Boolean);
      if (
        (segments[0] === "live" ||
          segments[0] === "shorts" ||
          segments[0] === "embed") &&
        isYoutubeVideoId(segments[1])
      ) {
        return segments[1];
      }
    }
  } catch {
    return null;
  }
  return null;
}

/** Prefer a landscape broadcast when both orientations are live. */
export function pickPrimaryLiveCandidate(
  candidates: YoutubeLiveCandidate[],
): YoutubeLiveCandidate | null {
  if (candidates.length === 0) return null;
  return candidates.find((candidate) => !candidate.isVertical) ?? candidates[0];
}

export interface ResolveYoutubeStreamInput {
  manualVideoId?: string;
  storedVideoId?: string | null;
  candidates: YoutubeLiveCandidate[];
}

/**
 * Manual input always wins (it can point at an unlisted broadcast that the
 * live lookup cannot see). A stored pick sticks while it is still live. The
 * primary candidate is the fallback.
 */
export function resolveYoutubeVideoId({
  manualVideoId,
  storedVideoId,
  candidates,
}: ResolveYoutubeStreamInput): string | null {
  if (manualVideoId) return manualVideoId;
  if (storedVideoId && candidates.some((c) => c.videoId === storedVideoId)) {
    return storedVideoId;
  }
  return pickPrimaryLiveCandidate(candidates)?.videoId ?? null;
}

function readStore(): Record<string, string> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const store: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (isYoutubeVideoId(value)) store[key] = value;
    }
    return store;
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, string>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Storage can be full or disabled. The selection still works for the session.
  }
}

export function readStoredYoutubeStream(
  channelKey: string | null | undefined,
): string | null {
  if (!channelKey) return null;
  return readStore()[channelKey] ?? null;
}

export function writeStoredYoutubeStream(
  channelKey: string,
  videoId: string,
): void {
  if (!channelKey || !isYoutubeVideoId(videoId)) return;
  const store = readStore();
  store[channelKey] = videoId;
  writeStore(store);
}

export function clearStoredYoutubeStream(channelKey: string): void {
  if (!channelKey) return;
  const store = readStore();
  if (!(channelKey in store)) return;
  delete store[channelKey];
  writeStore(store);
}
