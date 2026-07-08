import { useState, useEffect, useRef } from "react";
import HLS from "hls.js";

// Types for the Twitch Player JS API
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
            channel: string;
            parent: string[];
            autoplay?: boolean;
            layout?: "video-with-chat" | "video";
            muted?: boolean;
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

interface TwitchPlayer {
  setChannel(channel: string): void;
  destroy(): void;
  play(): void;
  pause(): void;
  getPaused(): boolean;
  addEventListener(event: string, callback: () => void): void;
  removeEventListener(event: string, callback: () => void): void;
}

interface TwitchEmbed {
  getPlayer(): TwitchPlayer;
  destroy(): void;
  addEventListener(event: string, callback: () => void): void;
  removeEventListener(event: string, callback: () => void): void;
}

interface StreamEmbedProps {
  channelName: string;
  playerType?: "embed" | "m3u8";
  twitchConnected?: boolean;
  onTwitchLogin?: () => void;
  /** User's Twitch OAuth access token — passed to the embed player so it can
   *  authenticate without relying on cookies/localStorage (Brave Shields). */
  twitchAccessToken?: string;
  onQualitiesLoaded?: (
    qualities: Array<{ label: string; url: string }>,
  ) => void;
  externalSelectedQualityIdx?: number;
  /** URL of the stream thumbnail to show as a placeholder while the stream loads. */
  placeholderThumbnailUrl?: string;
  /** Callback when the stream player has finished loading and the placeholder should fade out. */
  onPlaceholderFadeOut?: () => void;
}

// Renders a Twitch stream using the Twitch Player JS API

function TwitchJSEmbed({
  channelName,
  parentDomain,
  oauthToken,
}: {
  channelName: string;
  parentDomain: string;
  oauthToken?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<TwitchPlayer | null>(null);
  // Keep a ref so the script-load callback always sees the latest channel
  const channelRef = useRef(channelName);
  channelRef.current = channelName;
  const oauthTokenRef = useRef(oauthToken);
  oauthTokenRef.current = oauthToken;

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

        embedInstance = new window.Twitch.Embed(playerId, {
          width: "100%",
          height: "100%",
          channel: channelRef.current,
          parent: [parentDomain],
          autoplay: true,
          layout: "video",
          // @ts-ignore - The Embed API supports oauth_token despite some type definitions
          ...(oauthTokenRef.current
            ? { oauth_token: oauthTokenRef.current }
            : {}),
        });

        playerRef.current = embedInstance.getPlayer();
      });
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
      return () => clearInterval(poll);
    }

    return () => {
      cancelled = true;
      if (embedInstance) {
        try {
          embedInstance.destroy();
        } catch {
          /* ignore */
        }
        embedInstance = null;
      }
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentDomain, hasOauthToken]);

  // Channel switch: call setChannel() instead of remounting → session preserved
  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.setChannel(channelName);
    }
  }, [channelName]);

  return (
    <div
      ref={containerRef}
      style={{ position: "absolute", inset: 0, visibility: "visible" }}
    />
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
  placeholderThumbnailUrl,
  onPlaceholderFadeOut,
}: StreamEmbedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HLS | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qualities, setQualities] = useState<
    Array<{ label: string; url: string }>
  >([]);
  const [selectedQualityIdx, setSelectedQualityIdx] = useState(0);
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
    }
  }, [loading]);

  // Reset placeholder on channel change
  useEffect(() => {
    if (placeholderThumbnailUrl) {
      setShowPlaceholder(true);
      setPlaceholderFading(false);
    }
  }, [channelName]);

  // Gate the embed player mount on token availability when the user is
  // connected but the access token hasn't been refreshed yet (page reload).
  // This avoids creating the Twitch Player without oauth_token — critical on
  // Firefox / browsers with strict third-party cookie blocking.
  const [tokenWaitExpired, setTokenWaitExpired] = useState(false);
  useEffect(() => {
    if (twitchConnected && !twitchAccessToken) {
      setTokenWaitExpired(false);
      const timer = setTimeout(() => setTokenWaitExpired(true), 5000);
      return () => clearTimeout(timer);
    }
    // Token present or not connected — no need to wait.
    setTokenWaitExpired(false);
  }, [twitchConnected, twitchAccessToken]);

  useEffect(() => {
    fetch("/api/parent-domain")
      .then((res) => res.json())
      .then((data) => setParentDomain(data.parentDomain ?? "localhost"))
      .catch(() => setParentDomain("localhost"));
  }, []);

  // Watch external quality index and switch the HLS source accordingly
  useEffect(() => {
    if (
      externalSelectedQualityIdx !== undefined &&
      hlsRef.current &&
      qualities[externalSelectedQualityIdx]
    ) {
      hlsRef.current.loadSource(qualities[externalSelectedQualityIdx].url);
      setSelectedQualityIdx(externalSelectedQualityIdx);
      videoRef.current?.play().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalSelectedQualityIdx]);

  // No longer forcing iframe remount on channel switch to help preserve session state.
  // The browser will handle navigating the existing iframe to the new URL.

  useEffect(() => {
    if (playerType === "embed" || !channelName) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const loadStream = async (isRetry = false) => {
      if (cancelled) return;
      try {
        setLoading(true);
        setError(null);
        if (!isRetry) {
          setQualities([]);
          setSelectedQualityIdx(0);
          onQualitiesLoaded?.([]);
        }

        if (!videoRef.current) return;

        // Clean up previous HLS instance
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }

        // The server fetches the GQL token and contacts usher.ttvnw.net
        // (which has no CORS headers, so it must be done server-side).
        // It returns all available quality variants on *.ttvnw.net CDN,
        // which DO support CORS — HLS.js fetches segments directly from
        // the CDN with zero server bandwidth involved.
        const playlistRes = await fetch(
          `/api/stream-playlist?channel=${encodeURIComponent(channelName)}`,
        );

        // Surface actionable error messages by HTTP status before reading body
        if (!playlistRes.ok) {
          if (playlistRes.status === 401) {
            if (!isRetry && !cancelled) {
              // The session cookie may not have been refreshed yet — wait 3 s and retry once.
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
              "Too many requests — please wait a moment and try again",
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

        const fetchedQualities: Array<{ label: string; url: string }> =
          playlistData.qualities;
        setQualities(fetchedQualities);
        onQualitiesLoaded?.(fetchedQualities);
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
            setLoading(false);
            videoRef.current?.play().catch(() => {
              // Auto-play failed — user will need to click play
            });
          });

          hls.on(HLS.Events.ERROR, (_event, data) => {
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
          setLoading(false);
        } else {
          setError("HLS not supported in this browser");
          setLoading(false);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load stream:", err);
        setError(err instanceof Error ? err.message : "Failed to load stream");
        setLoading(false);
      }
    };

    loadStream();

    return () => {
      cancelled = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [channelName, playerType]);

  // Check if the user is subscribed to the current channel — only when in
  // m3u8 mode and Twitch is connected.  Resets to grey on channel change;
  // turns purple only after Helix confirms an active subscription.
  useEffect(() => {
    setStreamAuthenticated(false);

    if (playerType !== "m3u8" || !channelName || !twitchConnected) return;

    let cancelled = false;

    const checkSubscription = async () => {
      try {
        const usersRes = await fetch(
          `/api/twitch-proxy?path=/helix/users&login=${encodeURIComponent(channelName)}`,
        );
        if (!usersRes.ok || cancelled) return;
        const usersData = await usersRes.json();
        const broadcasterId = usersData?.data?.[0]?.id;
        if (!broadcasterId) return;

        const subRes = await fetch(
          `/api/twitch-proxy?path=/helix/subscriptions/user?broadcaster_id=${broadcasterId}`,
        );
        if (!subRes.ok || cancelled) return;
        const subData = await subRes.json();

        const isSubscribed =
          Array.isArray(subData?.data) && subData.data.length > 0;
        if (!cancelled) setStreamAuthenticated(isSubscribed);
      } catch {
        // Silently fail — badge stays grey if we can't verify.
      }
    };

    checkSubscription();
    return () => {
      cancelled = true;
    };
  }, [channelName, playerType, twitchConnected]);

  if (playerType === "embed") {
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
          {showPlaceholder && placeholderThumbnailUrl && (
            <div
              className={`stream-embed-placeholder${placeholderFading ? " stream-embed-placeholder--fading" : ""}`}
            >
              <img
                src={placeholderThumbnailUrl}
                alt=""
                className="stream-embed-placeholder__img"
              />
              <div className="stream-embed-placeholder__glass" />
              <div className="stream-embed-placeholder__spinner">
                <div className="stream-embed-placeholder__spinner-ring" />
              </div>
            </div>
          )}
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
          {showPlaceholder && placeholderThumbnailUrl && (
            <div
              className={`stream-embed-placeholder${placeholderFading ? " stream-embed-placeholder--fading" : ""}`}
            >
              <img
                src={placeholderThumbnailUrl}
                alt=""
                className="stream-embed-placeholder__img"
              />
              <div className="stream-embed-placeholder__glass" />
            </div>
          )}
          Authenticating…
        </div>
      );
    }
    return (
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        <div style={{ position: "absolute", inset: 0 }}>
          <TwitchJSEmbed
            channelName={channelName}
            parentDomain={parentDomain}
            oauthToken={twitchAccessToken}
          />
        </div>
        {showPlaceholder && placeholderThumbnailUrl && (
          <div
            className={`stream-embed-placeholder${placeholderFading ? " stream-embed-placeholder--fading" : ""}`}
          >
            <img
              src={placeholderThumbnailUrl}
              alt=""
              className="stream-embed-placeholder__img"
            />
            <div className="stream-embed-placeholder__glass" />
            <div className="stream-embed-placeholder__spinner">
              <div className="stream-embed-placeholder__spinner-ring" />
            </div>
          </div>
        )}
      </div>
    );
  }

  // M3U8 mode — error state
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

  // M3U8 mode — video player
  return (
    <div className="stream-player">
      <video ref={videoRef} controls title={`${channelName} Twitch Stream`} />
      <div
        className={`stream-auth-badge${streamAuthenticated ? "" : " stream-auth-badge--guest"}`}
        title={streamAuthenticated ? "Stream authenticated — ads skipped for subscribers" : "Not authenticated — stream may include ads"}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          {streamAuthenticated ? (
            <>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="m9 12 2 2 4-4"/>
            </>
          ) : (
            <>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <line x1="9" y1="9" x2="15" y2="15"/>
              <line x1="15" y1="9" x2="9" y2="15"/>
            </>
          )}
        </svg>
        {streamAuthenticated ? "Ad-free" : "Ads"}
      </div>
      {showPlaceholder && placeholderThumbnailUrl && (
        <div
          className={`stream-embed-placeholder${placeholderFading ? " stream-embed-placeholder--fading" : ""}`}
        >
          <img
            src={placeholderThumbnailUrl}
            alt=""
            className="stream-embed-placeholder__img"
          />
          <div className="stream-embed-placeholder__glass" />
          <div className="stream-embed-placeholder__spinner">
            <div className="stream-embed-placeholder__spinner-ring" />
          </div>
        </div>
      )}
      {!showPlaceholder && loading && (
        <div className="stream-loading">
          <div className="stream-loading__spinner" />
          <div>Loading stream...</div>
        </div>
      )}
    </div>
  );
}
