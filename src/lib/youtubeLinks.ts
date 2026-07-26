/**
 * YouTube channel linking helpers.
 * Stores a mapping of Twitch channel ID -> YouTube channel URL in localStorage.
 */

const STORAGE_KEY = "mixchat_youtube_links:v1";

export interface YouTubeLink {
  twitchChannelId: string;
  twitchDisplayName: string;
  youtubeUrl: string;
  active?: boolean;
}

export function getYoutubeLinks(): YouTubeLink[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown[] = JSON.parse(raw);
    // Backward compat: default `active` to true for old entries
    return parsed.map((l) =>
      l && typeof l === "object" && "active" in l
        ? (l as YouTubeLink)
        : { ...(l as Omit<YouTubeLink, "active">), active: true },
    );
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

export function toggleYoutubeLinkActive(twitchChannelId: string): void {
  const links = getYoutubeLinks();
  const found = links.find((l) => l.twitchChannelId === twitchChannelId);
  if (found) {
    found.active = found.active === false ? true : false;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
  }
}

export function updateYoutubeLink(
  twitchChannelId: string,
  youtubeUrl: string,
): void {
  const links = getYoutubeLinks();
  const found = links.find((l) => l.twitchChannelId === twitchChannelId);
  if (found) {
    found.youtubeUrl = youtubeUrl;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
  }
}

export function getYoutubeLinkForChannel(
  twitchChannelId: string,
): string | null {
  const links = getYoutubeLinks();
  const found = links.find(
    (l) => l.twitchChannelId === twitchChannelId && l.active !== false,
  );
  return found?.youtubeUrl ?? null;
}
