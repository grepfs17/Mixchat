/**
 * YouTube video duration probe.
 *
 * Loads the YouTube IFrame Player API in a hidden container, cues the video
 * without playing it, reads `getDuration()`, and tears the player down. The
 * goal is to know a video's length *before* adding it to a queue so the
 * streamer-side app can reject over-length songs up-front.
 *
 * Notes:
 * - We deliberately do NOT use the YouTube Data API (`videos.list`) because
 *   it would require an OAuth scope the app currently avoids. The IFrame API
 *   works against the public, no-auth endpoint.
 * - Live streams report NaN / 0 from `getDuration()`; callers should treat
 *   that as "unknown" and decide what to do.
 * - Unavailable / private / region-locked videos fire `onError`; we resolve
 *   with `null` so the caller can fall back gracefully.
 *
 * The `window.YT` / `window.onYouTubeIframeAPIReady` global typings live in
 * `components/chat/shared/SongQueuePlayer.tsx`; we access them via a small
 * structural cast so this module doesn't have to redeclare them.
 */

const PROBE_TIMEOUT_MS = 10_000;

type ProbePlayer = {
  getDuration(): number;
  destroy(): void;
};

type YTNamespace = {
  Player: new (
    el: HTMLElement,
    opts: {
      height?: string | number;
      width?: string | number;
      videoId?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: { target: ProbePlayer }) => void;
        onStateChange?: (e: { data: number; target: ProbePlayer }) => void;
        onError?: (e: { data: number }) => void;
      };
    },
  ) => ProbePlayer;
};

type WindowWithYT = Window & {
  YT?: YTNamespace;
  onYouTubeIframeAPIReady?: (() => void) | (() => void)[] | (() => unknown);
};

let apiReadyPromise: Promise<void> | null = null;

/**
 * Ensure the YouTube IFrame Player API is loaded. The script tag is
 * idempotent: subsequent calls reuse the existing `<script>` and resolve
 * when `window.YT.Player` becomes available.
 */
function ensureYouTubeApiLoaded(): Promise<void> {
  const w = window as WindowWithYT;
  if (typeof window === "undefined") {
    return Promise.reject(new Error("YouTube API requires a browser"));
  }
  if (w.YT?.Player) return Promise.resolve();
  if (apiReadyPromise) return apiReadyPromise;

  apiReadyPromise = new Promise<void>((resolve, reject) => {
    const scriptId = "youtube-iframe-api";

    const onReady = () => resolve();
    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      if (typeof previous === "function") previous();
      else if (Array.isArray(previous))
        (previous as (() => void)[]).forEach((fn) => fn());
      onReady();
    };

    const existing = document.getElementById(scriptId);
    if (existing) {
      // Script tag exists but API not yet ready — the onReady callback above
      // will fire when it loads.
      return;
    }

    const script = document.createElement("script");
    script.id = scriptId;
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = () => {
      apiReadyPromise = null;
      reject(new Error("Failed to load YouTube IFrame API"));
    };
    document.head.appendChild(script);
  });

  return apiReadyPromise;
}

/**
 * Probe a YouTube video's duration (in seconds) without playing it.
 *
 * Returns the duration on success, or `null` if the API couldn't be loaded,
 * the video is unavailable, or the probe timed out. Callers should treat
 * `null` as "unknown" and decide whether to allow the song through.
 */
export async function probeVideoDuration(videoId: string): Promise<number | null> {
  if (!videoId) return null;

  try {
    await ensureYouTubeApiLoaded();
  } catch {
    return null;
  }
  const w = window as WindowWithYT;
  const Player = w.YT?.Player;
  if (!Player) return null;

  return new Promise<number | null>((resolve) => {
    const container = document.createElement("div");
    container.style.position = "absolute";
    container.style.left = "-9999px";
    container.style.top = "-9999px";
    container.style.width = "1px";
    container.style.height = "1px";
    container.setAttribute("aria-hidden", "true");
    document.body.appendChild(container);

    let settled = false;
    let player: ProbePlayer | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      try {
        player?.destroy();
      } catch {
        /* ignore */
      }
      player = null;
      if (container.parentNode) container.parentNode.removeChild(container);
    };

    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    timeoutId = setTimeout(() => finish(null), PROBE_TIMEOUT_MS);

    try {
      player = new Player(container, {
        height: "1",
        width: "1",
        videoId,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          playsinline: 1,
        },
        events: {
          onReady: (e) => {
            const dur = e.target.getDuration?.();
            if (typeof dur === "number" && dur > 0) {
              finish(dur);
            }
            // If dur is 0 / NaN, we keep waiting — sometimes the video
            // metadata isn't ready the moment onReady fires. CUED will
            // settle it.
          },
          onStateChange: (e) => {
            const dur = e.target.getDuration?.();
            if (typeof dur === "number" && dur > 0) {
              finish(dur);
            }
          },
          onError: () => {
            finish(null);
          },
        },
      });
    } catch {
      finish(null);
    }
  });
}

/**
 * Format a max-duration cap (in seconds) as a chat-friendly string.
 * Examples: 600 → "10 minutes", 3600 → "1 hour", 90 → "1 minute 30 seconds".
 */
export function formatMaxDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0 seconds";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (h > 0) parts.push(`${h} hour${h === 1 ? "" : "s"}`);
  if (m > 0) parts.push(`${m} minute${m === 1 ? "" : "s"}`);
  if (h === 0 && m === 0 && s > 0) {
    parts.push(`${s} second${s === 1 ? "" : "s"}`);
  }
  return parts.join(" ") || "0 seconds";
}
