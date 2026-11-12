import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
// Minimal shape shared by `SongQueueItem` and `MusicPlayerItem`. The
// component only reads `id` and `videoId`.
export interface SongQueuePlayerItem {
  id: string;
  videoId: string;
}

/**
 * Shape of `window.YT.Player` we use. The IFrame API loads asynchronously,
 * so the type stays loose. Tests inject a fake `window.YT`.
 */
interface YTPlayer {
  loadVideoById(videoId: string): void;
  playVideo(): void;
  pauseVideo(): void;
  getDuration(): number;
  getCurrentTime(): number;
  getVolume(): number;
  setVolume(percent: number): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  destroy(): void;
}

export type SongQueuePlayerState =
  | "unstarted"
  | "playing"
  | "paused"
  | "ended"
  | "loading";

declare global {
  interface Window {
    YT?: {
      Player: new (
        el: HTMLElement,
        opts: {
          height?: string | number;
          width?: string | number;
          videoId?: string;
          playerVars?: Record<string, string | number>;
          events?: {
            onReady?: (e: { target: YTPlayer }) => void;
            onStateChange?: (e: { data: number; target: YTPlayer }) => void;
            onError?: (e: { data: number }) => void;
          };
        },
      ) => YTPlayer;
      PlayerState: {
        UNSTARTED: -1;
        ENDED: 0;
        PLAYING: 1;
        PAUSED: 2;
        BUFFERING: 3;
        CUED: 5;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

export interface SongQueuePlayerHandle {
  /** Resume playback. No-op if the player isn't ready yet. */
  play(): void;
  /** Pause playback. No-op if the player isn't ready yet. */
  pause(): void;
  /** Get current volume (0–100). Returns 0 if player isn't ready. */
  getVolume(): number;
  /** Set volume (0–100). No-op if the player isn't ready yet. */
  setVolume(percent: number): void;
  /** Get current playback time in seconds. Returns 0 if player isn't ready. */
  getCurrentTime(): number;
  /** Get current video duration in seconds. Returns 0 if player isn't ready. */
  getDuration(): number;
  /** Seek to a position in seconds. No-op if the player isn't ready yet. */
  seekTo(seconds: number): void;
}

interface SongQueuePlayerProps {
  items: SongQueuePlayerItem[];
  currentIndex: number;
  onReady?: () => void;
  /** Called when a video reports ENDED. The host should advance the queue. */
  onAdvance?: () => void;
  /** Called once we know the actual duration of the current video. */
  onDurationKnown?: (itemId: string, durationSec: number) => void;
  /**
   * Called whenever the player's reported state changes. The host can
   * use this to drive a play/pause toggle on a parent control.
   */
  onStateChange?: (state: SongQueuePlayerState) => void;
  /** Optional className for the wrapper element. */
  className?: string;
  ref?: React.Ref<SongQueuePlayerHandle>;
}

/**
 * Load the YouTube IFrame Player API once per page. Poll for
 * `window.YT.Player` to cover scripts already loaded by a previous mount
 * (or the public Astro page) whose `load` event already fired.
 */
function loadIFrameAPI(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      // Restore the previous onYouTubeIframeAPIReady handler so other
      // waiters in the page can still chain off it.
      window.onYouTubeIframeAPIReady = previousReady;
      resolve();
    };
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      settle();
    };

    // Poll for window.YT.Player in case the script was loaded before we
    // attached the global callback. The script is small and loads quickly.
    const interval = window.setInterval(() => {
      // Guard against the timer firing after jsdom has torn down (tests).
      if (typeof window === "undefined") {
        clearInterval(interval);
        return;
      }
      if (window.YT?.Player) {
        window.clearInterval(interval);
        settle();
      }
    }, 50);
    // Stop polling after 10s to avoid a leaked timer on failure.
    window.setTimeout(() => {
      // Guard against the timer firing after jsdom has torn down (tests).
      if (typeof window === "undefined") {
        clearInterval(interval);
        return;
      }
      window.clearInterval(interval);
      if (!window.YT?.Player) {
        // eslint-disable-next-line no-console
        console.warn("YouTube IFrame API did not load within 10s");
      }
      settle();
    }, 10_000);

    // Only inject the script if it isn't already in the DOM. Use a tag
    // marker so multiple waiters share the same element.
    const SCRIPT_ID = "youtube-iframe-api-script";
    if (document.getElementById(SCRIPT_ID)) return;
    const tag = document.createElement("script");
    tag.id = SCRIPT_ID;
    tag.src = "https://www.youtube.com/iframe_api";
    tag.async = true;
    document.head.appendChild(tag);
  });
}

function mapPlayerState(data: number): SongQueuePlayerState {
  switch (data) {
    case 1:
      return "playing";
    case 2:
      return "paused";
    case 0:
      return "ended";
    case 3:
      return "loading";
    case -1:
    case 5:
    default:
      return "unstarted";
  }
}

const SongQueuePlayerInner = ({
  items,
  currentIndex,
  onReady,
  onAdvance,
  onDurationKnown,
  onStateChange,
  className,
  ref,
}: SongQueuePlayerProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const [ready, setReady] = useState(false);
  const lastItemsKeyRef = useRef<string>("");
  const lastIndexRef = useRef<number>(-1);
  const lastStateRef = useRef<SongQueuePlayerState>("unstarted");
  // Track the loaded videoId to avoid reloading when items change but the
  // current song hasn't.
  const lastVideoIdRef = useRef<string>("");
  // Gate the mount effect: creating a player with videoId undefined breaks
  // the iframe ("Invalid video id" until reload), so wait for a valid id.
  const createdRef = useRef(false);
  // Cleared by onStateChange. playVideo() fires once CUED/BUFFERING.
  const pendingPlayRef = useRef(false);
  // Latest callback props, so inline lambdas don't recreate the player.
  const onAdvanceRef = useRef(onAdvance);
  const onDurationKnownRef = useRef(onDurationKnown);
  const onReadyRef = useRef(onReady);
  const onStateChangeRef = useRef(onStateChange);
  useEffect(() => {
    onAdvanceRef.current = onAdvance;
    onDurationKnownRef.current = onDurationKnown;
    onReadyRef.current = onReady;
    onStateChangeRef.current = onStateChange;
  }, [onAdvance, onDurationKnown, onReady, onStateChange]);

  useImperativeHandle(
    ref,
    () => ({
      play: () => {
        try {
          playerRef.current?.playVideo();
        } catch {
          /* not ready yet */
        }
      },
      pause: () => {
        try {
          playerRef.current?.pauseVideo();
        } catch {
          /* not ready yet */
        }
      },
      getVolume: () => {
        try {
          return playerRef.current?.getVolume() ?? 0;
        } catch {
          return 0;
        }
      },
      setVolume: (percent: number) => {
        try {
          playerRef.current?.setVolume(percent);
        } catch {
          /* not ready yet */
        }
      },
      getCurrentTime: () => {
        try {
          return playerRef.current?.getCurrentTime() ?? 0;
        } catch {
          return 0;
        }
      },
      getDuration: () => {
        try {
          return playerRef.current?.getDuration() ?? 0;
        } catch {
          return 0;
        }
      },
      seekTo: (seconds: number) => {
        try {
          playerRef.current?.seekTo(seconds, true);
        } catch {
          /* not ready yet */
        }
      },
    }),
    [],
  );

  // Creating a player with videoId undefined breaks later loadVideoById
  // calls, so wait for the first item before instantiating.
  const initialVideoId = items[currentIndex]?.videoId;
  useEffect(() => {
    if (!containerRef.current) return;
    if (createdRef.current) return;
    if (!initialVideoId) return;
    let cancelled = false;
    (async () => {
      await loadIFrameAPI();
      if (cancelled || !containerRef.current || !window.YT) return;
      const player = new window.YT.Player(containerRef.current, {
        height: "100%",
        width: "100%",
        videoId: initialVideoId,
        playerVars: {
          playsinline: 1,
          autoplay: 1,
          rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            if (cancelled) return;
            setReady(true);
            onReadyRef.current?.();
          },
          onStateChange: (e) => {
            if (cancelled) return;
            const mapped = mapPlayerState(e.data);
            if (mapped !== lastStateRef.current) {
              lastStateRef.current = mapped;
              onStateChangeRef.current?.(mapped);
            }
            if (window.YT?.PlayerState.ENDED !== undefined && e.data === window.YT.PlayerState.ENDED) {
              onAdvanceRef.current?.();
            }
            if (window.YT?.PlayerState.PLAYING !== undefined && e.data === window.YT.PlayerState.PLAYING) {
              const dur = player.getDuration?.();
              if (typeof dur === "number" && dur > 0) {
                const current = items[currentIndexRef.current];
                if (current) onDurationKnownRef.current?.(current.id, dur);
              }
            }
            // Deferred play: call playVideo() on CUED/BUFFERING so playback
            // starts even after the autoplay gesture context expires.
            if (pendingPlayRef.current) {
              const isReady =
                (window.YT?.PlayerState.CUED !== undefined && e.data === window.YT.PlayerState.CUED) ||
                (window.YT?.PlayerState.BUFFERING !== undefined && e.data === window.YT.PlayerState.BUFFERING);
              if (isReady) {
                pendingPlayRef.current = false;
                try { player.playVideo(); } catch { /* not ready yet */ }
              }
            }
          },
        },
      });
      playerRef.current = player;
      createdRef.current = true;
      // Reset tracking refs so the sync effect reloads the video after a
      // fresh player (refs survive React 18 strict-mode double mounts).
      lastItemsKeyRef.current = "";
      lastIndexRef.current = -1;
      lastVideoIdRef.current = "";
    })();
    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy();
      } catch {
        // ignore
      }
      playerRef.current = null;
      createdRef.current = false;
    };
    // Only re-run when the current videoId changes. Callbacks are read via
    // refs and `items` changes are the sync effect's job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialVideoId]);

  // Keep a ref of the current index so async onStateChange closures can read
  // the latest value without re-binding.
  const currentIndexRef = useRef(currentIndex);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  // Sync the player when the items / currentIndex change.
  // We use loadVideoById rather than loadPlaylist because the YouTube
  // IFrame Player API does not reliably expose loadPlaylist as a method
  // on the player instance (it is a URL/playerVars parameter). Queue
  // advancement is handled via the onAdvance callback triggered by the
  // ENDED state change.
  useEffect(() => {
    if (!ready || !playerRef.current) return;
    const currentVideoId = items[currentIndex]?.videoId || "";
    const itemsKey = items.map((it) => it.videoId).join(",");
    if (itemsKey !== lastItemsKeyRef.current) {
      const hadNoItems = !lastItemsKeyRef.current;
      lastItemsKeyRef.current = itemsKey;
      lastIndexRef.current = currentIndex;
      // Only reload the video if the current videoId actually changed.
      // When items merely grow, the current song stays the
      // same and should NOT be restarted.
      if (currentVideoId && currentVideoId !== lastVideoIdRef.current) {
        lastVideoIdRef.current = currentVideoId;
        try {
          playerRef.current.loadVideoById(currentVideoId);
        } catch {
          /* not ready yet */
        }
      }
      // When the player was created empty (no videoId) and the first song
      // arrives, defer playVideo() to the next CUED/BUFFERING state
      // change so playback actually starts.
      if (hadNoItems && currentVideoId) {
        pendingPlayRef.current = true;
      }
    } else if (currentIndex !== lastIndexRef.current) {
      lastIndexRef.current = currentIndex;
      if (currentVideoId !== lastVideoIdRef.current) {
        lastVideoIdRef.current = currentVideoId;
        try {
          playerRef.current.loadVideoById(currentVideoId);
        } catch {
          /* not ready yet */
        }
      }
    }
  }, [items, currentIndex, ready]);

  const current = items[currentIndex];

  return (
    <div className={className ?? "song-queue-player"}>
      <div
        ref={containerRef}
        className="song-queue-player-iframe"
      />
    </div>
  );
};

export default SongQueuePlayerInner;
