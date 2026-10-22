import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlatformSession } from "../../lib/types";
import {
  getYoutubeLinkForChannel,
  getYoutubeLinks,
} from "../../lib/youtubeLinks";
import { IS_TWITCH_ONLY } from "../../lib/constants";

const YT_VIDEO_ID_REFRESH_MS = 600000; // 10 minutes

function parseDirectVideoId(url: string): string | null {
  // Accept https://youtu.be/<id>, https://www.youtube.com/watch?v=<id>,
  // https://www.youtube.com/live/<id>, or any URL with ?v=<id>.
  try {
    if (url.includes("v=")) {
      return new URLSearchParams(new URL(url).search).get("v");
    }
  } catch {
    /* not a direct video URL */
  }
  if (url.includes("youtu.be/")) {
    return url.split("youtu.be/")[1].split("?")[0] || null;
  }
  if (url.includes("/live/")) {
    return url.split("/live/")[1].split("?")[0] || null;
  }
  return null;
}

export type UseYoutubeLinkOptions = {
  selectedTwitchChannel: string;
  twitchSession: PlatformSession | undefined;
  youtubeSession: PlatformSession | undefined;
};

export type UseYoutubeLinkResult = {
  linkedYoutubeUrl: string | null;
  youtubeStreamVideoId: string | null;
  linkedYoutubeChannelIds: string[];
  notifyLinksChanged: () => void;
};

export function useYoutubeLink(
  options: UseYoutubeLinkOptions,
): UseYoutubeLinkResult {
  const { selectedTwitchChannel, twitchSession, youtubeSession } = options;

  // Version counter that the YouTubeLinker modal bumps after creating/deleting
  // links so the derived value re-computes without us having to expose the
  // underlying storage.
  const [ytLinksVersion, setYtLinksVersion] = useState(0);
  const [youtubeStreamVideoId, setYoutubeStreamVideoId] = useState<
    string | null
  >(null);

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

  // Derive the video ID from direct URLs synchronously during render.
  // Channel URLs require an async proxy call which stays in the effect below.
  const directVideoId = useMemo(() => {
    if (!linkedYoutubeUrl) return null;
    return parseDirectVideoId(linkedYoutubeUrl);
  }, [linkedYoutubeUrl]);

  // For channel URLs, poll the proxy every 10 minutes to resolve the live
  // video ID. This is a legitimate useEffect for periodic async work.
  // Not derivable during render because it depends on a remote API.
  // eslint-disable-next-line react/no-fetch-in-effect, react/no-set-state-after-await-in-effect
  useEffect(() => {
    if (!linkedYoutubeUrl || directVideoId) {
      setYoutubeStreamVideoId(directVideoId);
      return;
    }

    let cancelled = false;
    const fetchId = async () => {
      try {
        const params = new URLSearchParams();
        params.append("action", "getLiveVideo");
        params.append("channelUrl", linkedYoutubeUrl);
    const res = await fetch(`/api/youtube-proxy?${params.toString()}`);
    if (!res.ok) return;
    const data = await res.json();
    if (!cancelled && data.videoId) {
          setYoutubeStreamVideoId(data.videoId);
        } else if (!cancelled) {
          setYoutubeStreamVideoId(null);
        }
      } catch {
        if (!cancelled) setYoutubeStreamVideoId(null);
      }
    };

    fetchId();
    const interval = setInterval(fetchId, YT_VIDEO_ID_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [linkedYoutubeUrl, directVideoId]);

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
    youtubeStreamVideoId,
    linkedYoutubeChannelIds,
    notifyLinksChanged,
  };
}
