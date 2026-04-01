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

  useEffect(() => {
    let cancelled = false;

    const initPlayer = () => {
      if (cancelled || !containerRef.current || !window.Twitch?.Player) return;

      // Give the container a stable, unique ID required by the Twitch Player API
      const playerId = 'twitch-js-player';
      containerRef.current.id = playerId;

      playerRef.current = new window.Twitch.Player(playerId, {
        width: '100%',
        height: '100%',
        channel: channelRef.current,
        parent: [parentDomain],
        autoplay: true,
        layout: 'video',
        ...(oauthTokenRef.current ? { oauth_token: oauthTokenRef.current } : {}),
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
  }, [parentDomain]); // Re-init only if domain changes

  // Channel switch: call setChannel() instead of remounting → session preserved
  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.setChannel(channelName);
    }
  }, [channelName]);

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
    />
  );
}

export default function StreamEmbed({ channelName, playerType = 'embed', twitchConnected, onTwitchLogin, twitchAccessToken }: StreamEmbedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HLS | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // null = not yet resolved; player must not mount until we have the real value
  // so it is never initialized twice (which triggers Kasada 429 on passport.twitch.tv).
  const [parentDomain, setParentDomain] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/parent-domain')
      .then(res => res.json())
      .then(data => setParentDomain(data.parentDomain ?? 'localhost'))
      .catch(() => setParentDomain('localhost'));
  }, []);

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

        if (!videoRef.current) return;

        // Clean up previous HLS instance
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }

        // /api/stream-playlist handles the full server-side proxy chain:
        //   Twitch GQL (token) → usher.ttvnw.net (master) → best variant →
        //   rewrite segment URLs to /api/stream-segment
        // This avoids all browser CORS issues and IP-mismatch 403s.
        const playlistUrl = `/api/stream-playlist?channel=${encodeURIComponent(channelName)}`;

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
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
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
    <div style={{ height: '100%', width: '100%', backgroundColor: '#0a0a0a', position: 'relative' }}>
      <video
        ref={videoRef}
        controls
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          backgroundColor: '#0a0a0a',
        }}
        title={`${channelName} Twitch Stream`}
      />
      {loading && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#999',
            fontSize: '14px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <div
            style={{
              width: '30px',
              height: '30px',
              border: '3px solid #333',
              borderTop: '3px solid #6366f1',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          />
          <div>Loading stream...</div>
          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
