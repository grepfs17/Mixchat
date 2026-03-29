/**
 * YouTube channel linking helpers.
 * Stores a mapping of Twitch channel ID -> YouTube channel URL in localStorage.
 */

const STORAGE_KEY = "mixchat_youtube_links";

export interface YouTubeLink {
  twitchChannelId: string;
  twitchDisplayName: string;
  youtubeUrl: string;
}

export function getYoutubeLinks(): YouTubeLink[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addYoutubeLink(link: YouTubeLink): void {
  const links = getYoutubeLinks();
  // Replace if already exists for this twitch channel
  const idx = links.findIndex(
    (l) => l.twitchChannelId === link.twitchChannelId,
  );
  if (idx >= 0) {
    links[idx] = link;
  } else {
    links.push(link);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
}

export function removeYoutubeLink(twitchChannelId: string): void {
  const links = getYoutubeLinks().filter(
    (l) => l.twitchChannelId !== twitchChannelId,
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
}

export function getYoutubeLinkForChannel(
  twitchChannelId: string,
): string | null {
  const links = getYoutubeLinks();
  const found = links.find((l) => l.twitchChannelId === twitchChannelId);
  return found?.youtubeUrl ?? null;
}
