import { useCallback, useMemo, useState } from "react";
import type { PlatformSession } from "../../lib/types";
import {
  getYoutubeLinkForChannel,
  getYoutubeLinks,
} from "../../lib/youtubeLinks";
import { IS_TWITCH_ONLY } from "../../lib/constants";

export type UseYoutubeLinkOptions = {
  selectedTwitchChannel: string;
  twitchSession: PlatformSession | undefined;
  youtubeSession: PlatformSession | undefined;
};

export type UseYoutubeLinkResult = {
  linkedYoutubeUrl: string | null;
  linkedYoutubeChannelIds: string[];
  notifyLinksChanged: () => void;
};

/**
 * Resolves the YouTube channel linked to the selected Twitch channel. Live
 * broadcast resolution lives in `useYoutubeStreams` so the chat and the embed
 * share one selection.
 */
export function useYoutubeLink(
  options: UseYoutubeLinkOptions,
): UseYoutubeLinkResult {
  const { selectedTwitchChannel, twitchSession, youtubeSession } = options;

  // Version counter that the YouTubeLinker modal bumps after creating/deleting
  // links so the derived value re-computes without us having to expose the
  // underlying storage.
  const [ytLinksVersion, setYtLinksVersion] = useState(0);

  // Derived during render (not in an effect) to avoid state updates and stale
  // closures. Falls back to the viewer's own YouTube channel if watching self.
  const linkedYoutubeUrl = useMemo(() => {
    if (!selectedTwitchChannel || IS_TWITCH_ONLY) return null;
    const storedLink = getYoutubeLinkForChannel(selectedTwitchChannel);
    if (storedLink) return storedLink;
    if (
      youtubeSession &&
      twitchSession &&
      (selectedTwitchChannel === twitchSession.userId ||
        selectedTwitchChannel === twitchSession.username)
    ) {
      return `https://www.youtube.com/channel/${youtubeSession.userId}`;
    }
    return null;
  }, [selectedTwitchChannel, ytLinksVersion, youtubeSession, twitchSession]);

  const linkedYoutubeChannelIds = useMemo(
    () =>
      IS_TWITCH_ONLY
        ? []
        : getYoutubeLinks()
            .flatMap((l) => (l.active !== false ? [l.twitchChannelId] : [])),
    [ytLinksVersion],
  );

  const notifyLinksChanged = useCallback(() => {
    setYtLinksVersion((v) => v + 1);
  }, []);

  return {
    linkedYoutubeUrl,
    linkedYoutubeChannelIds,
    notifyLinksChanged,
  };
}
