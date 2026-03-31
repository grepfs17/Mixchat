import { useState, useEffect, useRef } from 'react';
import HLS from 'hls.js';

interface StreamEmbedProps {
  channelName: string;
  playerType?: 'embed' | 'm3u8';
  twitchConnected?: boolean;
  onTwitchLogin?: () => void;
}

export default function StreamEmbed({ channelName, playerType = 'embed', twitchConnected, onTwitchLogin }: StreamEmbedProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HLS | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [parentDomain, setParentDomain] = useState<string>('localhost');

  useEffect(() => {
    fetch('/api/parent-domain')
      .then(res => res.json())
      .then(data => setParentDomain(data.parentDomain))
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

  // Embed mode
  if (playerType === 'embed') {
    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <iframe
          src={`https://embed.twitch.tv/?channel=${channelName}&parent=${parentDomain}&layout=video&autoplay=true`}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block',
            visibility: 'visible',
          }}
          frameBorder="0"
          scrolling="no"
          allowFullScreen={true}
          title={`${channelName} Twitch Stream`}
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        />
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
