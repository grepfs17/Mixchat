import { useState, useEffect, useRef } from 'react';
import HLS from 'hls.js';

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
        }
      ) => TwitchPlayer;
    };
  }
}

interface TwitchPlayer {
  setChannel(channel: string): void;
  destroy(): void;
}

interface StreamEmbedProps {
  channelName: string;
  playerType?: 'embed' | 'm3u8';
  twitchConnected?: boolean;
  onTwitchLogin?: () => void;
  /** User's Twitch OAuth access token — passed to the embed player so it can
   *  authenticate without relying on cookies/localStorage (Brave Shields). */
  twitchAccessToken?: string;
}


 // Renders a Twitch stream using the Twitch Player JS API

function TwitchJSEmbed({ channelName, parentDomain, oauthToken }: { channelName: string; parentDomain: string; oauthToken?: string }) {
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

    const initPlayer = () => {
      if (cancelled || !containerRef.current || !window.Twitch?.Player) return;

      // Give the container a stable, unique ID required by the Twitch Player API
      const playerId = 'twitch-js-player';
      containerRef.current.id = playerId;

      // Clear any leftover DOM from a previous player instance so the SDK
      // doesn't conflict with stale iframes when recreating.
      containerRef.current.innerHTML = '';

      /* 
      Defer to the next animation frame so the browser has finished layout
      before the Twitch SDK reads element dimensions for its visibility check.
      Without this deferral the SDK can see a zero-sized container and disable
      autoplay with "style visibility" even though the element is truly visible.
      */
      requestAnimationFrame(() => {
        if (cancelled || !window.Twitch?.Player) return;
        playerRef.current = new window.Twitch.Player(playerId, {
          width: '100%',
          height: '100%',
          channel: channelRef.current,
          parent: [parentDomain],
          autoplay: true,
          layout: 'video',
          ...(oauthTokenRef.current ? { oauth_token: oauthTokenRef.current } : {}),
        });
      });
    };

    const scriptId = 'twitch-embed-script';

    if (window.Twitch?.Player) {
      // Script already loaded from a previous mount
      initPlayer();
    } else if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://embed.twitch.tv/embed/v1.js';
      script.onload = () => initPlayer();
      document.head.appendChild(script);
    } else {
      const poll = setInterval(() => {
        if (window.Twitch?.Player) {
          clearInterval(poll);
          initPlayer();
        }
      }, 50);
      return () => clearInterval(poll);
    }

    return () => {
      cancelled = true;
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch { /* ignore */ }
        playerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentDomain, hasOauthToken]); // Re-init when domain changes OR token becomes available

  // Channel switch: call setChannel() instead of remounting → session preserved
  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.setChannel(channelName);
    }
  }, [channelName]);

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, visibility: 'visible' }}
    />
  );
}

export default function StreamEmbed({ channelName, playerType = 'embed', twitchConnected, onTwitchLogin, twitchAccessToken }: StreamEmbedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HLS | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qualities, setQualities] = useState<Array<{ label: string; url: string }>>([]);
  const [selectedQualityIdx, setSelectedQualityIdx] = useState(0);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  // null = not yet resolved; player must not mount until we have the real value
  // so it is never initialized twice (which triggers Kasada 429 on passport.twitch.tv).
  const [parentDomain, setParentDomain] = useState<string | null>(null);

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
    fetch('/api/parent-domain')
      .then(res => res.json())
      .then(data => setParentDomain(data.parentDomain ?? 'localhost'))
      .catch(() => setParentDomain('localhost'));
  }, []);

  const handleQualityChange = (idx: number) => {
    setSelectedQualityIdx(idx);
    setShowQualityMenu(false);
    if (hlsRef.current && qualities[idx]) {
      hlsRef.current.loadSource(qualities[idx].url);
      videoRef.current?.play().catch(() => {});
    }
  };

  // No longer forcing iframe remount on channel switch to help preserve session state.
  // The browser will handle navigating the existing iframe to the new URL.

  useEffect(() => {
    if (playerType === 'embed' || !channelName) {
      setLoading(false);
      return;
    }

    const loadStream = async () => {
      try {
        setLoading(true);
        setError(null);
        setQualities([]);
        setSelectedQualityIdx(0);
        setShowQualityMenu(false);

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
        const playlistRes = await fetch(`/api/stream-playlist?channel=${encodeURIComponent(channelName)}`);
        if (!playlistRes.ok) throw new Error('Failed to get stream playlist');
        const playlistData = await playlistRes.json();
        if (playlistData.error) throw new Error(playlistData.error);

        const fetchedQualities: Array<{ label: string; url: string }> = playlistData.qualities;
        setQualities(fetchedQualities);
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
        } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
          // Safari supports HLS natively
          videoRef.current.src = playlistUrl;
          setLoading(false);
        } else {
          setError('HLS not supported in this browser');
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to load stream:', err);
        setError(err instanceof Error ? err.message : 'Failed to load stream');
        setLoading(false);
      }
    };

    loadStream();

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [channelName, playerType]);


  if (!channelName) {
    // If user is not logged in, show logo + Login with Twitch button
    if (!twitchConnected) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            backgroundColor: '#0a0a0a',
            color: '#999',
            fontSize: '14px',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <img src="/logo.png" alt="Mixchat" style={{ height: 115 }} />
          <button
            onClick={() => onTwitchLogin && onTwitchLogin()}
            style={{
              backgroundColor: '#6441a5',
              color: '#fff',
              border: 'none',
              padding: '8px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Login with Twitch
          </button>
        </div>
      );
    }

    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          backgroundColor: '#0a0a0a',
          color: '#999',
          fontSize: '14px',
        }}
      >
        Select a channel to view stream
      </div>
    );
  }
  if (playerType === 'embed') {
    // Wait for the parent domain to resolve before mounting the player.
    // Mounting with 'localhost' then immediately remounting with the real domain
    // fires two Kasada fingerprint requests in quick succession → 429.
    if (!parentDomain) {
      return <div style={{ width: '100%', height: '100%', backgroundColor: '#0a0a0a' }} />;
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
            width: '100%',
            height: '100%',
            backgroundColor: '#0a0a0a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#999',
            fontSize: '13px',
          }}
        >
          Authenticating…
        </div>
      );
    }
    return (
      <div style={{ position: 'absolute', inset: 0 }}>
        <TwitchJSEmbed channelName={channelName} parentDomain={parentDomain} oauthToken={twitchAccessToken} />
      </div>
    );
  }

  // M3U8 mode — error state
  if (error) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          backgroundColor: '#0a0a0a',
          color: '#ff4444',
          fontSize: '14px',
          gap: '8px',
          padding: '16px',
          textAlign: 'center',
        }}
      >
        <div>⚠️ {error}</div>
        <div style={{ fontSize: '12px', color: '#666' }}>The stream may be offline or unavailable</div>
      </div>
    );
  }

  // M3U8 mode — video player
  return (
    <div className="stream-player">
      <video
        ref={videoRef}
        controls
        title={`${channelName} Twitch Stream`}
      />
      {/* Quality selector — only shown once qualities are loaded */}
      {qualities.length > 1 && (
        <div className="quality-selector">
          {showQualityMenu && (
            <div
              className="quality-selector__backdrop"
              onClick={() => setShowQualityMenu(false)}
            />
          )}
          <div className="quality-selector__inner">
            <button
              className="quality-selector__toggle"
              onClick={() => setShowQualityMenu(q => !q)}
            >
              ⚙ {qualities[selectedQualityIdx]?.label ?? 'Quality'}
            </button>
            {showQualityMenu && (
              <div className="quality-selector__menu">
                {qualities.map((q, i) => (
                  <button
                    key={q.label}
                    onClick={() => handleQualityChange(i)}
                    className={`quality-selector__option${i === selectedQualityIdx ? ' quality-selector__option--active' : ''}`}
                  >
                    {i === selectedQualityIdx ? '✓ ' : '  '}{q.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {loading && (
        <div className="stream-loading">
          <div className="stream-loading__spinner" />
          <div>Loading stream...</div>
        </div>
      )}
    </div>
  );
}
