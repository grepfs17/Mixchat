import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlatformSession } from "../../lib/types";
import {
  getYoutubeLinkForChannel,
  getYoutubeLinks,
} from "../../lib/youtubeLinks";

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

  const [linkedYoutubeUrl, setLinkedYoutubeUrl] = useState<string | null>(null);
  // Version counter that the YouTubeLinker modal bumps after creating/deleting
  // links so the lookup effect re-runs without us having to expose the
  // underlying storage.
  const [ytLinksVersion, setYtLinksVersion] = useState(0);
  const [youtubeStreamVideoId, setYoutubeStreamVideoId] = useState<
    string | null
  >(null);

  // Look up the linked YouTube URL for the selected Twitch channel. Falls
  // back to the viewer's own YouTube channel if they're watching themselves.
  useEffect(() => {
    if (selectedTwitchChannel) {
      const storedLink = getYoutubeLinkForChannel(selectedTwitchChannel);
      if (storedLink) {
        setLinkedYoutubeUrl(storedLink);
      } else if (
        youtubeSession &&
        twitchSession &&
        (selectedTwitchChannel === twitchSession.userId ||
          selectedTwitchChannel === twitchSession.username)
      ) {
        setLinkedYoutubeUrl(
          `https://www.youtube.com/channel/${youtubeSession.userId}`,
        );
      } else {
        setLinkedYoutubeUrl(null);
      }
    } else {
      setLinkedYoutubeUrl(null);
    }
  }, [selectedTwitchChannel, ytLinksVersion, youtubeSession, twitchSession]);

  // Resolve the live video ID for the linked YouTube URL. Direct video URLs
  // parse synchronously; channel URLs go through the proxy on a 10-minute
  // refresh (the stream may rotate in/out of "live" while the user watches).
  useEffect(() => {
    if (!linkedYoutubeUrl) {
      setYoutubeStreamVideoId(null);
      return;
    }

    const directId = parseDirectVideoId(linkedYoutubeUrl);
    if (directId) {
      setYoutubeStreamVideoId(directId);
      return;
    }

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
    const interval = setInterval(fetchId, YT_VIDEO_ID_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [linkedYoutubeUrl]);

  const linkedYoutubeChannelIds = useMemo(
    () => getYoutubeLinks().map((l) => l.twitchChannelId),
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
