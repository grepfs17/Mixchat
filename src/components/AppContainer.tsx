import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { FaTimes, FaChevronLeft, FaChevronRight } from "react-icons/fa";
import LoginPanel from "./LoginPanel";
import ChatApp from "./chat/ChatApp";
import StreamEmbed from "./StreamEmbed";
import LiveNotification from "./LiveNotification";
import WatchlistManager from "./WatchlistManager";
import YouTubeLinker from "./YouTubeLinker";

import type { PlatformSession, ChatFont, ChatTheme } from "../lib/types";
import { applyTheme } from "../lib/themes";
import { getYoutubeLinkForChannel, getYoutubeLinks } from "../lib/youtubeLinks";
import { getAllFollowedChannels, getStreamStatus } from "../lib/twitch";
import { useStreamMonitor } from "../hooks/useStreamMonitor";
import { useAuthSessions } from "../hooks/useAuthSessions";
import { markStreamerNotified } from "../lib/streamMonitor";
import { primeAudioContext } from "../hooks/useTwitchChat";
import type { MentionSoundType } from "../hooks/useTwitchChat";
import { loadEventSounds, saveEventSounds } from "../lib/eventSoundStorage";
import StreamGrid from "./StreamGrid";
import type { StreamTransitionInfo } from "./StreamGrid";
import StreamTransitionOverlay from "./StreamTransitionOverlay";
import LandingPage from "./LandingPage";

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
  const {
    sessions,
    isLoggingIn,
    isLoading,
    setIsLoading,
    twitchLogin: handleTwitchLogin,
    twitchLogout,
    youtubeLogin: handleYoutubeLogin,
    youtubeLogout: handleYoutubeLogout,
    clearTwitchSession,
  } = useAuthSessions();
  const [twitchChannels, setTwitchChannels] = useState<TwitchChannel[]>([]);
  const [allTwitchChannels, setAllTwitchChannels] = useState<TwitchChannel[]>(
    [],
  );
  const [selectedTwitchChannel, setSelectedTwitchChannel] =
    useState<string>("");
  const [selectedTwitchChannelName, setSelectedTwitchChannelName] =
    useState<string>("");
  const [
    selectedTwitchChannelDisplayName,
    setSelectedTwitchChannelDisplayName,
  ] = useState<string>("");
  const [hasLoadedChannel, setHasLoadedChannel] = useState(false);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [leftColumnVisible, setLeftColumnVisible] = useState<
    boolean | undefined
  >(undefined);
  const [embedDefaultOpen, setEmbedDefaultOpen] = useState(true); // Should the stream be expanded by default?
  const [showStreamEmbed, setShowStreamEmbed] = useState(true);
  const [videoRatio, setVideoRatio] = useState(70); // Default 75% video
  const [isDragging, setIsDragging] = useState(false);
  const embedRef = useRef<HTMLDivElement>(null);
  const [playerType, setPlayerType] = useState<"embed" | "m3u8" | "youtube">(
    "embed",
  );
  const [viewerCount, setViewerCount] = useState<number | null>(null);
  const [favoriteChannels, setFavoriteChannels] = useState<string[]>([]); // Favorite channel IDs
  const [showWatchlistManager, setShowWatchlistManager] = useState(false);
  const [showYoutubeLinker, setShowYoutubeLinker] = useState(false);
  const [linkedYoutubeUrl, setLinkedYoutubeUrl] = useState<string | null>(null);
  const [ytLinksVersion, setYtLinksVersion] = useState(0);
  const [youtubeStreamVideoId, setYoutubeStreamVideoId] = useState<
    string | null
  >(null);
  const [unifyChatEnabled, setUnifyChatEnabled] = useState(false);
  const [useYoutubeEmbed, setUseYoutubeEmbed] = useState(true);
  const [fontSize, setFontSize] = useState(14); // Global chat font size setting
  const [chatFont, setChatFont] = useState<ChatFont>("inter"); // Global chat font family
  const [mentionSoundEnabled, setMentionSoundEnabled] = useState(true); // Toggle for mention notification sound
  const [mentionVolume, setMentionVolume] = useState(0.2); // Mention sound volume 0,1
  const [mentionSoundType, setMentionSoundType] =
    useState<MentionSoundType>("ding"); // Mention sound style
  const [showDeletedMessages, setShowDeletedMessages] = useState(true); // Show or hide messages deleted by mods
  const [compactActions, setCompactActions] = useState(false); // Hide inline action buttons and sort context menu
  const [splitChatEnabled, setSplitChatEnabled] = useState(false); // Split chat visual separator
  const [chatTheme, setChatTheme] = useState<ChatTheme>("default"); // Chat theme
  const [hideViewerCount, setHideViewerCount] = useState(false);
  const [disableModModeByDefault, setDisableModModeByDefault] = useState(false);
  const [hideChatTimestamps, setHideChatTimestamps] = useState(false);
  const [hlsQualities, setHlsQualities] = useState<
    Array<{ label: string; url: string }>
  >([]);
  const [selectedHlsQualityIdx, setSelectedHlsQualityIdx] = useState(0);
  const [showHlsQualityMenu, setShowHlsQualityMenu] = useState(false);
  const [streamTransition, setStreamTransition] =
    useState<StreamTransitionInfo | null>(null);
  const [eventSounds, setEventSounds] = useState<Record<string, string>>({});
  const [eventSoundVolume, setEventSoundVolume] = useState(1);
  const [ignoredUsers, setIgnoredUsers] = useState<string[]>([]);

  const isOnOwnChannel = !!(
    sessions.twitch &&
    selectedTwitchChannel &&
    (selectedTwitchChannel === sessions.twitch.userId ||
      (sessions.twitch.username &&
        selectedTwitchChannelName.toLowerCase() ===
          sessions.twitch.username.toLowerCase()))
  );
  const shouldHideViewerCount = hideViewerCount && isOnOwnChannel;

  // Prevent saving event sounds until the initial IndexedDB load completes
  const eventSoundsLoadedRef = useRef(false);

  // Stream monitoring
  const clientId = import.meta.env.PUBLIC_TWITCH_CLIENT_ID;
  const { newLiveStreamer, clearNewNotification } = useStreamMonitor({
    session: sessions.twitch,
    clientId,
    enabled: !!sessions.twitch,
    checkInterval: 60000, // Check every minute
  });

  useEffect(() => {
    // Set initial value based on screen width
    setLeftColumnVisible(window.innerWidth >= 1366);

    const handleResize = () => {
      // Auto-show sidebar when resizing to a wide screen, but don't
      // force-close it on narrow screens — the user may have explicitly
      // opened it on mobile (e.g. tapping the hamburger button).
      // This also prevents the mobile virtual-keyboard resize from
      // closing the sidebar when the user taps an input field.
      if (window.innerWidth >= 1366) {
        setLeftColumnVisible(true);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Pin the viewport height once on mount so the stream embed height is immune
  // to the mobile virtual keyboard resizing the layout viewport.
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--initial-vh-px",
      `${window.innerHeight}px`,
    );
  }, []);

  // Keep the stream embed visible when the mobile keyboard opens

  // Fetch Twitch channels when user logs in
  useEffect(() => {
    const fetchChannels = async () => {
      if (sessions.twitch && sessions.twitch.accessToken) {
        try {
          const accessToken = sessions.twitch.accessToken;

          const clientId = import.meta.env.PUBLIC_TWITCH_CLIENT_ID;

          const allChannels = await getAllFollowedChannels(
            accessToken,
            clientId,
            sessions.twitch.userId,
          );

          setAllTwitchChannels(allChannels);

          const onlineChannels = allChannels.filter((ch) => ch.viewerCount > 0);
          setTwitchChannels(onlineChannels);

          setHasLoadedChannel(false);
        } catch (error) {
          console.error("Failed to fetch Twitch channels:", error);
          const is401Error =
            error instanceof Error && error.message.includes("401");
          if (is401Error) {
            console.log("Received 401 error, clearing session...");
            clearTwitchSession();
          }
        } finally {
          setChannelsLoading(false);
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

  const setChannelData = useCallback(
    (channelId: string, transitionInfo?: StreamTransitionInfo) => {
      // Search by numeric ID first, then by login name, across online and all channels
      const channel =
        twitchChannels.find((ch) => ch.id === channelId) ||
        allTwitchChannels.find((ch) => ch.id === channelId) ||
        twitchChannels.find((ch) => ch.name === channelId) ||
        allTwitchChannels.find((ch) => ch.name === channelId);

      // Use the resolved numeric ID so 7TV/BTTV/Twitch APIs receive the correct value
      const resolvedId = channel?.id || channelId;

      const ownSession = sessions.twitch;
      const isOwnUserId = !channel && ownSession?.userId === channelId;

      const isOwnLogin =
        !channel &&
        !!ownSession?.username &&
        ownSession.username.toLowerCase() === channelId.toLowerCase();

      const channelName =
        channel?.name ||
        (isOwnUserId || isOwnLogin
          ? (ownSession!.username ?? channelId)
          : channelId);
      const channelDisplayName =
        channel?.displayName ||
        (isOwnUserId || isOwnLogin
          ? (ownSession!.displayName ?? channelId)
          : channel?.name || channelId);
      const finalId =
        isOwnUserId || isOwnLogin
          ? ownSession!.userId || resolvedId
          : resolvedId;

      setSelectedTwitchChannel(finalId);
      setSelectedTwitchChannelName(channelName);
      setSelectedTwitchChannelDisplayName(channelDisplayName);

      if (transitionInfo) {
        setStreamTransition(transitionInfo);
      }

      // Update URL to /channel/<name>
      window.history.pushState({}, "", `/channel/${channelName}`);
    },
    [twitchChannels, allTwitchChannels, sessions.twitch],
  );

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
  }, [
    twitchChannels,
    allTwitchChannels,
    hasLoadedChannel,
    isLoading,
    setChannelData,
  ]);

  useEffect(() => {
    const saved = localStorage.getItem("mixchat_video_ratio");
    if (saved) {
      setVideoRatio(Number(saved));
    }
  }, []);

  // Save video ratio to localStorage
  useEffect(() => {
    localStorage.setItem("mixchat_video_ratio", String(videoRatio));
  }, [videoRatio]);

  // Player always defaults to Twitch embed on load — no localStorage restore

  // Reset HLS quality state when channel or player type changes
  useEffect(() => {
    setHlsQualities([]);
    setSelectedHlsQualityIdx(0);
    setShowHlsQualityMenu(false);
  }, [selectedTwitchChannelName, playerType]);

  // If player is set to youtube but there's no linked URL, fall back to embed
  useEffect(() => {
    if (playerType === "youtube" && !linkedYoutubeUrl) {
      setPlayerType("embed");
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
      if (linkedYoutubeUrl.includes("v=")) {
        setYoutubeStreamVideoId(
          new URLSearchParams(new URL(linkedYoutubeUrl).search).get("v"),
        );
        return;
      } else if (linkedYoutubeUrl.includes("youtu.be/")) {
        setYoutubeStreamVideoId(
          linkedYoutubeUrl.split("youtu.be/")[1].split("?")[0],
        );
        return;
      } else if (linkedYoutubeUrl.includes("/live/")) {
        setYoutubeStreamVideoId(
          linkedYoutubeUrl.split("/live/")[1].split("?")[0],
        );
        return;
      }
    } catch {
      /* not a direct video URL */
    }

    // Otherwise resolve via API
    let cancelled = false;
    const fetchId = async () => {
      try {
        const params = new URLSearchParams();
        params.append("action", "getLiveVideo");
        params.append("channelUrl", linkedYoutubeUrl);

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
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [linkedYoutubeUrl]);

  useEffect(() => {
    if (
      !selectedTwitchChannel ||
      !sessions.twitch ||
      !sessions.twitch.accessToken
    ) {
      setViewerCount(null);
      return;
    }

    const fetchViewerCount = async () => {
      try {
        const clientId = import.meta.env.PUBLIC_TWITCH_CLIENT_ID;
        const status = await getStreamStatus(
          sessions.twitch!.accessToken,
          clientId,
          selectedTwitchChannel,
        );

        if (status) {
          setViewerCount(status.viewerCount || 0);
        }
      } catch (error) {
        console.error("Failed to fetch viewer count:", error);
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
      } else if (
        sessions.youtube &&
        sessions.twitch &&
        (selectedTwitchChannel === sessions.twitch.userId ||
          selectedTwitchChannel === sessions.twitch.username)
      ) {
        // If viewing our own channel and logged into YouTube, use our own channel
        setLinkedYoutubeUrl(
          `https://www.youtube.com/channel/${sessions.youtube.userId}`,
        );
      } else {
        setLinkedYoutubeUrl(null);
      }
    } else {
      setLinkedYoutubeUrl(null);
    }
  }, [
    selectedTwitchChannel,
    ytLinksVersion,
    sessions.youtube,
    sessions.twitch,
  ]);

  useEffect(() => {
    const saved = localStorage.getItem("mixchat_favorite_channels");
    if (saved) {
      try {
        setFavoriteChannels(JSON.parse(saved));
      } catch (error) {
        console.error("Failed to load favorite channels:", error);
      }
    }
  }, []);

  // Save favorite channels to localStorage
  useEffect(() => {
    localStorage.setItem(
      "mixchat_favorite_channels",
      JSON.stringify(favoriteChannels),
    );
  }, [favoriteChannels]);

  // Load embed default open config from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("mixchat_embed_default_open");
    if (saved !== null) {
      try {
        const value = JSON.parse(saved);
        setEmbedDefaultOpen(value);
        setShowStreamEmbed(value);
      } catch (error) {
        console.error("Failed to load embed default open config:", error);
      }
    }
  }, []);

  // Save embed default open config to localStorage
  useEffect(() => {
    localStorage.setItem(
      "mixchat_embed_default_open",
      JSON.stringify(embedDefaultOpen),
    );
  }, [embedDefaultOpen]);

  // Load unify chat setting from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("mixchat_unify_chat");
    if (saved !== null) {
      try {
        setUnifyChatEnabled(JSON.parse(saved));
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Save unify chat setting to localStorage
  useEffect(() => {
    localStorage.setItem(
      "mixchat_unify_chat",
      JSON.stringify(unifyChatEnabled),
    );
  }, [unifyChatEnabled]);

  // Load split chat setting from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("mixchat_split_chat");
    if (saved !== null) {
      try {
        setSplitChatEnabled(JSON.parse(saved));
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Save split chat setting to localStorage
  useEffect(() => {
    localStorage.setItem(
      "mixchat_split_chat",
      JSON.stringify(splitChatEnabled),
    );
  }, [splitChatEnabled]);

  // Load YouTube embed setting from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("mixchat_use_youtube_embed");
    if (saved !== null) {
      try {
        setUseYoutubeEmbed(JSON.parse(saved));
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Save YouTube embed setting to localStorage
  useEffect(() => {
    localStorage.setItem(
      "mixchat_use_youtube_embed",
      JSON.stringify(useYoutubeEmbed),
    );
  }, [useYoutubeEmbed]);

  // Load font size setting from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("mixchat_font_size");
    if (saved !== null) {
      try {
        setFontSize(JSON.parse(saved));
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Save font size setting to localStorage
  useEffect(() => {
    localStorage.setItem("mixchat_font_size", JSON.stringify(fontSize));
  }, [fontSize]);

  // Load mention sound setting from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("mixchat_mention_sound");
    if (saved !== null) {
      try {
        setMentionSoundEnabled(JSON.parse(saved));
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Save mention sound setting to localStorage
  useEffect(() => {
    localStorage.setItem(
      "mixchat_mention_sound",
      JSON.stringify(mentionSoundEnabled),
    );
  }, [mentionSoundEnabled]);

  // Load mention volume from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("mixchat_mention_volume");
    if (saved !== null) {
      try {
        setMentionVolume(JSON.parse(saved));
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Save mention volume to localStorage
  useEffect(() => {
    localStorage.setItem(
      "mixchat_mention_volume",
      JSON.stringify(mentionVolume),
    );
  }, [mentionVolume]);

  // Load mention sound type from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("mixchat_mention_sound_type");
    if (saved !== null) {
      try {
        setMentionSoundType(JSON.parse(saved));
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Save mention sound type to localStorage
  useEffect(() => {
    localStorage.setItem(
      "mixchat_mention_sound_type",
      JSON.stringify(mentionSoundType),
    );
  }, [mentionSoundType]);

  // Load show deleted messages setting from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("mixchat_show_deleted_messages");
    if (saved !== null) {
      try {
        setShowDeletedMessages(JSON.parse(saved));
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Load compact actions setting from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("mixchat_compact_actions");
    if (saved !== null) {
      try {
        setCompactActions(JSON.parse(saved));
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Save show deleted messages setting to localStorage
  useEffect(() => {
    localStorage.setItem(
      "mixchat_show_deleted_messages",
      JSON.stringify(showDeletedMessages),
    );
  }, [showDeletedMessages]);

  // Save compact actions setting to localStorage
  useEffect(() => {
    localStorage.setItem(
      "mixchat_compact_actions",
      JSON.stringify(compactActions),
    );
  }, [compactActions]);

  // Load chat font setting from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("mixchat_chat_font");
    if (saved !== null) {
      try {
        setChatFont(JSON.parse(saved));
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Save chat font setting to localStorage
  useEffect(() => {
    localStorage.setItem("mixchat_chat_font", JSON.stringify(chatFont));
  }, [chatFont]);

  // Load hide viewer count setting from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("mixchat_hide_viewer_count");
    if (saved !== null) {
      try {
        setHideViewerCount(JSON.parse(saved));
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Save hide viewer count setting to localStorage
  useEffect(() => {
    localStorage.setItem(
      "mixchat_hide_viewer_count",
      JSON.stringify(hideViewerCount),
    );
  }, [hideViewerCount]);

  // Load disable mod mode by default setting from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("mixchat_disable_mod_mode_by_default");
    if (saved !== null) {
      try {
        setDisableModModeByDefault(JSON.parse(saved));
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Save disable mod mode by default setting to localStorage
  useEffect(() => {
    localStorage.setItem(
      "mixchat_disable_mod_mode_by_default",
      JSON.stringify(disableModModeByDefault),
    );
  }, [disableModModeByDefault]);

  // Load hide chat timestamps setting from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("mixchat_hide_chat_timestamps");
    if (saved !== null) {
      try {
        setHideChatTimestamps(JSON.parse(saved));
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Save hide chat timestamps setting to localStorage
  useEffect(() => {
    localStorage.setItem(
      "mixchat_hide_chat_timestamps",
      JSON.stringify(hideChatTimestamps),
    );
  }, [hideChatTimestamps]);

  // Load event sounds from IndexedDB (migrates legacy localStorage on first run)
  useEffect(() => {
    let cancelled = false;
    loadEventSounds()
      .then((sounds) => {
        if (!cancelled) {
          setEventSounds(sounds || {});
          eventSoundsLoadedRef.current = true;
        }
      })
      .catch(() => {
        eventSoundsLoadedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Save event sounds to IndexedDB
  useEffect(() => {
    if (!eventSoundsLoadedRef.current) return;
    saveEventSounds(eventSounds).catch(() => {});
  }, [eventSounds]);

  // Load event sound volume from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("mixchat_event_sound_volume");
    if (saved !== null) {
      try {
        setEventSoundVolume(JSON.parse(saved));
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Save event sound volume to localStorage
  useEffect(() => {
    localStorage.setItem(
      "mixchat_event_sound_volume",
      JSON.stringify(eventSoundVolume),
    );
  }, [eventSoundVolume]);

  // Load chat theme setting from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("mixchat_chat_theme");
    if (saved !== null) {
      try {
        setChatTheme(JSON.parse(saved));
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Save chat theme setting to localStorage
  useEffect(() => {
    localStorage.setItem("mixchat_chat_theme", JSON.stringify(chatTheme));
  }, [chatTheme]);

  // Load ignored users setting from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("mixchat_ignored_users");
    if (saved !== null) {
      try {
        setIgnoredUsers(JSON.parse(saved));
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Save ignored users setting to localStorage
  useEffect(() => {
    localStorage.setItem("mixchat_ignored_users", JSON.stringify(ignoredUsers));
  }, [ignoredUsers]);

  // Apply theme to document
  useEffect(() => {
    applyTheme(chatTheme);
  }, [chatTheme]);

  // Handle mouse events for resizing
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = document.querySelector(
        "[data-app-grid]",
      ) as HTMLElement;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const newX = e.clientX - rect.left;
      const newRatio = Math.max(30, Math.min(80, (newX / rect.width) * 100));
      setVideoRatio(newRatio);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  // Auth login flows now live in useAuthSessions. The Twitch logout also has
  // to clear non-auth state (channel list, current selection, favorites).
  const handleTwitchLogout = useCallback(() => {
    twitchLogout();
    setTwitchChannels([]);
    setChannelsLoading(true);
    setSelectedTwitchChannel("");
    setSelectedTwitchChannelName("");
    setFavoriteChannels([]);
  }, [twitchLogout]);

  const toggleFavorite = useCallback((channelId: string) => {
    setFavoriteChannels((prev) => {
      if (prev.includes(channelId)) {
        return prev.filter((id) => id !== channelId);
      } else {
        return [...prev, channelId];
      }
    });
  }, []);

  const handleEventSoundChange = useCallback(
    (eventType: string, soundData: string | null) => {
      setEventSounds((prev) => {
        const updated = { ...prev };
        if (soundData === null) {
          delete updated[eventType];
        } else {
          updated[eventType] = soundData;
        }
        return updated;
      });
    },
    [],
  );

  const sortedChannels = useMemo(
    () =>
      [...twitchChannels].sort((a, b) => {
        const aIsFavorite = favoriteChannels.includes(a.id);
        const bIsFavorite = favoriteChannels.includes(b.id);
        if (aIsFavorite && !bIsFavorite) return -1;
        if (!aIsFavorite && bIsFavorite) return 1;
        return 0;
      }),
    [twitchChannels, favoriteChannels],
  );

  const linkedYoutubeChannelIds = useMemo(
    () => getYoutubeLinks().map((l) => l.twitchChannelId),
    [ytLinksVersion],
  );

  // While sessions are being restored from localStorage, render skeleton cards
  if (isLoading) {
    return (
      <div className="loading-overlay">
        <div className="loading-spinner"></div>
        <div className="loading-text">Loading...</div>
      </div>
    );
  }

  // Not logged in and not loading — show the landing page
  if (!isLoggingIn && !sessions.twitch) {
    return <LandingPage onTwitchLogin={handleTwitchLogin} />;
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: leftColumnVisible ? "280px 1fr" : "1fr",
        gap: "0",
        height: "100%",
      }}
      data-hide-timestamps={hideChatTimestamps}
      onClick={primeAudioContext}
      onKeyDown={primeAudioContext}
    >
      {leftColumnVisible && (
        <div
          data-sidebar-section
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0",
            overflowY: "auto",
            padding: "0",
            borderRight: "1px solid #1c1c1c",
            background: "linear-gradient(160deg, #131313 0%, #0d0d0d 100%)",
          }}
        >
          {/* Close button for mobile */}
          <div
            style={{
              display: "none",
              justifyContent: "flex-end",
              padding: "8px",
              backgroundColor: "transparent",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
            }}
            className="sidebar-close-btn-container"
          >
            <button
              onClick={() => setLeftColumnVisible(false)}
              style={{
                background: "none",
                border: "none",
                color: "#999",
                cursor: "pointer",
                padding: "4px 8px",
                fontSize: "20px",
                lineHeight: "1",
                display: "flex",
                alignItems: "center",
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
            onRequestClose={() => {
              if (window.innerWidth < 1366) setLeftColumnVisible(false);
            }}
            onTwitchLogin={handleTwitchLogin}
            onTwitchLogout={handleTwitchLogout}
            youtubeConnected={!!sessions.youtube}
            youtubeUser={sessions.youtube?.displayName}
            onYoutubeLogin={handleYoutubeLogin}
            onYoutubeLogout={handleYoutubeLogout}
            onManageWatchlist={() => setShowWatchlistManager(true)}
            onManageYoutubeLinks={() => setShowYoutubeLinker(true)}
            linkedYoutubeChannelIds={linkedYoutubeChannelIds}
            embedDefaultOpen={embedDefaultOpen}
            onEmbedDefaultOpenChange={setEmbedDefaultOpen}
            unifyChatEnabled={unifyChatEnabled}
            onUnifyChatEnabledChange={(v: boolean) => {
              setUnifyChatEnabled(v);
              if (v) setUseYoutubeEmbed(false);
            }}
            useYoutubeEmbed={useYoutubeEmbed}
            onUseYoutubeEmbedChange={(v: boolean) => {
              setUseYoutubeEmbed(v);
              if (v) setUnifyChatEnabled(false);
            }}
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
            compactActions={compactActions}
            onCompactActionsChange={setCompactActions}
            splitChatEnabled={splitChatEnabled}
            onSplitChatEnabledChange={setSplitChatEnabled}
            chatTheme={chatTheme}
            onChatThemeChange={setChatTheme}
            hideViewerCount={hideViewerCount}
            onHideViewerCountChange={setHideViewerCount}
            disableModModeByDefault={disableModModeByDefault}
            onDisableModModeByDefaultChange={setDisableModModeByDefault}
            hideChatTimestamps={hideChatTimestamps}
            onHideChatTimestampsChange={setHideChatTimestamps}
            eventSounds={eventSounds}
            onEventSoundChange={handleEventSoundChange}
            eventSoundVolume={eventSoundVolume}
            onEventSoundVolumeChange={setEventSoundVolume}
            ignoredUsers={ignoredUsers}
            onIgnoredUsersChange={setIgnoredUsers}
            hasYoutubeSession={!!sessions.youtube}
            onReauthYoutube={handleYoutubeLogin}
            onGoHome={() => {
              setSelectedTwitchChannel("");
              setSelectedTwitchChannelName("");
              setSelectedTwitchChannelDisplayName("");
              setStreamTransition(null);
              window.history.pushState({}, "", "/");
            }}
          />
        </div>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            showStreamEmbed && !!selectedTwitchChannel
              ? `${videoRatio}fr 2px ${100 - videoRatio}fr`
              : "1fr",
          gap: "0",
          overflow: "hidden",
          backgroundColor: "#1a1a1a",
        }}
        data-app-grid
        className={`app-grid${streamTransition ? " app-grid--transitioning" : ""}`}
      >
        {sessions.twitch && !selectedTwitchChannel ? (
          <StreamGrid
            channels={twitchChannels}
            favoriteChannels={favoriteChannels}
            linkedYoutubeChannelIds={linkedYoutubeChannelIds}
            onChannelSelect={(id, transitionInfo) =>
              setChannelData(id, transitionInfo)
            }
            onToggleFavorite={toggleFavorite}
            loading={channelsLoading}
          />
        ) : (
          <>
            {showStreamEmbed && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  minHeight: "0",
                }}
                data-stream-embed
              >
                <div className="stream-embed-header">
                  <button
                    onClick={() => setLeftColumnVisible((v) => !v)}
                    className="sidebar-toggle-button sidebar-toggle-button--in-embed"
                    title={
                      leftColumnVisible ? "Fold sidebar" : "Unfold sidebar"
                    }
                  >
                    {leftColumnVisible ? <FaChevronLeft /> : <FaChevronRight />}
                  </button>
                  <span className="stream-embed-title">
                    {playerType === "youtube" ? "YouTube" : "Twitch"}
                  </span>
                  <div className="player-type-center">
                    <div className="player-type-buttons">
                      <button
                        onClick={() => setPlayerType("embed")}
                        className={`player-type-btn${playerType === "embed" ? " active-twitch" : ""}`}
                        title="Twitch embed player"
                      >
                        Twitch
                      </button>
                      <button
                        onClick={() => setPlayerType("m3u8")}
                        className={`player-type-btn${playerType === "m3u8" ? " active-m3u8" : ""}`}
                        title="M3U8 HLS player"
                      >
                        M3U8 (experimental)
                      </button>
                      {linkedYoutubeUrl && (
                        <button
                          onClick={() => setPlayerType("youtube")}
                          className={`player-type-btn${playerType === "youtube" ? " active-youtube" : ""}`}
                          title="YouTube live stream"
                        >
                          YouTube
                        </button>
                      )}
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      marginLeft: "auto",
                    }}
                  >
                    {playerType === "m3u8" && hlsQualities.length > 1 && (
                      <div className="quality-selector quality-selector--header">
                        {showHlsQualityMenu && (
                          <div
                            className="quality-selector__backdrop"
                            onClick={() => setShowHlsQualityMenu(false)}
                          />
                        )}
                        <div className="quality-selector__inner">
                          <button
                            className="quality-selector__toggle"
                            onClick={() => setShowHlsQualityMenu((q) => !q)}
                            title={
                              hlsQualities[selectedHlsQualityIdx]?.label ??
                              "Quality"
                            }
                          >
                            ⚙{" "}
                            <span className="quality-selector__label">
                              {hlsQualities[selectedHlsQualityIdx]?.label ??
                                "Quality"}
                            </span>
                          </button>
                          {showHlsQualityMenu && (
                            <div className="quality-selector__menu">
                              {hlsQualities.map((q, i) => (
                                <button
                                  key={q.label}
                                  onClick={() => {
                                    setSelectedHlsQualityIdx(i);
                                    setShowHlsQualityMenu(false);
                                  }}
                                  className={`quality-selector__option${i === selectedHlsQualityIdx ? " quality-selector__option--active" : ""}`}
                                >
                                  {i === selectedHlsQualityIdx ? "✓ " : "  "}
                                  {q.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                    <button
                      onClick={() => setShowStreamEmbed(false)}
                      className="stream-embed-close"
                      title="Hide stream embed"
                    >
                      <FaTimes size={15} />
                    </button>
                  </div>
                </div>
                <div
                  ref={embedRef}
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    backgroundColor: "#0a0a0a",
                    position: "relative",
                  }}
                >
                  {playerType === "youtube" ? (
                    youtubeStreamVideoId ? (
                      <iframe
                        width="100%"
                        height="100%"
                        src={`https://www.youtube.com/embed/${youtubeStreamVideoId}?autoplay=1`}
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        title="YouTube Stream"
                        style={{ border: "none" }}
                      />
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          height: "100%",
                          color: "#999",
                          fontSize: "13px",
                        }}
                      >
                        No YouTube live stream found for this channel
                      </div>
                    )
                  ) : (
                    <StreamEmbed
                      channelName={selectedTwitchChannelName}
                      playerType={playerType as "embed" | "m3u8"}
                      twitchConnected={!!sessions.twitch}
                      onTwitchLogin={handleTwitchLogin}
                      twitchAccessToken={sessions.twitch?.accessToken}
                      onQualitiesLoaded={setHlsQualities}
                      externalSelectedQualityIdx={selectedHlsQualityIdx}
                      placeholderThumbnailUrl={streamTransition?.thumbnailUrl}
                      onPlaceholderFadeOut={() => setStreamTransition(null)}
                    />
                  )}
                </div>
              </div>
            )}
            {showStreamEmbed && (
              <div
                data-resizer
                style={{
                  width: "4px",
                  backgroundColor: "#1a1a1a",
                  cursor: "col-resize",
                  userSelect: "none",
                  transition: isDragging ? "none" : "background-color 0.2s",
                }}
                onMouseDown={() => setIsDragging(true)}
                onMouseEnter={(e) =>
                  !isDragging &&
                  (e.currentTarget.style.backgroundColor = "#6366f1")
                }
                onMouseLeave={(e) =>
                  !isDragging &&
                  (e.currentTarget.style.backgroundColor = "#1a1a1a")
                }
                title="Drag to resize"
              />
            )}
            <div
              data-chat-section
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0",
                overflow: "hidden",
                minHeight: "0",
              }}
            >
              <ChatApp
                twitchConnected={!!sessions.twitch}
                selectedTwitchChannel={selectedTwitchChannel}
                selectedTwitchChannelName={selectedTwitchChannelName}
                selectedTwitchChannelDisplayName={
                  selectedTwitchChannelDisplayName
                }
                twitchSession={sessions.twitch}
                onToggleSidebar={() => setLeftColumnVisible(!leftColumnVisible)}
                sidebarVisible={leftColumnVisible}
                showStreamEmbed={showStreamEmbed}
                onToggleStreamEmbed={() => setShowStreamEmbed(!showStreamEmbed)}
                viewerCount={viewerCount}
                linkedYoutubeUrl={linkedYoutubeUrl || undefined}
                youtubeSession={sessions.youtube}
                unifyChatEnabled={unifyChatEnabled}
                useYoutubeEmbed={useYoutubeEmbed}
                fontSize={fontSize}
                chatFont={chatFont}
                mentionSoundEnabled={mentionSoundEnabled}
                mentionVolume={mentionVolume}
                mentionSoundType={mentionSoundType}
                showDeletedMessages={showDeletedMessages}
                compactActions={compactActions}
                splitChatEnabled={splitChatEnabled}
                chatTheme={chatTheme}
                hideViewerCount={shouldHideViewerCount}
                disableModModeByDefault={disableModModeByDefault}
                eventSounds={eventSounds}
                eventSoundVolume={eventSoundVolume}
                ignoredUsers={ignoredUsers}
                onFollowRaid={(channelLogin) => setChannelData(channelLogin)}
              />
            </div>
          </>
        )}
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
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            cursor: "col-resize",
            background: "transparent",
            userSelect: "none",
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

      {/* Stream transition animation overlay */}
      {streamTransition && selectedTwitchChannel && (
        <StreamTransitionOverlay
          transitionInfo={streamTransition}
          targetRef={embedRef}
          onAnimationComplete={() => setStreamTransition(null)}
        />
      )}
    </div>
  );
}
