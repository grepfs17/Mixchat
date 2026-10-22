import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlatformSession } from "../../lib/types";
import { getAllFollowedChannels } from "../../lib/twitch";
import type { TwitchChannel } from "../../components/AppContainer";
import type { StreamTransitionInfo } from "../../components/StreamGrid";

const FAVORITES_KEY = "mixchat_favorite_channels:v1";
const CHANNEL_REFRESH_MS = 120000;

export type UseTwitchChannelsOptions = {
  session: PlatformSession | undefined;
  /** True while the auth restore is still reading from localStorage. The hook
   * defers its URL-restore fallback until auth loading finishes so it doesn't
   * race the channel fetch. */
  isInitialAuthLoading: boolean;
  onSessionInvalid: () => void;
  onStreamTransition?: (info: StreamTransitionInfo) => void;
};

export type UseTwitchChannelsResult = {
  twitchChannels: TwitchChannel[];
  allTwitchChannels: TwitchChannel[];
  sortedChannels: TwitchChannel[];
  selectedTwitchChannel: string;
  selectedTwitchChannelName: string;
  selectedTwitchChannelDisplayName: string;
  channelsLoading: boolean;
  /** True once the followed-channel fetch for the current account settles.
   * Gates the initial app render so the loading screen can report real
   * progress instead of disappearing before the channel list arrives. */
  channelsReady: boolean;
  favoriteChannels: string[];
  setChannelData: (
    channelId: string,
    transitionInfo?: StreamTransitionInfo,
  ) => void;
  toggleFavorite: (channelId: string) => void;
  /** Clears channel selection without touching loading state or channel list. */
  clearSelection: () => void;
  /** Clears all channel/selection state. Call this on Twitch logout. */
  reset: () => void;
};

export function useTwitchChannels(
  options: UseTwitchChannelsOptions,
): UseTwitchChannelsResult {
  const {
    session,
    isInitialAuthLoading,
    onSessionInvalid,
    onStreamTransition,
  } = options;

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
  const [channelsReady, setChannelsReady] = useState(false);
  const [favoriteChannels, setFavoriteChannels] = useState<string[]>([]);
  const loadedForUserRef = useRef<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(FAVORITES_KEY);
    if (saved) {
      try {
        setFavoriteChannels(JSON.parse(saved));
      } catch (error) {
        console.error("Failed to load favorite channels:", error);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favoriteChannels));
  }, [favoriteChannels]);

  // Fetch followed channels whenever the Twitch session changes. Refresh on
  // a 2-minute interval. A 401 here means the token-refresh cycle gave up.
  // Surface that to the auth hook so it can clear state.
  useEffect(() => {
    let cancelled = false;

    // No token yet: the auth hook is still restoring or refreshing. Keep the
    // initial loading state untouched so the loading screen stays accurate.
    if (!session || !session.accessToken) {
      return;
    }

    const userId = session.userId ?? "";
    const isNewAccount = loadedForUserRef.current !== userId;
    if (isNewAccount) {
      setChannelsLoading(true);
      setChannelsReady(false);
    }

    const fetchChannels = async () => {
      try {
        const allChannels = await getAllFollowedChannels(
          session.accessToken,
          import.meta.env.PUBLIC_TWITCH_CLIENT_ID,
          session.userId,
        );
        if (cancelled) return;
        setAllTwitchChannels(allChannels);
        setTwitchChannels(allChannels.filter((ch) => ch.viewerCount > 0));
        setHasLoadedChannel(false);
        loadedForUserRef.current = userId;
      } catch (error) {
        console.error("Failed to fetch Twitch channels:", error);
        if (error instanceof Error && error.message.includes("401")) {
          console.log("Received 401 error, clearing session...");
          onSessionInvalid();
        }
      } finally {
        if (!cancelled) {
          setChannelsLoading(false);
          // Let the app render even if the fetch failed, the home view and
          // sidebar handle an empty channel list gracefully.
          setChannelsReady(true);
        }
      }
    };

    fetchChannels();
    const interval = setInterval(fetchChannels, CHANNEL_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [session, onSessionInvalid]);

  const setChannelData = useCallback(
    (channelId: string, transitionInfo?: StreamTransitionInfo) => {
      // Search by numeric ID first, then by login name, across online and all
      // channels. Fall back to the session for the viewer's own channel.
      const channel =
        twitchChannels.find((ch) => ch.id === channelId) ||
        allTwitchChannels.find((ch) => ch.id === channelId) ||
        twitchChannels.find((ch) => ch.name === channelId) ||
        allTwitchChannels.find((ch) => ch.name === channelId);

      // Use the resolved numeric ID so 7TV/BTTV/Twitch APIs receive the
      // correct value.
      const resolvedId = channel?.id || channelId;

      const ownSession = session;
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
        onStreamTransition?.(transitionInfo);
      }

      window.history.pushState({}, "", `/channel/${channelName}`);
    },
    [twitchChannels, allTwitchChannels, session, onStreamTransition],
  );

  // Restore the channel from the /channel/<name> URL path. Waits for the
  // channel list to populate, and only treats the URL as authoritative (when
  // the channel isn't in the followed list) after the initial auth load has
  // finished. Otherwise a deep-link to an unfollowed channel would race the
  // login-state fetch and could clobber a valid selection.
  useEffect(() => {
    const match = window.location.pathname.match(/^\/channel\/([^\/]+)$/);
    const channelParam = match ? decodeURIComponent(match[1]) : null;

    if (channelParam && !hasLoadedChannel) {
      const foundChannel =
        twitchChannels.find((ch) => ch.name === channelParam) ||
        allTwitchChannels.find((ch) => ch.name === channelParam);

      if (foundChannel) {
        setChannelData(foundChannel.id);
        setHasLoadedChannel(true);
      } else if (!isInitialAuthLoading) {
        setChannelData(channelParam);
        setHasLoadedChannel(true);
      }
    }
  // Resolve channel data when channel changes. Intentional
  // eslint-disable-next-line no-adjust-state-on-prop-change
  }, [
    twitchChannels,
    allTwitchChannels,
    hasLoadedChannel,
    isInitialAuthLoading,
    setChannelData,
  ]);

  const toggleFavorite = useCallback((channelId: string) => {
    setFavoriteChannels((prev) =>
      prev.includes(channelId)
        ? prev.filter((id) => id !== channelId)
        : [...prev, channelId],
    );
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedTwitchChannel("");
    setSelectedTwitchChannelName("");
    setSelectedTwitchChannelDisplayName("");
    setHasLoadedChannel(false);
  }, []);

  const reset = useCallback(() => {
    setTwitchChannels([]);
    setAllTwitchChannels([]);
    setSelectedTwitchChannel("");
    setSelectedTwitchChannelName("");
    setSelectedTwitchChannelDisplayName("");
    setHasLoadedChannel(false);
    setChannelsLoading(true);
    setChannelsReady(false);
    loadedForUserRef.current = null;
    setFavoriteChannels([]);
  }, []);

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

  return {
    twitchChannels,
    allTwitchChannels,
    sortedChannels,
    selectedTwitchChannel,
    selectedTwitchChannelName,
    selectedTwitchChannelDisplayName,
    channelsLoading,
    channelsReady,
    favoriteChannels,
    setChannelData,
    toggleFavorite,
    clearSelection,
    reset,
  };
}
