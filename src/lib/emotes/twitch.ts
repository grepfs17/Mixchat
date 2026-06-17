import type {
  EmoteMap,
  BroadcasterInfo,
  ChannelEmoteGroup,
  ChannelGroupCache,
} from "./types";
import { getCachedEmotes, setCachedEmotes, CACHE_DURATION } from "./state";

/**
 * Fetch Twitch global emotes
 */
export async function fetchTwitchGlobalEmotes(): Promise<EmoteMap> {
  const cacheKey = "emotes_twitch_global";
  const cached = getCachedEmotes(cacheKey);
  if (cached) return cached;

  try {
    // Route through server-side proxy — token comes from httpOnly cookie, not localStorage.
    const response = await fetch(
      "/api/twitch-proxy?path=/helix/chat/emotes/global",
    );
    const data = await response.json();

    const emotes: EmoteMap = {};
    if (data.data) {
      data.data.forEach((emote: any) => {
        const url = emote.images.url_1x.replace("/1.0", "/2.0");
        emotes[emote.name] = url;
      });
    }
    setCachedEmotes(cacheKey, emotes);
    return emotes;
  } catch (error) {
    console.warn("Twitch global emotes not loaded", error);
    return {};
  }
}

/**
 * Fetch Twitch channel emotes
 */
export async function fetchTwitchChannelEmotes(
  channelId: string,
): Promise<EmoteMap> {
  const cacheKey = `emotes_twitch_channel_${channelId}`;
  const cached = getCachedEmotes(cacheKey);
  if (cached) return cached;

  try {
    // Route through server-side proxy — token comes from httpOnly cookie, not localStorage.
    const response = await fetch(
      `/api/twitch-proxy?path=/helix/chat/emotes&broadcaster_id=${encodeURIComponent(channelId)}`,
    );
    const data = await response.json();

    const emotes: EmoteMap = {};
    if (data.data) {
      data.data.forEach((emote: any) => {
        const url = emote.images.url_1x.replace("/1.0", "/2.0");
        emotes[emote.name] = url;
      });
    }
    setCachedEmotes(cacheKey, emotes);
    return emotes;
  } catch (error) {
    console.warn("Twitch channel emotes not loaded", error);
    return {};
  }
}

/** Module-level cache so repeated emote refreshes don't re-fetch the same IDs */
const broadcasterInfoCache = new Map<string, BroadcasterInfo>();
const MAX_BROADCASTER_CACHE = 200;

/**
 * Resolve Twitch user IDs to display names + profile images.
 * Uses the existing /api/user-info endpoint, 10 requests in parallel at a time.
 */
export async function fetchBroadcasterInfo(
  ownerIds: string[],
): Promise<Record<string, BroadcasterInfo>> {
  if (ownerIds.length === 0) return {};
  const map: Record<string, BroadcasterInfo> = {};

  const uncachedIds: string[] = [];
  for (const id of ownerIds) {
    const cached = broadcasterInfoCache.get(id);
    if (cached) {
      map[id] = cached;
    } else {
      uncachedIds.push(id);
    }
  }

  if (uncachedIds.length === 0) return map;

  const CONCURRENCY = 10;
  for (let i = 0; i < uncachedIds.length; i += CONCURRENCY) {
    const batch = uncachedIds.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (id) => {
        try {
          const response = await fetch(
            `/api/user-info?userId=${encodeURIComponent(id)}`,
          );
          if (!response.ok) return;
          const user = await response.json();
          const name = user?.displayName || user?.display_name || user?.login;
          if (name) {
            const info: BroadcasterInfo = {
              name,
              profileImageUrl: user?.profileImageUrl || user?.profile_image_url,
            };
            if (broadcasterInfoCache.size >= MAX_BROADCASTER_CACHE) {
              const firstKey = broadcasterInfoCache.keys().next().value;
              if (firstKey !== undefined) broadcasterInfoCache.delete(firstKey);
            }
            broadcasterInfoCache.set(id, info);
            map[String(id)] = info;
          }
        } catch {
          // skip unresolvable IDs
        }
      }),
    );
  }

  return map;
}

/**
 * Fetch user's available emote sets grouped by channel (includes subscriptions)
 */
export async function fetchUserEmotesByChannel(
  userId: string,
): Promise<ChannelEmoteGroup[]> {
  const cacheKey = `emotes_twitch_user_channels_v6_${userId}`;

  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const cacheData: ChannelGroupCache = JSON.parse(cached);
      if (Date.now() - cacheData.timestamp <= CACHE_DURATION) {
        console.log(
          "Using cached user channel emotes, groups:",
          cacheData.groups.length,
        );
        return cacheData.groups;
      }
      localStorage.removeItem(cacheKey);
    }
  } catch {
    // ignore cache errors
  }

  try {
    // Collect raw emote data with owner_id
    const rawEmotes: Array<{ name: string; url: string; ownerId: string }> = [];
    let cursor: string | null = null;

    do {
      const proxyPath = cursor
        ? `/api/twitch-proxy?path=/helix/chat/emotes/user&user_id=${encodeURIComponent(userId)}&after=${encodeURIComponent(cursor)}`
        : `/api/twitch-proxy?path=/helix/chat/emotes/user&user_id=${encodeURIComponent(userId)}`;

      const apiResponse: Response = await fetch(proxyPath);
      if (!apiResponse.ok) {
        console.error(
          "Failed to fetch user emotes:",
          apiResponse.status,
          apiResponse.statusText,
        );
        break;
      }

      const pageData: any = await apiResponse.json();
      if (pageData.data) {
        pageData.data.forEach((emote: any) => {
          if (!emote.owner_id) return;
          const format = emote.format?.includes("animated")
            ? "animated"
            : "static";
          const url = `https://static-cdn.jtvnw.net/emoticons/v2/${emote.id}/${format}/dark/2.0`;
          rawEmotes.push({ name: emote.name, url, ownerId: emote.owner_id });
        });
      }

      cursor = pageData.pagination?.cursor || null;
    } while (cursor);

    // Group by owner_id
    const groupMap = new Map<string, EmoteMap>();
    for (const emote of rawEmotes) {
      if (!groupMap.has(emote.ownerId)) {
        groupMap.set(emote.ownerId, {});
      }
      groupMap.get(emote.ownerId)![emote.name] = emote.url;
    }

    // Resolve owner IDs → display names + profile images
    const ownerIds = Array.from(groupMap.keys());
    const infoMap = await fetchBroadcasterInfo(ownerIds);

    // Build sorted channel groups
    const groups: ChannelEmoteGroup[] = [];
    for (const [channelId, emotes] of groupMap.entries()) {
      const info = infoMap[channelId];
      groups.push({
        channelId,
        channelName: info?.name || channelId,
        profileImageUrl: info?.profileImageUrl,
        emotes,
      });
    }
    groups.sort((a, b) => a.channelName.localeCompare(b.channelName));

    try {
      const cacheData: ChannelGroupCache = { groups, timestamp: Date.now() };
      localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    } catch {
      // ignore storage errors
    }

    console.log(
      "Fetched user channel emote groups:",
      groups.length,
      "groups,",
      rawEmotes.length,
      "emotes",
    );
    return groups;
  } catch (error) {
    console.error("Failed to fetch user emotes by channel:", error);
    return [];
  }
}
