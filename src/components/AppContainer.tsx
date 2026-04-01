import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { FaTimes } from 'react-icons/fa';
import LoginPanel from './LoginPanel';
import ChatApp from './ChatApp';
import StreamEmbed from './StreamEmbed';
import LiveNotification from './LiveNotification';
import WatchlistManager from './WatchlistManager';
import YouTubeLinker from './YouTubeLinker';
import '../styles/AppContainer.css';
import type { PlatformSession, ChatFont } from '../lib/types';
import { getYoutubeLinkForChannel } from '../lib/youtubeLinks';
import { getAllFollowedChannels, getStreamStatus } from '../lib/twitch';
import { useStreamMonitor } from '../hooks/useStreamMonitor';
import { useTokenRefresh } from '../hooks/useTokenRefresh';
import { markStreamerNotified } from '../lib/streamMonitor';

// Don't save access tokens to localStorage for security. 
// We keep them in memory and let useTokenRefresh handle re-populating them 
// when the page loads by hitting the secure refresh endpoint.
function stripTokens<T extends Record<string, PlatformSession | undefined>>(sessions: T): T {
  const stripped = {} as T;
  for (const key of Object.keys(sessions) as Array<keyof T>) {
    const session = sessions[key];
    if (session) {
      // Omit accessToken from persisted copy; keep everything else.
      const { accessToken: _dropped, ...rest } = session;
      stripped[key] = rest as T[typeof key];
    }
  }
  return stripped;
}

export interface TwitchChannel {
  id: string;
  name: string;
  displayName: string;
  title: string;
  profileImageUrl?: string;
  viewerCount?: number;
}

export default function AppContainer() {
  const [sessions, setSessions] = useState<{
    twitch?: PlatformSession;
    youtube?: PlatformSession;
  }>({});
  const [twitchChannels, setTwitchChannels] = useState<TwitchChannel[]>([]);
  const [allTwitchChannels, setAllTwitchChannels] = useState<TwitchChannel[]>([]);
  const [selectedTwitchChannel, setSelectedTwitchChannel] = useState<string>('');
  const [selectedTwitchChannelName, setSelectedTwitchChannelName] = useState<string>('');
  const [selectedTwitchChannelDisplayName, setSelectedTwitchChannelDisplayName] = useState<string>('');
  const [hasLoadedChannel, setHasLoadedChannel] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [leftColumnVisible, setLeftColumnVisible] = useState<boolean | undefined>(undefined);
  const [embedDefaultOpen, setEmbedDefaultOpen] = useState(true); // Should the stream be expanded by default?
  const [showStreamEmbed, setShowStreamEmbed] = useState(true);
  const [videoRatio, setVideoRatio] = useState(70); // Default 75% video
  const [isDragging, setIsDragging] = useState(false);
  const embedRef = useRef<HTMLDivElement>(null);
  const [playerType, setPlayerType] = useState<'embed' | 'm3u8' | 'youtube'>('embed');
  const [viewerCount, setViewerCount] = useState<number | null>(null);
  const [favoriteChannels, setFavoriteChannels] = useState<string[]>([]); // Favorite channel IDs
  const [showWatchlistManager, setShowWatchlistManager] = useState(false);
  const [showYoutubeLinker, setShowYoutubeLinker] = useState(false);
  const [linkedYoutubeUrl, setLinkedYoutubeUrl] = useState<string | null>(null);
  const [ytLinksVersion, setYtLinksVersion] = useState(0);
  const [youtubeStreamVideoId, setYoutubeStreamVideoId] = useState<string | null>(null);
  const [unifyChatEnabled, setUnifyChatEnabled] = useState(false);
  const [fontSize, setFontSize] = useState(14); // Global chat font size setting
  const [chatFont, setChatFont] = useState<ChatFont>('inter'); // Global chat font family
  const [mentionSoundEnabled, setMentionSoundEnabled] = useState(true); // Toggle for mention notification sound

  // Track if we've successfully loaded sessions yet to prevent overwriting stored data
  const hasLoadedSessionsRef = useRef(false);
  // Track if the save-effect has run to avoid saving on first mount 
  const isFirstSaveRef = useRef(true);

  // Stream monitoring
  const clientId = import.meta.env.PUBLIC_TWITCH_CLIENT_ID;
  const { newLiveStreamer, clearNewNotification } = useStreamMonitor({
    session: sessions.twitch,
    clientId,
    enabled: !!sessions.twitch,
    checkInterval: 60000, // Check every minute
  });

  // Token refresh management
  useTokenRefresh(
    sessions.twitch || null,
    (updatedSession) => {
      const updatedSessions = { ...sessions, twitch: updatedSession };
      setSessions(updatedSessions);
      localStorage.setItem('mixchat_sessions', JSON.stringify(stripTokens(updatedSessions)));
    },
    (error) => {
      console.error('Token refresh permanently failed:', error);
      // Log out user on unrecoverable token refresh error
      setSessions({});
      localStorage.removeItem('mixchat_sessions');
    },
    {
      warningThreshold: 10 * 60 * 1000, // Start refresh 10 min before expiry
      checkInterval: 120 * 1000, // Check every 2 minutes
      maxRetries: 3, // Retry up to 3 times
    }
  );
  // Also refresh YouTube tokens when necessary
  useTokenRefresh(
    sessions.youtube || null,
    (updatedSession) => {
      setSessions((prev) => {
        const updatedSessions = { ...prev, youtube: updatedSession };
        localStorage.setItem('mixchat_sessions', JSON.stringify(stripTokens(updatedSessions)));
        return updatedSessions;
      });
    },
    (error) => {
      console.error('YouTube token refresh permanently failed:', error);
      // Remove only the YouTube session on unrecoverable error
      setSessions((prev) => {
        const updated = { ...prev };
        delete updated.youtube;
        localStorage.setItem('mixchat_sessions', JSON.stringify(stripTokens(updated)));
        return updated;
      });
    },
    {
      warningThreshold: 10 * 60 * 1000,
      checkInterval: 120 * 1000,
      maxRetries: 3,
    }
  );
  useEffect(() => {
    const handleResize = () => {
      setLeftColumnVisible(window.innerWidth >= 1366);
    };

    // Set initial value
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Keep the stream embed visible when the mobile keyboard opens

  useEffect(() => {
    const saved = localStorage.getItem('mixchat_sessions');
    if (saved) {
      try {
        const parsedSessions = JSON.parse(saved);

        // Ensure we have expiresAt set so useTokenRefresh triggers immediately.
        // On page reload, the accessToken is missing (stripped for security),
        // so we set expiresAt to current time to trigger an immediate refresh.
        const sessionsWithExpiry = { ...parsedSessions };
        if (sessionsWithExpiry.twitch && !sessionsWithExpiry.twitch.expiresAt) {
          sessionsWithExpiry.twitch.expiresAt = new Date().getTime();
        }
        if (sessionsWithExpiry.youtube && !sessionsWithExpiry.youtube.expiresAt) {
          sessionsWithExpiry.youtube.expiresAt = new Date().getTime();
        }

        setSessions(sessionsWithExpiry);
        if (!sessionsWithExpiry.twitch) {
          setIsLoading(false);
        }
      } catch (e) {
        console.error('Failed to load sessions:', e);
        setIsLoading(false);
      }
    } else {
      setIsLoading(false);
    }
    // Mark the restore as done so the save-effect knows it's safe to persist.
    hasLoadedSessionsRef.current = true;
  }, []);

  // Fetch Twitch channels when user logs in
  useEffect(() => {
    const fetchChannels = async () => {
      if (sessions.twitch && sessions.twitch.accessToken) {
        try {
          // Rely on `useTokenRefresh` hook for proactive token refreshes.
          // Remove manual refresh here to avoid duplicate refresh requests.
          const accessToken = sessions.twitch.accessToken;

          const clientId = import.meta.env.PUBLIC_TWITCH_CLIENT_ID;

          // Single API call – returns ALL followed channels (online first).
          // Derive the online-only list by filtering, avoiding duplicate requests.
          const allChannels = await getAllFollowedChannels(
            accessToken,
            clientId,
            sessions.twitch.userId
          );

          setAllTwitchChannels(allChannels);

          // Online channels = those with a viewer count > 0
          const onlineChannels = allChannels.filter((ch) => ch.viewerCount > 0);
          setTwitchChannels(onlineChannels);

          setHasLoadedChannel(false);
        } catch (error) {
          console.error('Failed to fetch Twitch channels:', error);
          const is401Error = error instanceof Error && error.message.includes('401');
          if (is401Error) {
            console.log('Received 401 error, clearing session...');
            setSessions({});
            localStorage.removeItem('mixchat_sessions');
          }
        }
      }
    };

    fetchChannels().finally(() => {
      if (!sessions.twitch || sessions.twitch.accessToken) {
        setIsLoading(false);
      }
    });

    // Fetch channels every 2 minutes instead of 30s to avoid rate limiting
    const interval = setInterval(fetchChannels, 120000);
    return () => clearInterval(interval);
  }, [sessions.twitch]);

  const setChannelData = useCallback((channelId: string) => {
    // Search by numeric ID first, then by login name, across online and all channels
    const channel =
      twitchChannels.find((ch) => ch.id === channelId) ||
      allTwitchChannels.find((ch) => ch.id === channelId) ||
      twitchChannels.find((ch) => ch.name === channelId) ||
      allTwitchChannels.find((ch) => ch.name === channelId);

    // Use the resolved numeric ID so 7TV/BTTV/Twitch APIs receive the correct value
    const resolvedId = channel?.id || channelId;

    // If not found in any channel list but channelId is the user's own numeric userId,
    // fall back to session data so Twitch IRC still gets the login name (not the numeric ID)
    const ownSession = sessions.twitch;
    const isOwnUserId = !channel && ownSession?.userId === channelId;

    const channelName = channel?.name || (isOwnUserId ? (ownSession!.username ?? channelId) : channelId);
    const channelDisplayName = channel?.displayName || (isOwnUserId ? (ownSession!.displayName ?? channelId) : channel?.name || channelId);

    setSelectedTwitchChannel(resolvedId);
    setSelectedTwitchChannelName(channelName);
    setSelectedTwitchChannelDisplayName(channelDisplayName);

    // Update URL with channel parameter using the channel name
    const url = new URL(window.location.href);
    url.searchParams.set('twitchChannel', channelName);
    window.history.pushState({}, '', url);
  }, [twitchChannels, allTwitchChannels, sessions.twitch]);

  // Restore channel from URL parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const channelParam = params.get('twitchChannel');

    if (channelParam && !hasLoadedChannel) {
      const foundChannel = twitchChannels.find((ch) => ch.name === channelParam);
      if (foundChannel) {
        setChannelData(foundChannel.id);
        setHasLoadedChannel(true);
      } else if (twitchChannels.length > 0) {
        // If channel not found, use first channel and clear the invalid parameter
        window.history.replaceState({}, '', window.location.pathname);
      }
    } else if (twitchChannels.length > 0 && !hasLoadedChannel) {
      // Load first channel if no URL parameter
      setChannelData(twitchChannels[0].id);
      setHasLoadedChannel(true);
    }
  }, [twitchChannels, hasLoadedChannel, setChannelData]);

  useEffect(() => {
    // Skip the very first execution: sessions is still the initial `{}` from
    // the mount render and the load-effect hasn't restored localStorage yet
    // (even though both effects run in the same commit, the save effect closes
    // over the stale initial value). We let the load-effect be the sole writer
    // on first mount; after that every sessions change is persisted normally.
    if (isFirstSaveRef.current) {
      isFirstSaveRef.current = false;
      return;
    }
    localStorage.setItem('mixchat_sessions', JSON.stringify(stripTokens(sessions)));
  }, [sessions]);

  useEffect(() => {
    const saved = localStorage.getItem('mixchat_video_ratio');
    if (saved) {
      setVideoRatio(Number(saved));
    }
  }, []);

  // Save video ratio to localStorage
  useEffect(() => {
    localStorage.setItem('mixchat_video_ratio', String(videoRatio));
  }, [videoRatio]);

  // Player always defaults to Twitch embed on load — no localStorage restore

  // If player is set to youtube but there's no linked URL, fall back to embed
  useEffect(() => {
    if (playerType === 'youtube' && !linkedYoutubeUrl) {
      setPlayerType('embed');
    }
  }, [linkedYoutubeUrl, playerType]);

  // Fetch YouTube live video ID for the stream embed
  useEffect(() => {
    if (!linkedYoutubeUrl) {
      setYoutubeStreamVideoId(null);
      return;
    }

    // If URL is a direct video link, extract the ID
    try {
      if (linkedYoutubeUrl.includes('v=')) {
        setYoutubeStreamVideoId(new URLSearchParams(new URL(linkedYoutubeUrl).search).get('v'));
        return;
      } else if (linkedYoutubeUrl.includes('youtu.be/')) {
        setYoutubeStreamVideoId(linkedYoutubeUrl.split('youtu.be/')[1].split('?')[0]);
        return;
      } else if (linkedYoutubeUrl.includes('/live/')) {
        setYoutubeStreamVideoId(linkedYoutubeUrl.split('/live/')[1].split('?')[0]);
        return;
      }
    } catch { /* not a direct video URL */ }

    // Otherwise resolve via API
    let cancelled = false;
    const fetchId = async () => {
      try {
        const params = new URLSearchParams();
        params.append('action', 'getLiveVideo');
        params.append('channelUrl', linkedYoutubeUrl);
        
        const res = await fetch(`/api/youtube-proxy?${params.toString()}`);
        const data = await res.json();
        if (!cancelled && res.ok && data.videoId) {
          setYoutubeStreamVideoId(data.videoId);
        } else if (!cancelled) {
          setYoutubeStreamVideoId(null);
        }
      } catch {
        if (!cancelled) setYoutubeStreamVideoId(null);
      }
    };

    fetchId();
    const interval = setInterval(fetchId, 600000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [linkedYoutubeUrl]);

  useEffect(() => {
    if (!selectedTwitchChannel || !sessions.twitch || !sessions.twitch.accessToken) {
      setViewerCount(null);
      return;
    }

    const fetchViewerCount = async () => {
      try {
        const clientId = import.meta.env.PUBLIC_TWITCH_CLIENT_ID;
        const status = await getStreamStatus(
          sessions.twitch!.accessToken,
          clientId,
          selectedTwitchChannel
        );

        if (status) {
          setViewerCount(status.viewerCount || 0);
        }
      } catch (error) {
        console.error('Failed to fetch viewer count:', error);
      }
    };

    fetchViewerCount();

    // Fetch viewer count every 30s instead of 15s to avoid rate limiting
    // Reduces from 240 to 120 queries/hour per user
    const interval = setInterval(fetchViewerCount, 30000);
    return () => clearInterval(interval);
  }, [selectedTwitchChannel, sessions.twitch]);

  // Look up linked YouTube URL for the selected channel
  useEffect(() => {
    if (selectedTwitchChannel) {
      const storedLink = getYoutubeLinkForChannel(selectedTwitchChannel);
      if (storedLink) {
        setLinkedYoutubeUrl(storedLink);
      } else if (sessions.youtube && sessions.twitch && (selectedTwitchChannel === sessions.twitch.userId || selectedTwitchChannel === sessions.twitch.username)) {
        // If viewing our own channel and logged into YouTube, use our own channel
        setLinkedYoutubeUrl(`https://www.youtube.com/channel/${sessions.youtube.userId}`);
      } else {
        setLinkedYoutubeUrl(null);
      }
    } else {
      setLinkedYoutubeUrl(null);
    }
  }, [selectedTwitchChannel, ytLinksVersion, sessions.youtube, sessions.twitch]);


  useEffect(() => {
    const saved = localStorage.getItem('mixchat_favorite_channels');
    if (saved) {
      try {
        setFavoriteChannels(JSON.parse(saved));
      } catch (error) {
        console.error('Failed to load favorite channels:', error);
      }
    }
  }, []);

  // Save favorite channels to localStorage
  useEffect(() => {
    localStorage.setItem('mixchat_favorite_channels', JSON.stringify(favoriteChannels));
  }, [favoriteChannels]);

  // Load embed default open config from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('mixchat_embed_default_open');
    if (saved !== null) {
      try {
        const value = JSON.parse(saved);
        setEmbedDefaultOpen(value);
        setShowStreamEmbed(value);
      } catch (error) {
        console.error('Failed to load embed default open config:', error);
      }
    }
  }, []);

  // Save embed default open config to localStorage
  useEffect(() => {
    localStorage.setItem('mixchat_embed_default_open', JSON.stringify(embedDefaultOpen));
  }, [embedDefaultOpen]);

  // Load unify chat setting from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('mixchat_unify_chat');
    if (saved !== null) {
      try {
        setUnifyChatEnabled(JSON.parse(saved));
      } catch { /* ignore */ }
    }
  }, []);

  // Save unify chat setting to localStorage
  useEffect(() => {
    localStorage.setItem('mixchat_unify_chat', JSON.stringify(unifyChatEnabled));
  }, [unifyChatEnabled]);

  // Load font size setting from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('mixchat_font_size');
    if (saved !== null) {
      try {
        setFontSize(JSON.parse(saved));
      } catch { /* ignore */ }
    }
  }, []);

  // Save font size setting to localStorage
  useEffect(() => {
    localStorage.setItem('mixchat_font_size', JSON.stringify(fontSize));
  }, [fontSize]);

  // Load mention sound setting from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('mixchat_mention_sound');
    if (saved !== null) {
      try {
        setMentionSoundEnabled(JSON.parse(saved));
      } catch { /* ignore */ }
    }
  }, []);

  // Save mention sound setting to localStorage
  useEffect(() => {
    localStorage.setItem('mixchat_mention_sound', JSON.stringify(mentionSoundEnabled));
  }, [mentionSoundEnabled]);

  // Load chat font setting from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('mixchat_chat_font');
    if (saved !== null) {
      try {
        setChatFont(JSON.parse(saved));
      } catch { /* ignore */ }
    }
  }, []);

  // Save chat font setting to localStorage
  useEffect(() => {
    localStorage.setItem('mixchat_chat_font', JSON.stringify(chatFont));
  }, [chatFont]);

  // Handle URL parameter to open channel directly
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const channelParam = params.get('channel');

    if (channelParam && twitchChannels.length > 0 && !hasLoadedChannel) {
      // Try to find channel by name (case-insensitive)
      const channel = twitchChannels.find(
        (ch) => ch.name.toLowerCase() === channelParam.toLowerCase()
      );

      if (channel) {
        setChannelData(channel.id);
        setHasLoadedChannel(true);
        // Remove the parameter from URL to avoid confusion
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, [twitchChannels, hasLoadedChannel, setChannelData]);

  // Handle mouse events for resizing
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = document.querySelector('[data-app-grid]') as HTMLElement;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const newX = e.clientX - rect.left;
      const newRatio = Math.max(30, Math.min(80, (newX / rect.width) * 100));
      setVideoRatio(newRatio);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const handleTwitchLogin = useCallback(() => {
    const clientId = import.meta.env.PUBLIC_TWITCH_CLIENT_ID;
    const redirectUri = import.meta.env.PUBLIC_TWITCH_REDIRECT_URI;

    if (!clientId) {
      alert('Twitch Client ID not configured');
      return;
    }

    // Generate a random CSRF state token and persist it for the callback to verify.
    const state = crypto.randomUUID();
    sessionStorage.setItem('twitch_oauth_state', state);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'chat:read chat:edit user:read:email user:read:follows user:read:emotes',
      state,
    });

    const authUrl = `https://id.twitch.tv/oauth2/authorize?${params}`;

    // Open OAuth in a popup so the user can authenticate on twitch.tv (sets Twitch cookies)
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      authUrl,
      'twitch_oauth',
      `width=${width},height=${height},left=${left},top=${top}`,
    );

    setIsLoggingIn(true);

    // Listen for session message from the popup callback
    const onMessage = (ev: MessageEvent) => {
      try {
        if (ev.origin !== window.location.origin) return;
        const data = ev.data;
        if (data && data.type === 'mixchat_session' && data.session && data.session.platform === 'twitch') {
          setSessions((prev) => ({ ...prev, twitch: data.session }));
          setIsLoggingIn(false);
          if (popup && !popup.closed) popup.close();
          window.removeEventListener('message', onMessage);
        }
      } catch (e) {
        console.error('Failed to process auth message', e);
      }
    };

    window.addEventListener('message', onMessage);

    // Also listen for storage events as a fallback for cross-origin popups
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'mixchat_youtube_auth' && e.newValue) {
        try {
          const { session } = JSON.parse(e.newValue);
          if (session && session.platform === 'youtube') {
            setSessions((prev) => ({ ...prev, youtube: session }));
            localStorage.removeItem('mixchat_youtube_auth');
          }
        } catch (err) {
          console.error('Failed to parse youtube auth storage event', err);
        }
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const handleTwitchLogout = useCallback(() => {
    setSessions((prev) => {
      const next = { ...prev };
      delete next.twitch;
      return next;
    });
    setTwitchChannels([]);
    setSelectedTwitchChannel('');
    setSelectedTwitchChannelName('');
    setFavoriteChannels([]);
  }, []);

  const handleYoutubeLogin = useCallback(() => {
    const clientId = import.meta.env.PUBLIC_YOUTUBE_CLIENT_ID;
    const redirectUri = import.meta.env.PUBLIC_YOUTUBE_REDIRECT_URI;

    if (!clientId) {
      alert('YouTube Client ID not configured');
      return;
    }

    // Generate a random CSRF state token and persist it for the callback to verify.
    const state = crypto.randomUUID();
    sessionStorage.setItem('youtube_oauth_state', state);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/youtube.force-ssl',
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

    // Open OAuth in a popup so the main window's React state is preserved.
    // The callback page posts the session back via postMessage.
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      authUrl,
      'youtube_oauth',
      `width=${width},height=${height},left=${left},top=${top}`,
    );

    setIsLoggingIn(true);

    // Listen for session message from the popup callback
    const onMessage = (ev: MessageEvent) => {
      try {
        if (ev.origin !== window.location.origin) return;
        const data = ev.data;
        if (data && data.type === 'mixchat_session' && data.session && data.session.platform === 'youtube') {
          setSessions((prev) => ({ ...prev, youtube: data.session }));
          setIsLoggingIn(false);
          if (popup && !popup.closed) popup.close();
          window.removeEventListener('message', onMessage);
        }
      } catch (e) {
        console.error('Failed to process YouTube auth message', e);
      }
    };

    window.addEventListener('message', onMessage);

    // Clean up listener if popup is closed without completing auth
    const pollClosed = setInterval(() => {
      if (popup && popup.closed) {
        clearInterval(pollClosed);
        setIsLoggingIn(false);
        window.removeEventListener('message', onMessage);
      }
    }, 500);
  }, []);

  const handleYoutubeLogout = useCallback(() => {
    setSessions((prev) => {
      const next = { ...prev };
      delete next.youtube;
      return next;
    });
  }, []);

  const toggleFavorite = useCallback((channelId: string) => {
    setFavoriteChannels((prev) => {
      if (prev.includes(channelId)) {
        return prev.filter((id) => id !== channelId);
      } else {
        return [...prev, channelId];
      }
    });
  }, []);

  const sortedChannels = useMemo(
    () => [...twitchChannels].sort((a, b) => {
      const aIsFavorite = favoriteChannels.includes(a.id);
      const bIsFavorite = favoriteChannels.includes(b.id);
      if (aIsFavorite && !bIsFavorite) return -1;
      if (!aIsFavorite && bIsFavorite) return 1;
      return 0;
    }),
    [twitchChannels, favoriteChannels]
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: leftColumnVisible ? '280px 1fr' : '1fr', gap: '0', height: '100%' }}>
      {leftColumnVisible && (
        <div data-sidebar-section style={{ display: 'flex', flexDirection: 'column', gap: '0', overflowY: 'auto', padding: '0', borderRight: '1px solid #1a1a1a' }}>
          {/* Close button for mobile */}
          <div style={{ display: 'none', justifyContent: 'flex-end', padding: '8px', backgroundColor: '#0a0a0a', borderBottom: '1px solid #1a1a1a' }} className="sidebar-close-btn-container">
            <button
              onClick={() => setLeftColumnVisible(false)}
              style={{
                background: 'none',
                border: 'none',
                color: '#999',
                cursor: 'pointer',
                padding: '4px 8px',
                fontSize: '20px',
                lineHeight: '1',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Close sidebar"
            >
              <FaTimes size={18} />
            </button>
          </div>
          {(isLoggingIn || isLoading) && (
            <div className="loading-overlay">
              <div className="loading-spinner"></div>
              <div className="loading-text">
                {isLoggingIn ? 'Connecting to Twitch...' : 'Loading...'}
              </div>
            </div>
          )}
          <LoginPanel
            twitchConnected={!!sessions.twitch}
            twitchUser={sessions.twitch?.displayName}
            twitchProfileImage={sessions.twitch?.profileImageUrl}
            twitchUserName={sessions.twitch?.username}
            twitchUserId={sessions.twitch?.userId}
            twitchChannels={sortedChannels}
            selectedTwitchChannel={selectedTwitchChannel}
            favoriteChannels={favoriteChannels}
            onToggleFavorite={toggleFavorite}
            onChannelChange={(channelId) => setChannelData(channelId)}
            onTwitchLogin={handleTwitchLogin}
            onTwitchLogout={handleTwitchLogout}
            youtubeConnected={!!sessions.youtube}
            youtubeUser={sessions.youtube?.displayName}
            onYoutubeLogin={handleYoutubeLogin}
            onYoutubeLogout={handleYoutubeLogout}
            onManageWatchlist={() => setShowWatchlistManager(true)}
            onManageYoutubeLinks={() => setShowYoutubeLinker(true)}
            embedDefaultOpen={embedDefaultOpen}
            onEmbedDefaultOpenChange={setEmbedDefaultOpen}
            unifyChatEnabled={unifyChatEnabled}
            onUnifyChatEnabledChange={setUnifyChatEnabled}
            fontSize={fontSize}
            onFontSizeChange={setFontSize}
            chatFont={chatFont}
            onChatFontChange={setChatFont}
            mentionSoundEnabled={mentionSoundEnabled}
            onMentionSoundEnabledChange={setMentionSoundEnabled}
          />
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: showStreamEmbed ? `${videoRatio}fr 2px ${100 - videoRatio}fr` : '1fr', gap: '0', overflow: 'hidden', backgroundColor: '#1a1a1a' }} data-app-grid className="app-grid">
        {showStreamEmbed && (
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: '0' }} data-stream-embed>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 12px',
              backgroundColor: '#0a0a0a',
              borderRight: '1px solid #1a1a1a',
              fontSize: '12px',
              color: '#999',
              gap: '8px'
            }}>
              <span>{playerType === 'youtube' ? 'YouTube Stream' : 'Twitch Stream'}</span>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                <button
                  onClick={() => setPlayerType('embed')}
                  style={{
                    background: playerType === 'embed' ? '#6366f1' : '#2d2d2d',
                    border: 'none',
                    color: playerType === 'embed' ? '#fff' : '#999',
                    cursor: 'pointer',
                    fontSize: '11px',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    transition: 'all 0.2s',
                  }}
                  title="Twitch embed player"
                >
                  Twitch
                </button>
                <button
                  onClick={() => setPlayerType('m3u8')}
                  style={{
                    background: playerType === 'm3u8' ? '#6366f1' : '#2d2d2d',
                    border: 'none',
                    color: playerType === 'm3u8' ? '#fff' : '#999',
                    cursor: 'pointer',
                    fontSize: '11px',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    transition: 'all 0.2s',
                  }}
                  title="M3U8 HLS player"
                >
                  M3U8
                </button>
                {linkedYoutubeUrl && (
                  <button
                    onClick={() => setPlayerType('youtube')}
                    style={{
                      background: playerType === 'youtube' ? '#FF0000' : '#2d2d2d',
                      border: 'none',
                      color: playerType === 'youtube' ? '#fff' : '#999',
                      cursor: 'pointer',
                      fontSize: '11px',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      transition: 'all 0.2s',
                    }}
                    title="YouTube live stream"
                  >
                    YouTube
                  </button>
                )}
              </div>
              <button
                onClick={() => setShowStreamEmbed(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#999',
                  cursor: 'pointer',
                  padding: '0 4px',
                  lineHeight: '1',
                  display: 'flex',
                  alignItems: 'center',
                }}
                title="Hide stream embed"
              >
                <FaTimes size={16} />
              </button>
            </div>
            <div ref={embedRef} style={{ flex: 1, overflow: 'hidden', backgroundColor: '#0a0a0a' }}>
              {playerType === 'youtube' ? (
                youtubeStreamVideoId ? (
                  <iframe
                    width="100%"
                    height="100%"
                    src={`https://www.youtube.com/embed/${youtubeStreamVideoId}?autoplay=1`}
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    title="YouTube Stream"
                    style={{ border: 'none' }}
                  />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999', fontSize: '13px' }}>
                    No YouTube live stream found for this channel
                  </div>
                )
              ) : (
                <StreamEmbed
                  channelName={selectedTwitchChannelName}
                  playerType={playerType as 'embed' | 'm3u8'}
                  twitchConnected={!!sessions.twitch}
                  onTwitchLogin={handleTwitchLogin}
                  twitchAccessToken={sessions.twitch?.accessToken}
                />
              )}
            </div>
          </div>
        )}
        {showStreamEmbed && (
          <div
            data-resizer
            style={{
              width: '2px',
              backgroundColor: '#1a1a1a',
              cursor: 'col-resize',
              userSelect: 'none',
              transition: isDragging ? 'none' : 'background-color 0.2s',
            }}
            onMouseDown={() => setIsDragging(true)}
            onMouseEnter={(e) => !isDragging && (e.currentTarget.style.backgroundColor = '#6366f1')}
            onMouseLeave={(e) => !isDragging && (e.currentTarget.style.backgroundColor = '#1a1a1a')}
            title="Drag to resize"
          />
        )}
        <div data-chat-section style={{ display: 'flex', flexDirection: 'column', gap: '0', overflow: 'hidden', minHeight: '0' }}>
          <ChatApp
            twitchConnected={!!sessions.twitch}
            selectedTwitchChannel={selectedTwitchChannel}
            selectedTwitchChannelName={selectedTwitchChannelName}
            selectedTwitchChannelDisplayName={selectedTwitchChannelDisplayName}
            twitchSession={sessions.twitch}
            onToggleSidebar={() => setLeftColumnVisible(!leftColumnVisible)}
            sidebarVisible={leftColumnVisible}
            showStreamEmbed={showStreamEmbed}
            onToggleStreamEmbed={() => setShowStreamEmbed(!showStreamEmbed)}
            viewerCount={viewerCount}
            linkedYoutubeUrl={linkedYoutubeUrl || undefined}
            youtubeSession={sessions.youtube}
            unifyChatEnabled={unifyChatEnabled}
            fontSize={fontSize}
            chatFont={chatFont}
            mentionSoundEnabled={mentionSoundEnabled}
          />
        </div>
      </div>

      {/* Live Notification Popup */}
      {newLiveStreamer && (
        <LiveNotification
          streamer={newLiveStreamer}
          onViewNow={() => {
            // Persist that user has seen this notification so it won't reappear
            markStreamerNotified(newLiveStreamer.id);
            // Open channel in new tab with shareable URL
            const channelName = newLiveStreamer.name || newLiveStreamer.id;
            const url = new URL(window.location.href);
            url.searchParams.set('twitchChannel', channelName);
            clearNewNotification();
            window.location.href = url.toString();
          }}
          onClose={() => {
            markStreamerNotified(newLiveStreamer.id);
            clearNewNotification();
          }}
        />
      )}

      {/* Watchlist Manager Modal */}
      {showWatchlistManager && (
        <WatchlistManager
          availableChannels={allTwitchChannels}
          onClose={() => setShowWatchlistManager(false)}
        />
      )}

      {/* YouTube Linker Modal */}
      {showYoutubeLinker && (
        <YouTubeLinker
          availableChannels={allTwitchChannels}
          onClose={() => setShowYoutubeLinker(false)}
          onLinksChanged={() => setYtLinksVersion((v) => v + 1)}
        />
      )}

      {/* Resize Overlay to prevent iframe event capture */}
      {isDragging && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            cursor: 'col-resize',
            background: 'transparent',
            userSelect: 'none',
          }}
        />
      )}
    </div>
  );
}
