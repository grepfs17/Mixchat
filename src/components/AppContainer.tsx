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
import { primeAudioContext } from '../hooks/useTwitchChat';
import type { MentionSoundType } from '../hooks/useTwitchChat';
import StreamGrid from './StreamGrid';

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
  gameName?: string;
  thumbnailUrl?: string;
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
  const [mentionVolume, setMentionVolume] = useState(0.5); // Mention sound volume 0–1
  const [mentionSoundType, setMentionSoundType] = useState<MentionSoundType>('ding'); // Mention sound style
  const [showDeletedMessages, setShowDeletedMessages] = useState(true); // Show or hide messages deleted by mods

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
  const handleTwitchSessionUpdate = useCallback((updatedSession: PlatformSession) => {
    setSessions((prev) => {
      const updatedSessions = { ...prev, twitch: updatedSession };
      localStorage.setItem('mixchat_sessions', JSON.stringify(stripTokens(updatedSessions)));
      return updatedSessions;
    });
  }, []);

  const handleTwitchRefreshError = useCallback((error: Error) => {
    console.error('Token refresh permanently failed:', error);
    setSessions({});
    localStorage.removeItem('mixchat_sessions');
  }, []);

  const handleYoutubeSessionUpdate = useCallback((updatedSession: PlatformSession) => {
    setSessions((prev) => {
      const updatedSessions = { ...prev, youtube: updatedSession };
      localStorage.setItem('mixchat_sessions', JSON.stringify(stripTokens(updatedSessions)));
      return updatedSessions;
    });
  }, []);

  const handleYoutubeRefreshError = useCallback((error: Error) => {
    console.error('YouTube token refresh permanently failed:', error);
    setSessions((prev) => {
      const updated = { ...prev };
      delete updated.youtube;
      localStorage.setItem('mixchat_sessions', JSON.stringify(stripTokens(updated)));
      return updated;
    });
  }, []);

  useTokenRefresh(
    sessions.twitch || null,
    handleTwitchSessionUpdate,
    handleTwitchRefreshError,
    {
      warningThreshold: 10 * 60 * 1000, // Start refresh 10 min before expiry
      checkInterval: 120 * 1000, // Check every 2 minutes
      maxRetries: 3, // Retry up to 3 times
    }
  );
  // Also refresh YouTube tokens when necessary
  useTokenRefresh(
    sessions.youtube || null,
    handleYoutubeSessionUpdate,
    handleYoutubeRefreshError,
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

    // Update URL to /channel/<name>
    window.history.pushState({}, '', `/channel/${channelName}`);
  }, [twitchChannels, allTwitchChannels, sessions.twitch]);

  // Restore channel from URL path /channel/<name>
  useEffect(() => {
    const match = window.location.pathname.match(/^\/channel\/([^\/]+)$/);
    const channelParam = match ? decodeURIComponent(match[1]) : null;

    if (channelParam && !hasLoadedChannel) {
      // Search online followed channels first, then all followed channels
      const foundChannel =
        twitchChannels.find((ch) => ch.name === channelParam) ||
        allTwitchChannels.find((ch) => ch.name === channelParam);

      if (foundChannel) {
        setChannelData(foundChannel.id);
        setHasLoadedChannel(true);
      } else if (!isLoading) {
        // Channels have finished loading and this channel isn't in the followed list
        setChannelData(channelParam);
        setHasLoadedChannel(true);
      }
    }
  }, [twitchChannels, allTwitchChannels, hasLoadedChannel, isLoading, setChannelData]);

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

  // Load mention volume from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('mixchat_mention_volume');
    if (saved !== null) {
      try { setMentionVolume(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  // Save mention volume to localStorage
  useEffect(() => {
    localStorage.setItem('mixchat_mention_volume', JSON.stringify(mentionVolume));
  }, [mentionVolume]);

  // Load mention sound type from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('mixchat_mention_sound_type');
    if (saved !== null) {
      try { setMentionSoundType(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  // Save mention sound type to localStorage
  useEffect(() => {
    localStorage.setItem('mixchat_mention_sound_type', JSON.stringify(mentionSoundType));
  }, [mentionSoundType]);

  // Load show deleted messages setting from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('mixchat_show_deleted_messages');
    if (saved !== null) {
      try { setShowDeletedMessages(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  // Save show deleted messages setting to localStorage
  useEffect(() => {
    localStorage.setItem('mixchat_show_deleted_messages', JSON.stringify(showDeletedMessages));
  }, [showDeletedMessages]);

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

  // While sessions are being restored from localStorage, render nothing to avoid flash
  if (isLoading) {
    return (
      <div className="loading-overlay">
        <div className="loading-spinner"></div>
        <div className="loading-text">Loading...</div>
      </div>
    );
  }

  // Not logged in and not loading, clean splash screen
  if (!isLoggingIn && !sessions.twitch) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'var(--color-bg-primary)', gap: '28px' }}>
        <img src="/logo.png" alt="Mixchat" style={{ width: 'clamp(180px, 30vw, 280px)', height: 'auto', opacity: 0.95 }} />
        <button
          onClick={handleTwitchLogin}
          style={{
            background: 'var(--color-twitch)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius-xl)',
            padding: '11px 28px',
            fontSize: '15px',
            fontWeight: 600,
            fontFamily: 'var(--font-ui)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 20px rgba(145,70,255,0.35)',
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/>
          </svg>
          Login with Twitch
        </button>
      </div>
    );
  }

  return (
    <div
      style={{ display: 'grid', gridTemplateColumns: leftColumnVisible ? '280px 1fr' : '1fr', gap: '0', height: '100%' }}
      onClick={primeAudioContext}
      onKeyDown={primeAudioContext}
    >
      {leftColumnVisible && (
        <div data-sidebar-section style={{ display: 'flex', flexDirection: 'column', gap: '0', overflowY: 'auto', padding: '0', borderRight: '1px solid #1c1c1c', background: 'linear-gradient(160deg, #131313 0%, #0d0d0d 100%)' }}>
          {/* Close button for mobile */}
          <div style={{ display: 'none', justifyContent: 'flex-end', padding: '8px', backgroundColor: 'transparent', borderBottom: '1px solid rgba(255,255,255,0.06)' }} className="sidebar-close-btn-container">
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
            mentionVolume={mentionVolume}
            onMentionVolumeChange={setMentionVolume}
            mentionSoundType={mentionSoundType}
            onMentionSoundTypeChange={setMentionSoundType}
            showDeletedMessages={showDeletedMessages}
            onShowDeletedMessagesChange={setShowDeletedMessages}
            onGoHome={() => {
              setSelectedTwitchChannel('');
              setSelectedTwitchChannelName('');
              setSelectedTwitchChannelDisplayName('');
              window.history.pushState({}, '', '/');
            }}
          />
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: (showStreamEmbed && !!selectedTwitchChannel) ? `${videoRatio}fr 2px ${100 - videoRatio}fr` : '1fr', gap: '0', overflow: 'hidden', backgroundColor: '#1a1a1a' }} data-app-grid className="app-grid">
        {(sessions.twitch && !selectedTwitchChannel) ? (
          <StreamGrid
            channels={twitchChannels}
            favoriteChannels={favoriteChannels}
            onChannelSelect={(id) => setChannelData(id)}
            onToggleFavorite={toggleFavorite}
          />
        ) : (<>
        {showStreamEmbed && (
          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: '0' }} data-stream-embed>
            <div className="stream-embed-header">
              <span className="stream-embed-title">{playerType === 'youtube' ? 'YouTube' : 'Twitch'}</span>
              <div className="player-type-buttons">
                <button
                  onClick={() => setPlayerType('embed')}
                  className={`player-type-btn${playerType === 'embed' ? ' active-twitch' : ''}`}
                  title="Twitch embed player"
                >
                  Twitch
                </button>
                <button
                  onClick={() => setPlayerType('m3u8')}
                  className={`player-type-btn${playerType === 'm3u8' ? ' active-m3u8' : ''}`}
                  title="M3U8 HLS player"
                >
                  M3U8
                </button>
                {linkedYoutubeUrl && (
                  <button
                    onClick={() => setPlayerType('youtube')}
                    className={`player-type-btn${playerType === 'youtube' ? ' active-youtube' : ''}`}
                    title="YouTube live stream"
                  >
                    YouTube
                  </button>
                )}
              </div>
              <button
                onClick={() => setShowStreamEmbed(false)}
                className="stream-embed-close"
                title="Hide stream embed"
              >
                <FaTimes size={15} />
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
              width: '4px',
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
            mentionVolume={mentionVolume}
            mentionSoundType={mentionSoundType}
            showDeletedMessages={showDeletedMessages}
          />
        </div>
        </>)}
      </div>

      {/* Live Notification Popup */}
      {newLiveStreamer && (
        <LiveNotification
          streamer={newLiveStreamer}
          onViewNow={() => {
            // Persist that user has seen this notification so it won't reappear
            markStreamerNotified(newLiveStreamer.id);
            setChannelData(newLiveStreamer.id);
            clearNewNotification();
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

      {/* Loading / Login Overlay */}
      {isLoggingIn && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <div className="loading-text">Connecting...</div>
        </div>
      )}
    </div>
  );
}
