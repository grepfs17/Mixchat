import { useState, useEffect, useRef } from "react";
import HLS from "hls.js";
import StreamEmbedPlaceholder from "./StreamEmbedPlaceholder";
import StreamAuthBadge from "./StreamAuthBadge";

// Twitch Player JS API types
declare global {
  interface Window {
    Twitch?: {
      Player: new (
        elementId: string,
        options: {
          width: string | number;
          height: string | number;
          channel: string;
          parent: string[];
          autoplay?: boolean;
          layout?: string;
          muted?: boolean;
          oauth_token?: string;
        },
      ) => TwitchPlayer;
      Embed: {
        new (
          elementId: string,
          options: {
            width: string | number;
            height: string | number;
            channel?: string;
            video?: string;
            parent: string[];
            autoplay?: boolean;
            layout?: "video-with-chat" | "video";
            muted?: boolean;
            quality?: string;
            theme?: "light" | "dark";
          },
        ): TwitchEmbed;
        AUTHENTICATE: string;
        VIDEO_PLAY: string;
        VIDEO_PAUSE: string;
        VIDEO_READY: string;
      };
    };
  }
}

export interface TwitchQualityInfo {
  name?: string;
  group?: string;
  height?: number;
  bitrate?: number;
  bandwidth?: number;
}

export type TwitchQuality = string | TwitchQualityInfo;

export interface TwitchPlayer {
  setChannel(channel: string): void;
  destroy(): void;
  play(): void;
  pause(): void;
  getPaused(): boolean;
  getCurrentTime(): number;
  getMuted(): boolean;
  getQuality?(): TwitchQuality | null;
  getQualities(): TwitchQuality[];
  setMuted(muted: boolean): void;
  setQuality(quality: TwitchQuality): void;
  setVolume(volume: number): void;
  getVolume(): number;
  addEventListener(event: string, callback: () => void): void;
  removeEventListener(event: string, callback: () => void): void;
}

interface TwitchEmbed {
  getPlayer(): TwitchPlayer;
  destroy(): void;
  getQuality?(): TwitchQuality | null;
  getQualities?(): TwitchQuality[];
  setQuality?(quality: TwitchQuality): void;
  addEventListener(event: string, callback: () => void): void;
  removeEventListener(event: string, callback: () => void): void;
}

interface StreamEmbedProps {
  channelName: string;
  playerType?: "embed" | "m3u8";
  twitchConnected?: boolean;
  onTwitchLogin?: () => void;
  /** User's Twitch OAuth access token, passed to the embed player so it can
   *  authenticate without relying on cookies/localStorage (Brave Shields). */
  twitchAccessToken?: string;
  onQualitiesLoaded?: (
    qualities: Array<{ label: string; url: string }>,
  ) => void;
  externalSelectedQualityIdx?: number;
  /** Resolution the live embed should start at. Capped at 1080p for now. */
  defaultResolution?: string;
  /** URL of the stream thumbnail to show as a placeholder while the stream loads. */
  placeholderThumbnailUrl?: string;
  /** Callback when the stream player has finished loading and the placeholder should fade out. */
  onPlaceholderFadeOut?: () => void;
}

/**
 * Codecs this engine can decode. Twitch publishes 1440p (2K) only in HEVC,
 * so advertising every codec would hand an undecodable variant to browsers
 * without HEVC support.
 */
function detectPlayableCodecs(): string[] {
  const supports = (type: string): boolean => {
    if (
      typeof MediaSource !== "undefined" &&
      typeof MediaSource.isTypeSupported === "function" &&
      MediaSource.isTypeSupported(type)
    ) {
      return true;
    }
    // Safari/WKWebView can play HEVC through native HLS without MSE reporting it.
    if (typeof document === "undefined") return false;
    return document.createElement("video").canPlayType(type) !== "";
  };

  const codecs = ["h264"];
  if (
    supports('video/mp4; codecs="hvc1.1.6.L153.B0"') ||
    supports('video/mp4; codecs="hev1.1.6.L153.B0"')
  ) {
    codecs.unshift("h265");
  }
  if (supports('video/mp4; codecs="av01.0.08M.08"')) {
    codecs.unshift("av1");
  }
  return codecs;
}

function isQualityPlayable(
  codecs: string | undefined,
  supported: string[],
): boolean {
  if (!codecs) return true;
  const value = codecs.toLowerCase();
  if (value.includes("av01")) return supported.includes("av1");
  if (value.includes("hvc1") || value.includes("hev1")) {
    return supported.includes("h265");
  }
  if (value.includes("avc1")) return supported.includes("h264");
  return true;
}

// Twitch serves 1440p (2K) as HEVC/AV1 only, which has been unreliable in the
// HLS player. Keep every embed at 1080p or lower until that path is stable.
const EMBED_MAX_HEIGHT = 1080;

function qualityHeight(label: string): number | null {
  const match = label.match(/(\d{3,4})p/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function capEmbedQualities<T extends { label: string }>(qualities: T[]): T[] {
  return qualities.filter((quality) => {
    const height = qualityHeight(quality.label);
    return height === null || height <= EMBED_MAX_HEIGHT;
  });
}

function qualityName(quality: TwitchQuality): string | null {
  if (typeof quality === "string") return quality;
  return typeof quality.name === "string" ? quality.name : null;
}

function qualityGroup(quality: TwitchQuality): string | null {
  return typeof quality === "object" && typeof quality.group === "string"
    ? quality.group
    : null;
}

function qualityBitrate(quality: TwitchQuality): number {
  if (typeof quality !== "object") return 0;
  return quality.bitrate ?? quality.bandwidth ?? 0;
}

function qualityPixelHeight(quality: TwitchQuality): number | null {
  if (typeof quality === "object" && typeof quality.height === "number") {
    return quality.height;
  }
  const name = qualityName(quality);
  return name ? qualityHeight(name) : null;
}

function pickQualityAtOrBelow(
  qualities: TwitchQuality[],
  maxHeight: number,
): TwitchQuality | null {
  let best: {
    quality: TwitchQuality;
    height: number;
    bitrate: number;
  } | null = null;
  for (const quality of qualities) {
    const name = qualityName(quality) ?? qualityGroup(quality);
    const height = qualityPixelHeight(quality);
    if (!name || height === null || height > maxHeight) continue;
    const bitrate = qualityBitrate(quality);
    if (
      !best ||
      height > best.height ||
      (height === best.height && bitrate > best.bitrate)
    ) {
      best = { quality, height, bitrate };
    }
  }
  return best?.quality ?? null;
}

function qualityMatches(a: TwitchQuality, b: TwitchQuality): boolean {
  const aName = qualityName(a);
  const bName = qualityName(b);
  if (aName && bName && aName === bName) return true;
  // getQuality() returns the group string while getQualities() returns
  // objects, so compare a bare string against the other side's group too.
  const aGroup = qualityGroup(a) ?? (typeof a === "string" ? a : null);
  const bGroup = qualityGroup(b) ?? (typeof b === "string" ? b : null);
  return !!aGroup && !!bGroup && aGroup === bGroup;
}

function readQualities(
  embed: TwitchEmbed,
  player: TwitchPlayer,
): TwitchQuality[] {
  for (const source of [player, embed]) {
    try {
      const qualities = source.getQualities?.();
      if (Array.isArray(qualities) && qualities.length > 0) return qualities;
    } catch {
      // The embed can throw before the stream starts.
    }
  }
  return [];
}

function readCurrentQuality(
  embed: TwitchEmbed,
  player: TwitchPlayer,
): TwitchQuality | null {
  for (const source of [player, embed]) {
    try {
      const quality = source.getQuality?.();
      if (quality !== null && quality !== undefined) return quality;
    } catch {
      // Ignore and try the next API surface.
    }
  }
  return null;
}

function applyQuality(
  embed: TwitchEmbed,
  player: TwitchPlayer,
  target: TwitchQuality,
): void {
  // The embed forwards this call to the same player. Send exactly one command:
  // each accepted setQuality reloads the stream at the new rendition.
  const receiver =
    typeof embed.setQuality === "function" ? embed : player;
  if (typeof receiver.setQuality !== "function") return;
  receiver.setQuality(target);
}

function resolutionHeight(resolution: string | undefined): number | null {
  if (!resolution) return null;
  const match = resolution.match(/^(\d{3,4})p$/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

// Renders a Twitch stream using the Twitch Player JS API

export function TwitchJSEmbed({
  channelName,
  videoId,
  parentDomain,
  oauthToken,
  defaultResolution,
  onPlayerReady,
}: {
  channelName?: string;
  videoId?: string;
  parentDomain: string;
  oauthToken?: string;
  defaultResolution?: string;
  onPlayerReady?: (player: TwitchPlayer | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const embedRef = useRef<TwitchEmbed | null>(null);
  const playerRef = useRef<TwitchPlayer | null>(null);
  // Bumped whenever a player is created or the channel changes so the quality
  // effect can re-run against the new rendition list.
  const [playerEpoch, setPlayerEpoch] = useState(0);
  // Keep a ref so the script-load callback always sees the latest channel
  const channelRef = useRef(channelName);
  const previousChannelRef = useRef(channelName);
  const oauthTokenRef = useRef(oauthToken);
  const resolutionRef = useRef(defaultResolution);
  const onPlayerReadyRef = useRef(onPlayerReady);
  useEffect(() => {
    channelRef.current = channelName;
    oauthTokenRef.current = oauthToken;
    resolutionRef.current = defaultResolution;
    onPlayerReadyRef.current = onPlayerReady;
  }, [channelName, oauthToken, defaultResolution, onPlayerReady]);

  // Coerce to boolean so we only recreate when token *presence* changes
  // (absent → present), not on every token value change (e.g. periodic refresh).
  const hasOauthToken = !!oauthToken;

  useEffect(() => {
    let cancelled = false;
    let embedInstance: TwitchEmbed | null = null;

    const initPlayer = () => {
      if (cancelled || !containerRef.current || !window.Twitch?.Embed) return;

      const playerId = "twitch-js-player";
      containerRef.current.id = playerId;
      containerRef.current.innerHTML = "";

      requestAnimationFrame(() => {
        if (cancelled || !window.Twitch?.Embed) return;

        const initialQuality = resolutionHeight(resolutionRef.current)
          ? resolutionRef.current
          : undefined;
        const embed = new window.Twitch.Embed(playerId, {
          width: "100%",
          height: "100%",
          ...(videoId ? { video: videoId } : { channel: channelRef.current }),
          parent: [parentDomain],
          autoplay: true,
          layout: "video",
          // Undocumented player option, consumed by the embed iframe as the
          // initial rendition so it never starts on Auto before our API call.
          ...(initialQuality ? { quality: initialQuality } : {}),
          // @ts-ignore - The Embed API supports oauth_token despite some type definitions
          ...(oauthTokenRef.current
            ? { oauth_token: oauthTokenRef.current }
            : {}),
        });
        embedInstance = embed;

        const player = embed.getPlayer();
        embedRef.current = embed;
        playerRef.current = player;
        setPlayerEpoch((value) => value + 1);
        onPlayerReadyRef.current?.(player);
      });
    };

    const cleanup = () => {
      cancelled = true;
      if (embedInstance) {
        try {
          embedInstance.destroy();
        } catch {
          /* ignore */
        }
        embedInstance = null;
      }
      embedRef.current = null;
      playerRef.current = null;
      onPlayerReadyRef.current?.(null);
    };

    const scriptId = "twitch-embed-script";
    if (window.Twitch?.Embed) {
      initPlayer();
    } else if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://embed.twitch.tv/embed/v1.js";
      script.onload = () => initPlayer();
      document.head.appendChild(script);
    } else {
      const poll = setInterval(() => {
        if (window.Twitch?.Embed) {
          clearInterval(poll);
          initPlayer();
        }
      }, 50);
      return () => {
        clearInterval(poll);
        cleanup();
      };
    }

    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentDomain, hasOauthToken]);

  // The embed starts at Auto and only populates its quality list after the
  // stream starts. In some builds setQuality is also ignored until playback,
  // so keep checking until the current rendition actually matches the target.
  // Re-runs when the setting changes, a new player mounts, or the channel
  // switches, but never fights the user once the target is active.
  useEffect(() => {
    if (playerEpoch === 0) return;
    const embed = embedRef.current;
    const player = playerRef.current;
    if (!embed || !player) return;

    const maxHeight = resolutionHeight(defaultResolution);
    if (maxHeight === null) return;

    const MAX_APPLY_ATTEMPTS = 3;
    const RETRY_DELAY_MS = 2000;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let applyAttempts = 0;
    let lastAppliedTarget: TwitchQuality | null = null;
    let lastAppliedAt = 0;

    const tryApply = (): boolean => {
      const qualities = readQualities(embed, player);
      if (qualities.length === 0) return false;
      const target = pickQualityAtOrBelow(qualities, maxHeight);
      if (!target) return false;
      // Wait until the player reports a current quality. Calling setQuality
      // before that point is ignored and just causes repeated reloads.
      const current = readCurrentQuality(embed, player);
      if (!current) return false;
      if (qualityMatches(current, target)) return true;

      // A channel switch can briefly expose the previous channel's list, so
      // allow a few spaced retries instead of latching after one attempt.
      const now = Date.now();
      const targetChanged =
        !lastAppliedTarget || !qualityMatches(lastAppliedTarget, target);
      const canRetry =
        applyAttempts < MAX_APPLY_ATTEMPTS &&
        (targetChanged || now - lastAppliedAt >= RETRY_DELAY_MS);
      if (!canRetry) return false;

      applyAttempts += 1;
      lastAppliedTarget = target;
      lastAppliedAt = now;
      applyQuality(embed, player, target);
      return false;
    };

    tryApply();
    let ticks = 0;
    timer = setInterval(() => {
      ticks += 1;
      if (cancelled) {
        if (timer !== null) clearInterval(timer);
        timer = null;
        return;
      }
      if (tryApply()) {
        if (timer !== null) clearInterval(timer);
        timer = null;
        return;
      }
      if (ticks >= 60 && timer !== null) {
        if (applyAttempts > 0) {
          console.warn(
            "[embed] Could not confirm default resolution:",
            defaultResolution,
            "current quality:",
            readCurrentQuality(embed, player),
          );
        }
        clearInterval(timer);
        timer = null;
      }
    }, 500);

    return () => {
      cancelled = true;
      if (timer !== null) clearInterval(timer);
    };
  }, [defaultResolution, playerEpoch]);

  // Channel switch: call setChannel() instead of remounting → session preserved.
  // Skip the mount pass so the player created with this channel is not switched
  // and its quality effect is not applied twice.
  useEffect(() => {
    const changed = previousChannelRef.current !== channelName;
    previousChannelRef.current = channelName;
    if (!changed || !channelName || !playerRef.current) return;
    playerRef.current.setChannel(channelName);
    setPlayerEpoch((value) => value + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName]);

  return (
    <div
      ref={containerRef}
      style={{ position: "absolute", inset: 0, visibility: "visible" }}
    />
  );
}

function PlaceholderOverlay({
  show,
  thumbnailUrl,
  fading,
  showSpinner,
}: {
  show: boolean;
  thumbnailUrl?: string;
  fading: boolean;
  showSpinner?: boolean;
}) {
  if (!show || !thumbnailUrl) return null;
  return (
    <StreamEmbedPlaceholder
      thumbnailUrl={thumbnailUrl}
      fading={fading}
      showSpinner={showSpinner}
    />
  );
}

function TwitchEmbedView({
  channelName,
  parentDomain,
  twitchConnected,
  twitchAccessToken,
  defaultResolution,
  tokenWaitExpired,
  showPlaceholder,
  placeholderThumbnailUrl,
  placeholderFading,
}: {
  channelName: string;
  parentDomain: string | null;
  twitchConnected?: boolean;
  twitchAccessToken?: string;
  defaultResolution?: string;
  tokenWaitExpired: boolean;
  showPlaceholder: boolean;
  placeholderThumbnailUrl?: string;
  placeholderFading: boolean;
}) {
  // Wait for the parent domain to resolve before mounting the player.
  // Mounting with 'localhost' then immediately remounting with the real domain
  // fires two Kasada fingerprint requests in quick succession → 429.
  if (!parentDomain) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          backgroundColor: "#0a0a0a",
        }}
      >
        <PlaceholderOverlay
          show={showPlaceholder}
          thumbnailUrl={placeholderThumbnailUrl}
          fading={placeholderFading}
        />
      </div>
    );
  }
  // Wait for the OAuth token to arrive after page reload so the player is
  // created with oauth_token from the start.  Browsers that block third-party
  // cookies (Firefox ETP, Brave Shields) can't fall back to Twitch cookies,
  // so the token is the only way the player can authenticate the viewer.
  // After 5 s the wait expires to avoid blocking if the refresh fails.
  if (twitchConnected && !twitchAccessToken && !tokenWaitExpired) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: "#0a0a0a",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#999",
          fontSize: "13px",
        }}
      >
        <PlaceholderOverlay
          show={showPlaceholder}
          thumbnailUrl={placeholderThumbnailUrl}
          fading={placeholderFading}
          showSpinner={false}
        />
        Authenticating…
      </div>
    );
  }
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Twitch's autoplay check treats an obscured player as hidden. Keep the
          iframe unmounted while the thumbnail covers it, then start the player
          once the placeholder is gone. */}
      {!showPlaceholder && (
        <div style={{ position: "absolute", inset: 0 }}>
          <TwitchJSEmbed
            channelName={channelName}
            parentDomain={parentDomain}
            oauthToken={twitchAccessToken}
            defaultResolution={defaultResolution}
          />
        </div>
      )}
      <PlaceholderOverlay
        show={showPlaceholder}
        thumbnailUrl={placeholderThumbnailUrl}
        fading={placeholderFading}
      />
    </div>
  );
}

export default function StreamEmbed({
  channelName,
  playerType = "embed",
  twitchConnected,
  onTwitchLogin,
  twitchAccessToken,
  onQualitiesLoaded,
  externalSelectedQualityIdx,
  defaultResolution = "1080p",
  placeholderThumbnailUrl,
  onPlaceholderFadeOut,
}: StreamEmbedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HLS | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const qualitiesRef = useRef<Array<{ label: string; url: string }>>([]);
  const [showPlaceholder, setShowPlaceholder] = useState(
    !!placeholderThumbnailUrl,
  );
  const [placeholderFading, setPlaceholderFading] = useState(false);
  const [parentDomain, setParentDomain] = useState<string | null>(null);
  const [streamAuthenticated, setStreamAuthenticated] = useState(false);

  // Fade out and remove the placeholder when stream starts playing
  useEffect(() => {
    if (!loading && showPlaceholder && !placeholderFading) {
      setPlaceholderFading(true);
      const timer = setTimeout(() => {
        setShowPlaceholder(false);
        onPlaceholderFadeOut?.();
      }, 600);
      return () => clearTimeout(timer);
    }    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loading]);

  // Reset placeholder on channel change
  useEffect(() => {
    if (placeholderThumbnailUrl) {
      setShowPlaceholder(true);
      setPlaceholderFading(false);
    }    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [channelName]);

  // Gate the embed player mount on token availability when the user is
  // connected but the access token hasn't been refreshed yet (page reload).
  // This avoids creating the Twitch Player without oauth_token, critical on
  // Firefox / browsers with strict third-party cookie blocking.
  const [tokenWaitExpired, setTokenWaitExpired] = useState(false);
  useEffect(() => {
    if (twitchConnected && !twitchAccessToken) {
      setTokenWaitExpired(false);
      const timer = setTimeout(() => setTokenWaitExpired(true), 5000);
      return () => clearTimeout(timer);
    }
    // Token present or not connected, no need to wait.
    setTokenWaitExpired(false);
  }, [twitchConnected, twitchAccessToken]);

  useEffect(() => {
    let cancelled = false;
    const abortController = new AbortController();
    fetch("/api/parent-domain", { signal: abortController.signal })
      .then((res) => (res.ok ? res.json() : { parentDomain: "localhost" }))
      .then((data) => {
        if (!cancelled) setParentDomain(data.parentDomain ?? "localhost");
      })
      .catch(() => {
        // Silently swallow AbortError on unmount, flag pattern matches the
        // parent cancelled/aborted guard so we don't fall back to "localhost"
        // after the component has already torn down.
        if (cancelled || abortController.signal.aborted) return;
        setParentDomain("localhost");
      });
    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, []);

  // Watch external quality index and switch the HLS source accordingly
  useEffect(() => {
    if (
      externalSelectedQualityIdx !== undefined &&
      hlsRef.current &&
      qualitiesRef.current[externalSelectedQualityIdx]
    ) {
      hlsRef.current.loadSource(qualitiesRef.current[externalSelectedQualityIdx].url);
      videoRef.current?.play().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalSelectedQualityIdx]);

  // No longer forcing iframe remount on channel switch to help preserve session state.
  // The browser will handle navigating the existing iframe to the new URL.

  useEffect(() => {
    if (playerType === "embed" || !channelName) {
      setLoading(false);
      return () => {};
    }

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const abortController = new AbortController();

    const loadStream = async (isRetry = false) => {
      if (cancelled) return;
      try {
        setLoading(true);
        setError(null);
        if (!isRetry) {
      qualitiesRef.current = [];
      onQualitiesLoaded?.([]);
        }

        if (!videoRef.current) {
          if (!cancelled) setLoading(false);
          return;
        }

        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }

        // The server fetches the GQL token and contacts usher.ttvnw.net
        // (which has no CORS headers, so it must be done server-side).
        // It returns all available quality variants on *.ttvnw.net CDN,
        // which DO support CORS, HLS.js fetches segments directly from
        // the CDN with zero server bandwidth involved.
        // Advertising the decodable codecs is what makes Twitch list the
        // HEVC 1440p (2K) variants instead of stopping at 1080p H.264.
        const supportedCodecs = detectPlayableCodecs();
        console.log("[hls] Supported codecs:", supportedCodecs.join(","));
        const playlistRes = await fetch(
          `/api/stream-playlist?channel=${encodeURIComponent(channelName)}&codecs=${encodeURIComponent(supportedCodecs.join(","))}`,
          { signal: abortController.signal },
        );

        // Surface actionable error messages by HTTP status before reading body
        if (!playlistRes.ok) {
          if (playlistRes.status === 401) {
            if (!isRetry && !cancelled) {
              // The session cookie may not have been refreshed yet, wait 3 s and retry once.
              setError("Authenticating… retrying in 3 s");
              retryTimer = setTimeout(() => loadStream(true), 3000);
              return;
            }
            throw new Error(
              "Authentication required. Please check your Twitch session.",
            );
          }
          if (playlistRes.status === 404) {
            throw new Error("Channel is offline or does not exist");
          }
          if (playlistRes.status === 429) {
            throw new Error(
              "Too many requests, please wait a moment and try again",
            );
          }
          // Attempt to surface a server-side error message if available
          let serverMsg = "";
          try {
            serverMsg = (await playlistRes.json()).error ?? "";
          } catch {
            /* ignore */
          }
          throw new Error(serverMsg || `Server error (${playlistRes.status})`);
        }

        const playlistData = await playlistRes.json();
        if (playlistData.error) throw new Error(playlistData.error);

        if (cancelled) return;

        const fetchedQualities: Array<{
          label: string;
          url: string;
          codecs?: string;
        }> = capEmbedQualities(
          (playlistData.qualities ?? []).filter(
            (quality: { codecs?: string }) =>
              isQualityPlayable(quality.codecs, supportedCodecs),
          ),
        );
        if (fetchedQualities.length === 0) {
          throw new Error("No playable stream quality found for this browser");
        }
        qualitiesRef.current = fetchedQualities;
        onQualitiesLoaded?.(fetchedQualities);

        // Use server-side subscription check result (more reliable: token has full scopes)
        if (typeof playlistData.authenticated === "boolean") {
          console.log("[ads] Server reports authenticated:", playlistData.authenticated);
          setStreamAuthenticated(playlistData.authenticated);
        }

        const playlistUrl = fetchedQualities[0].url;

        if (HLS.isSupported()) {
          const hls = new HLS({
            debug: false,
            enableWorker: true,
            lowLatencyMode: true,
            // Re-fetch the live playlist frequently
            liveSyncDurationCount: 3,
            liveMaxLatencyDurationCount: 6,
          });

          hls.on(HLS.Events.MANIFEST_PARSED, () => {
            if (cancelled) {
              hls.destroy();
              return;
            }
            console.log("[hls] Manifest parsed, stream loaded for:", channelName);
            console.log("[hls] Quality:", fetchedQualities[0]?.label ?? "unknown", "URL:", playlistUrl);
            console.log("[hls] Ad-free via usher oauth_token: ads are controlled server-side, not by this badge");
            videoRef.current?.play().catch(() => {
              // Auto-play failed, user will need to click play
            });
          });

          hls.on(HLS.Events.ERROR, (_event, data) => {
            if (cancelled) return;
            if (data.fatal) {
              setError(`Stream error: ${data.type}`);
              setLoading(false);
            }
          });

          hls.loadSource(playlistUrl);
          hls.attachMedia(videoRef.current);
          hlsRef.current = hls;
        } else if (
          videoRef.current.canPlayType("application/vnd.apple.mpegurl")
        ) {
          // Safari supports HLS natively
          videoRef.current.src = playlistUrl;
        } else {
          setError("HLS not supported in this browser");
        }
        // Loading ends here so the 401-retry-wait path keeps `loading=true`
        // (the early `return` above skips this line, intentionally).
        if (!cancelled) setLoading(false);
      } catch (err) {
        if (cancelled || abortController.signal.aborted) return;
        console.error("Failed to load stream:", err);
        setError(err instanceof Error ? err.message : "Failed to load stream");
        setLoading(false);
      }
    };

    loadStream();

    return () => {
      cancelled = true;
      abortController.abort();
      if (retryTimer !== null) clearTimeout(retryTimer);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [channelName, playerType]);

  // Check if the user is subscribed to the current channel, only when in
  // m3u8 mode and Twitch is connected.  Resets to grey on channel change.
  // Turns purple only after Helix confirms an active subscription.
  useEffect(() => {
    setStreamAuthenticated(false);

    if (playerType !== "m3u8" || !channelName || !twitchConnected) {
      console.log("[ads] Skipping subscription check", {
        playerType,
        hasChannel: !!channelName,
        twitchConnected,
      });
      return;
    }

    let cancelled = false;

    const abortController = new AbortController();
    const checkSubscription = async () => {
      try {
        console.log("[ads] Checking subscription for channel:", channelName);

        // Resolve the authenticated user's ID (GET /users with no params returns the token owner)
        const selfRes = await fetch("/api/twitch-proxy?path=/helix/users", {
          signal: abortController.signal,
        });
        if (!selfRes.ok || cancelled) return;
        const selfData = await selfRes.json();
        if (cancelled) return;
        const userId = selfData?.data?.[0]?.id;
        console.log("[ads] Authenticated user ID:", userId);
        if (!userId) return;

        // Resolve the broadcaster's ID from their login name
        const usersRes = await fetch(
          `/api/twitch-proxy?path=/helix/users&login=${encodeURIComponent(channelName)}`,
          { signal: abortController.signal },
        );
        console.log("[ads] /users response status:", usersRes.status);
        if (!usersRes.ok || cancelled) {
          if (!usersRes.ok) console.warn("[ads] /users request failed:", usersRes.status);
          return;
        }
        const usersData = await usersRes.json();
        if (cancelled) return;
        const broadcasterId = usersData?.data?.[0]?.id;
        console.log("[ads] Broadcaster ID:", broadcasterId);
        if (!broadcasterId) return;

        // Check subscription: requires both user_id (me) and broadcaster_id (channel)
        const subRes = await fetch(
          `/api/twitch-proxy?path=/helix/subscriptions/user&broadcaster_id=${broadcasterId}&user_id=${userId}`,
          { signal: abortController.signal },
        );
        console.log("[ads] /subscriptions response status:", subRes.status);
        if (!subRes.ok || cancelled) {
          if (!subRes.ok) {
            const errText = await subRes.text().catch(() => "");
            console.warn("[ads] /subscriptions check failed:", subRes.status, errText.slice(0, 200));
          }
          return;
        }
        const subData = await subRes.json();
        if (cancelled) return;
        console.log("[ads] Subscription data:", subData);

        const isSubscribed =
          Array.isArray(subData?.data) && subData.data.length > 0;
        console.log("[ads] Is subscribed:", isSubscribed);
        if (!cancelled) setStreamAuthenticated(isSubscribed);
      } catch (err) {
        // AbortError fires when the effect cleans up before the fetches
        // settle. Don't pollute the console with a spurious error log on
        // every unmount or channel change.
        if ((err as Error)?.name === "AbortError" || abortController.signal.aborted) return;
        console.error("[ads] Subscription check error:", err);
      }
    };

    checkSubscription();
    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [channelName, playerType, twitchConnected]);

  if (playerType === "embed") {
    return (
      <TwitchEmbedView
        channelName={channelName}
        parentDomain={parentDomain}
        twitchConnected={twitchConnected}
        twitchAccessToken={twitchAccessToken}
        defaultResolution={defaultResolution}
        tokenWaitExpired={tokenWaitExpired}
        showPlaceholder={showPlaceholder}
        placeholderThumbnailUrl={placeholderThumbnailUrl}
        placeholderFading={placeholderFading}
      />
    );
  }

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          backgroundColor: "#0a0a0a",
          color: "#ff4444",
          fontSize: "14px",
          gap: "8px",
          padding: "16px",
          textAlign: "center",
        }}
      >
        <div>⚠️ {error}</div>
        <div style={{ fontSize: "12px", color: "#666" }}>
          The stream may be offline or unavailable
        </div>
      </div>
    );
  }

  return (
    <div className="stream-player">
      {/* Live streams don't have pre-recorded captions */}
    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
    <video ref={videoRef} controls title={`${channelName} Twitch Stream`} />
      {twitchConnected && (
        <StreamAuthBadge authenticated={streamAuthenticated} />
      )}
      <PlaceholderOverlay
        show={showPlaceholder}
        thumbnailUrl={placeholderThumbnailUrl}
        fading={placeholderFading}
      />
      {!showPlaceholder && loading && (
        <div className="stream-loading">
          <div className="stream-loading__spinner" />
          <div>Loading stream...</div>
        </div>
      )}
    </div>
  );
}
