// Emote sources: 7TV, BTTV, FFZ
import DOMPurify, { type Config as DOMPurifyConfig } from "dompurify";

/**
 * DOMPurify configuration — only the elements and attributes our emote
 * renderer ever emits are permitted. Everything else is stripped.
 */
const DOMPURIFY_CONFIG: DOMPurifyConfig = {
  ALLOWED_TAGS: ["img", "a", "strong", "span"],
  ALLOWED_ATTR: [
    // <img>
    "src", "alt", "title", "class", "style", "loading",
    "data-emote-name", "data-tooltip-url",
    // <a>
    "href", "target", "rel",
  ],
  ALLOW_DATA_ATTR: false,
  FORCE_BODY: false,
};

const EMOTE_SIZE = "2";
const CACHE_DURATION_DAYS = 7;
const MS_PER_DAY = 1000 * 60 * 60 * 24;
const CACHE_DURATION = CACHE_DURATION_DAYS * MS_PER_DAY;

/** URL prefix that marks a 7TV emote as zero-width (overlay). */
const ZW_EMOTE_PREFIX = 'ZW:';
/** 7TV emote flag bit for zero-width/overlay emotes (1 << 8 = 256). */
const ZERO_WIDTH_FLAG = 1 << 8;

/** Returns true if the stored emote URL carries the zero-width marker. */
function isZeroWidthUrl(url: string): boolean {
  return url.startsWith(ZW_EMOTE_PREFIX);
}

/** Strips the zero-width prefix from a stored URL, returning the real CDN URL. */
function getEmoteUrl(url: string): string {
  return url.startsWith(ZW_EMOTE_PREFIX) ? url.slice(ZW_EMOTE_PREFIX.length) : url;
}

interface EmoteMap {
  [key: string]: string;
}

interface EmoteCache {
  emotes: EmoteMap;
  timestamp: number;
}

let emotes7tv: EmoteMap = {};
let emotesBttv: EmoteMap = {};
let emotesFfz: EmoteMap = {};
let emotesTwitch: EmoteMap = {};

interface ChannelEmoteGroup {
  channelId: string;
  channelName: string;
  profileImageUrl?: string;
  emotes: EmoteMap;
}

interface ChannelGroupCache {
  groups: ChannelEmoteGroup[];
  timestamp: number;
}

let emotesTwitchGlobal: EmoteMap = {};
let emotesTwitchByChannel: ChannelEmoteGroup[] = [];

/**
 * Get cached emotes if valid
 */
function getCachedEmotes(cacheKey: string): EmoteMap | null {
  try {
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return null;

    const cacheData: EmoteCache = JSON.parse(cached);
    const isExpired = Date.now() - cacheData.timestamp > CACHE_DURATION;

    if (isExpired) {
      localStorage.removeItem(cacheKey);
      return null;
    }

    // Sanitize: drop any entry whose value is not a plain string
    // (guards against old cache formats that stored objects instead of URLs)
    const raw = cacheData.emotes;
    const clean: EmoteMap = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'string') clean[k] = v;
    }
    return clean;
  } catch {
    return null;
  }
}

/**
 * Save emotes to cache
 */
function setCachedEmotes(cacheKey: string, emotes: EmoteMap): void {
  try {
    const cacheData: EmoteCache = {
      emotes,
      timestamp: Date.now(),
    };
    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
  } catch (error) {
    console.warn("Failed to cache emotes:", error);
  }
}

/**
 * Clear all emote caches
 */
export function clearEmoteCache(): void {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("emotes_")) {
      localStorage.removeItem(key);
    }
  }

  emotes7tv = {};
  emotesBttv = {};
  emotesFfz = {};
  emotesTwitch = {};
  emotesTwitchGlobal = {};
  emotesTwitchByChannel = [];
}

/**
 * Fetch 7TV global emotes
 */
async function fetch7TVGlobalEmotes(): Promise<EmoteMap> {
  const cacheKey = "emotes_7tv_global_v2";
  const cached = getCachedEmotes(cacheKey);
  if (cached) {
    console.log('Using cached 7TV global emotes, count:', Object.keys(cached).length);
    return cached;
  }

  try {
    console.log('Fetching 7TV global emotes from 7tv.io');
    const response = await fetch("https://7tv.io/v3/emote-sets/global");
    const data = await response.json();

    const emotes: EmoteMap = {};
    if (data.emotes) {
      data.emotes.forEach((emote: any) => {
        const url = `https://cdn.7tv.app/emote/${emote.id}/${EMOTE_SIZE}x.webp`;
        const flags: number = emote.data?.flags ?? 0;
        emotes[emote.name] = (flags & ZERO_WIDTH_FLAG) ? ZW_EMOTE_PREFIX + url : url;
      });
    }
    setCachedEmotes(cacheKey, emotes);
    console.log('Fetched 7TV global emotes, count:', Object.keys(emotes).length);
    return emotes;
  } catch (error) {
    console.warn("7TV global emotes not loaded", error);
    return {};
  }
}

/**
 * Fetch 7TV emotes for a given channel
 */
async function fetch7TVEmotes(channelId: string): Promise<EmoteMap> {
  const cacheKey = `emotes_7tv_v2_${channelId}`;
  const cached = getCachedEmotes(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(`https://7tv.io/v3/users/twitch/${channelId}`);
    const data = await response.json();

    const emotes: EmoteMap = {};
    if (data.emote_set?.emotes) {
      data.emote_set.emotes.forEach((emote: any) => {
        const url = `https://cdn.7tv.app/emote/${emote.id}/${EMOTE_SIZE}x.webp`;
        const flags: number = emote.data?.flags ?? 0;
        emotes[emote.name] = (flags & ZERO_WIDTH_FLAG) ? ZW_EMOTE_PREFIX + url : url;
      });
    }
    setCachedEmotes(cacheKey, emotes);
    return emotes;
  } catch (error) {
    console.warn("7TV emotes not loaded", error);
    return {};
  }
}

/**
 * Fetch BTTV global emotes
 */
async function fetchBTTVGlobalEmotes(): Promise<EmoteMap> {
  const cacheKey = "emotes_bttv_global";
  const cached = getCachedEmotes(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(
      "https://api.betterttv.net/3/cached/emotes/global",
    );
    const data = await response.json();

    const emotes: EmoteMap = {};
    data.forEach((emote: any) => {
      emotes[emote.code] =
        `https://cdn.betterttv.net/emote/${emote.id}/${EMOTE_SIZE}x.webp`;
    });

    setCachedEmotes(cacheKey, emotes);
    return emotes;
  } catch (error) {
    console.warn("BTTV global emotes not loaded", error);
    return {};
  }
}

/**
 * Fetch BTTV emotes for a given channel
 */
async function fetchBTTVEmotes(channelId: string): Promise<EmoteMap> {
  const cacheKey = `emotes_bttv_${channelId}`;
  const cached = getCachedEmotes(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(
      `https://api.betterttv.net/3/cached/users/twitch/${channelId}`,
    );
    const data = await response.json();

    const emotes: EmoteMap = {};
    if (data.channelEmotes) {
      data.channelEmotes.forEach((emote: any) => {
        emotes[emote.code] =
          `https://cdn.betterttv.net/emote/${emote.id}/${EMOTE_SIZE}x.webp`;
      });
    }

    if (data.sharedEmotes) {
      data.sharedEmotes.forEach((emote: any) => {
        emotes[emote.code] =
          `https://cdn.betterttv.net/emote/${emote.id}/${EMOTE_SIZE}x.webp`;
      });
    }

    setCachedEmotes(cacheKey, emotes);
    return emotes;
  } catch (error) {
    console.warn("BTTV emotes not loaded", error);
    return {};
  }
}

/**
 * Fetch FFZ global emotes
 */
async function fetchFFZGlobalEmotes(): Promise<EmoteMap> {
  const cacheKey = "emotes_ffz_global";
  const cached = getCachedEmotes(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch("https://api.frankerfacez.com/v1/set/global");
    const data = await response.json();

    const emotes: EmoteMap = {};
    if (data.sets) {
      Object.values(data.sets).forEach((set: any) => {
        if (set.emoticons) {
          set.emoticons.forEach((emote: any) => {
            emotes[emote.name] =
              `https://cdn.frankerfacez.com/emote/${emote.id}/${EMOTE_SIZE}`;
          });
        }
      });
    }
    setCachedEmotes(cacheKey, emotes);
    return emotes;
  } catch (error) {
    console.warn("FFZ global emotes not loaded", error);
    return {};
  }
}

/**
 * Fetch FFZ emotes for a given channel
 */
async function fetchFFZEmotes(channelName: string): Promise<EmoteMap> {
  const cacheKey = `emotes_ffz_${channelName}`;
  const cached = getCachedEmotes(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(
      `https://api.frankerfacez.com/v1/room/${channelName}`,
    );
    const data = await response.json();

    const emotes: EmoteMap = {};
    if (data.sets) {
      const setId = data.room.set;
      if (data.sets[setId]) {
        data.sets[setId].emoticons.forEach((emote: any) => {
          emotes[emote.name] =
            `https://cdn.frankerfacez.com/emote/${emote.id}/${EMOTE_SIZE}`;
        });
      }
    }
    setCachedEmotes(cacheKey, emotes);
    return emotes;
  } catch (error) {
    console.warn("FFZ emotes not loaded", error);
    return {};
  }
}

/**
 * Fetch Twitch global emotes
 */
async function fetchTwitchGlobalEmotes(): Promise<EmoteMap> {
  const cacheKey = "emotes_twitch_global";
  const cached = getCachedEmotes(cacheKey);
  if (cached) return cached;

  try {
    // Route through server-side proxy — token comes from httpOnly cookie, not localStorage.
    const response = await fetch("/api/twitch-proxy?path=/helix/chat/emotes/global");
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
async function fetchTwitchChannelEmotes(channelId: string): Promise<EmoteMap> {
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

interface BroadcasterInfo {
  name: string;
  profileImageUrl?: string;
}

/** Module-level cache so repeated emote refreshes don't re-fetch the same IDs */
const broadcasterInfoCache = new Map<string, BroadcasterInfo>();

/**
 * Resolve Twitch user IDs to display names + profile images.
 * Uses the existing /api/user-info endpoint, 10 requests in parallel at a time.
 */
async function fetchBroadcasterInfo(
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
          const response = await fetch(`/api/user-info?userId=${encodeURIComponent(id)}`);
          if (!response.ok) return;
          const user = await response.json();
          const name = user?.displayName || user?.display_name || user?.login;
          if (name) {
            const info: BroadcasterInfo = {
              name,
              profileImageUrl: user?.profileImageUrl || user?.profile_image_url,
            };
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
async function fetchUserEmotesByChannel(
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
          const format = emote.format?.includes("animated") ? "animated" : "static";
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

/**
 * Initialize emotes for a given channel
 */
export async function initializeEmotes(
  channelId: string,
  channelName: string,
  userId?: string,
): Promise<void> {
  const [stv7Global, stv7Channel, bttvGlobal, bttvChannel, ffzGlobal, ffzChannel, twitchGlobal, twitchChannel] =
    await Promise.all([
      fetch7TVGlobalEmotes(),
      fetch7TVEmotes(channelId),
      fetchBTTVGlobalEmotes(),
      fetchBTTVEmotes(channelId),
      fetchFFZGlobalEmotes(),
      fetchFFZEmotes(channelName),
      fetchTwitchGlobalEmotes(),
      fetchTwitchChannelEmotes(channelId),
    ]);

  emotes7tv = { ...stv7Global, ...stv7Channel };
  emotesBttv = { ...bttvGlobal, ...bttvChannel };
  emotesFfz = { ...ffzGlobal, ...ffzChannel };

  emotesTwitchGlobal = twitchGlobal;

  // Merge global + current channel into the flat map used for message parsing
  emotesTwitch = { ...twitchGlobal, ...twitchChannel };

  if (userId) {
    const channelGroups = await fetchUserEmotesByChannel(userId);
    emotesTwitchByChannel = channelGroups;
    // Merge all subscription channel emotes into the parsing map
    for (const group of channelGroups) {
      Object.assign(emotesTwitch, group.emotes);
    }
  } else {
    emotesTwitchByChannel = [];
  }

  // Dispatch a custom event to notify listeners that emotes have been reloaded
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event('emotes-reloaded'));
  }
}

/**
 * Create an optimized emote image HTML tag
 */
function replaceSize(url: string): string {
  const parts = url.split("/");
  // Replace the first number in the last part with '4'
  // This works for: 1x.webp -> 4x.webp, 1.0 -> 4.0, 2 -> 4, etc.

  if (url.includes('betterttv')) {
    parts[parts.length - 1] = parts[parts.length - 1].replace(/\d+/, "3");
  } else {
    parts[parts.length - 1] = parts[parts.length - 1].replace(/\d+/, "4");
  }
  return parts.join("/");
}
function createEmoteImg(emoteUrl: string, emoteName: string): string {
  if (typeof emoteUrl !== 'string') return escapeHtml(emoteName);
  // Convert any quality URL to 4x quality for tooltip (highest resolution)
  let highQualityUrl = emoteUrl;
  const splitedUrlSize = emoteUrl.split("/").pop();
  if (
    splitedUrlSize &&
    (splitedUrlSize.includes("2") || splitedUrlSize.includes("1"))
  ) {
    highQualityUrl = replaceSize(emoteUrl);
  }
  return `<img src="${emoteUrl}" alt="${escapeHtml(emoteName)}" title="${escapeHtml(emoteName)}" data-tooltip-url="${highQualityUrl}" data-emote-name="${escapeHtml(emoteName)}" class="chat-emote" style="height: 2em; vertical-align: middle; margin: 0 2px; cursor: pointer;" loading="lazy" />`;
}

/**
 * Create an overlay (zero-width) emote wrapped in a positioning span.
 * The span is absolutely centred over the base emote by CSS.
 */
function createZeroWidthEmoteImg(emoteUrl: string, emoteName: string): string {
  if (typeof emoteUrl !== 'string') return escapeHtml(emoteName);
  let highQualityUrl = emoteUrl;
  const splitedUrlSize = emoteUrl.split("/").pop();
  if (
    splitedUrlSize &&
    (splitedUrlSize.includes("2") || splitedUrlSize.includes("1"))
  ) {
    highQualityUrl = replaceSize(emoteUrl);
  }
  return `<span class="emote-overlay"><img src="${emoteUrl}" alt="${escapeHtml(emoteName)}" title="${escapeHtml(emoteName)}" data-tooltip-url="${highQualityUrl}" data-emote-name="${escapeHtml(emoteName)}" class="chat-emote" style="height: 2em; cursor: pointer;" loading="lazy" /></span>`;
}

/**
 * Parse message text and replace emote codes with HTML image tags
 * @param text - The message text
 * @param twitchEmotes - Twitch emote data from message tags (emoteId -> positions array)
 */
export function parseMessageWithEmotes(
  text: string,
  twitchEmotes?: Record<string, string[]>,
): string {
  let raw: string;

  if (twitchEmotes && Object.keys(twitchEmotes).length > 0) {
    const replacements: Array<{ start: number; end: number; html: string }> =
      [];

    Object.entries(twitchEmotes).forEach(([emoteId, positions]) => {
      positions.forEach((pos) => {
        const [start, end] = pos.split("-").map(Number);
        const emoteName = text.substring(start, end + 1);
        const emoteUrl = `https://static-cdn.jtvnw.net/emoticons/v2/${emoteId}/default/dark/2.0`;
        replacements.push({
          start,
          end: end + 1,
          html: createEmoteImg(emoteUrl, emoteName),
        });
      });
    });

    replacements.sort((a, b) => b.start - a.start);

    let result = text;
    replacements.forEach(({ start, end, html }) => {
      result = result.substring(0, start) + html + result.substring(end);
    });

    raw = parseThirdPartyEmotes(result);
  } else {
    raw = parseThirdPartyEmotes(text);
  }

  // Final sanitization pass — strip anything outside the known-safe allowlist.
  // This is the last line of defence against XSS from malformed emote names,
  // crafted CDN responses, or future changes to the HTML-building helpers.
  return DOMPurify.sanitize(raw, DOMPURIFY_CONFIG) as unknown as string;
}

/**
 * Parse third-party emotes and @mentions in text
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Check if a word is a URL and convert to clickable link
 */
function linkifyUrl(word: string): string {
  // Only match http(s) or www-prefixed URLs
  const urlPattern = /^(https?:\/\/|www\.)[^\s]+$/i;

  if (urlPattern.test(word)) {
    let url = word;
    if (word.toLowerCase().startsWith("www.")) {
      url = "https://" + word;
    }

    // Explicitly block dangerous schemes even if the regex above is ever relaxed.
    // URL objects normalise the protocol to lowercase, making detection reliable.
    try {
      const parsed = new URL(url);
      const scheme = parsed.protocol; // e.g. "javascript:", "data:", "https:"
      if (scheme !== "https:" && scheme !== "http:") {
        return escapeHtml(word); // render as plain text
      }
    } catch {
      return escapeHtml(word); // invalid URL — render as plain text
    }

    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="color: #6366f1; text-decoration: underline; cursor: pointer;">${escapeHtml(word)}</a>`;
  }

  return "";
}

/**
 * Parse third-party emotes and @mentions in text
 */
function parseThirdPartyEmotes(text: string): string {
  // Split by HTML tags to avoid breaking emote img tags
  // We use a capture group so the delimiter (img tag) is included in the result array
  const parts = text.split(/(<img[^>]*>)/);

  const parsedParts = parts.map((part) => {
    // Skip if it's already an HTML tag (our emote)
    if (part.startsWith("<img")) {
      return part;
    }

    // Process words with a while-loop so we can do lookahead for 7TV zero-width
    // (overlay) emotes that must be grouped with the preceding base emote.
    const words = part.split(" ");
    const output: string[] = [];
    let i = 0;
    while (i < words.length) {
      const word = words[i];

      // Check for URLs first
      const linkified = linkifyUrl(word);
      if (linkified) {
        output.push(linkified);
        i++;
        continue;
      }

      // Check for @mention
      if (word.startsWith("@")) {
        output.push(`<strong>${escapeHtml(word)}</strong>`);
        i++;
        continue;
      }

      // Check Twitch native emotes (from cache map, manually typed)
      if (emotesTwitch[word]) {
        output.push(createEmoteImg(emotesTwitch[word], word));
        i++;
        continue;
      }

      // Check 7TV — with zero-width overlay support
      if (emotes7tv[word]) {
        const url = emotes7tv[word];
        if (isZeroWidthUrl(url)) {
          // Orphan zero-width emote (no preceding base) — render normally
          output.push(createEmoteImg(getEmoteUrl(url), word));
          i++;
        } else {
          // Regular 7TV emote: look ahead for consecutive zero-width emotes
          const baseHtml = createEmoteImg(url, word);
          const overlays: string[] = [];
          let j = i + 1;
          while (j < words.length) {
            const nextWord = words[j];
            const nextUrl = emotes7tv[nextWord];
            if (nextUrl && isZeroWidthUrl(nextUrl)) {
              overlays.push(createZeroWidthEmoteImg(getEmoteUrl(nextUrl), nextWord));
              j++;
            } else {
              break;
            }
          }
          if (overlays.length > 0) {
            output.push(
              `<span class="emote-overlay-container">${baseHtml}${overlays.join("")}</span>`
            );
            i = j; // skip consumed zero-width words
          } else {
            output.push(baseHtml);
            i++;
          }
        }
        continue;
      }

      // Check BTTV
      if (emotesBttv[word]) {
        output.push(createEmoteImg(emotesBttv[word], word));
        i++;
        continue;
      }

      // Check FFZ
      if (emotesFfz[word]) {
        output.push(createEmoteImg(emotesFfz[word], word));
        i++;
        continue;
      }

      // Plain text
      output.push(escapeHtml(word));
      i++;
    }

    return output.join(" ");
  });

  return parsedParts.join("");
}

/**
 * Search for emotes matching a query
 */
export function searchEmotes(
  query: string,
  limit: number = 10,
): Array<{ name: string; url: string; source: string }> {
  if (!query) return [];

  const results: Array<{ name: string; url: string; source: string }> = [];
  const lowerQuery = query.toLowerCase();

  // Debug: Show first 5 Twitch emote names

  // Search Twitch emotes (includes global, channel, and user's subscriptions)
  Object.entries(emotesTwitch).forEach(([name, url]) => {
    if (name.toLowerCase().includes(lowerQuery) && !isEmoteDisabled(name)) {
      results.push({ name, url, source: "Twitch" });
    }
  });

  // Search 7TV emotes
  Object.entries(emotes7tv).forEach(([name, url]) => {
    if (name.toLowerCase().includes(lowerQuery) && !isEmoteDisabled(name)) {
      results.push({ name, url: getEmoteUrl(url), source: "7TV" });
    }
  });

  // Search BTTV emotes
  Object.entries(emotesBttv).forEach(([name, url]) => {
    if (name.toLowerCase().includes(lowerQuery) && !isEmoteDisabled(name)) {
      results.push({ name, url, source: "BTTV" });
    }
  });

  // Search FFZ emotes
  Object.entries(emotesFfz).forEach(([name, url]) => {
    if (name.toLowerCase().includes(lowerQuery) && !isEmoteDisabled(name)) {
      results.push({ name, url, source: "FFZ" });
    }
  });

  // Sort by relevance (exact match first, then starts with, then contains)
  results.sort((a, b) => {
    const aLower = a.name.toLowerCase();
    const bLower = b.name.toLowerCase();

    if (aLower === lowerQuery) return -1;
    if (bLower === lowerQuery) return 1;
    if (aLower.startsWith(lowerQuery) && !bLower.startsWith(lowerQuery))
      return -1;
    if (bLower.startsWith(lowerQuery) && !aLower.startsWith(lowerQuery))
      return 1;

    return a.name.localeCompare(b.name);
  });

  const finalResults = results.slice(0, limit);

  return finalResults;
}

/**
 * Disabled emotes management (stored in localStorage as array of names)
 */
const DISABLED_EMOTES_KEY = 'disabled_emotes_v1';

export function getDisabledEmotes(): Set<string> {
  try {
    const raw = localStorage.getItem(DISABLED_EMOTES_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

export function isEmoteDisabled(name: string): boolean {
  return getDisabledEmotes().has(name);
}

export function toggleDisableEmote(name: string): void {
  try {
    const set = getDisabledEmotes();
    if (set.has(name)) set.delete(name);
    else set.add(name);
    localStorage.setItem(DISABLED_EMOTES_KEY, JSON.stringify(Array.from(set)));

    // Notify listeners (reuse emotes-reloaded so UI refreshes emote lists and autocomplete)
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new Event('emotes-reloaded'));
    }
  } catch (e) {
    console.warn('Failed to toggle emote disabled state', e);
  }
}

/**
 * Get all emotes organized by source
 */
export interface TwitchChannelEmotes {
  channelId: string;
  channelName: string;
  profileImageUrl?: string;
  emotes: Array<{ name: string; url: string }>;
}

export interface EmotesBySource {
  twitchGlobal: Array<{ name: string; url: string }>;
  twitchChannels: TwitchChannelEmotes[];
  "7tv": Array<{ name: string; url: string }>;
  bttv: Array<{ name: string; url: string }>;
  ffz: Array<{ name: string; url: string }>;
}

export function getAllEmotesOrganized(): EmotesBySource {
  const organized: EmotesBySource = {
    twitchGlobal: Object.entries(emotesTwitchGlobal)
      .map(([name, url]) => ({ name, url }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    twitchChannels: emotesTwitchByChannel.map((group) => ({
      channelId: group.channelId,
      channelName: group.channelName,
      profileImageUrl: group.profileImageUrl,
      emotes: Object.entries(group.emotes)
        .map(([name, url]) => ({ name, url }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    })),
    "7tv": Object.entries(emotes7tv)
      .map(([name, url]) => ({ name, url: getEmoteUrl(url) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    bttv: Object.entries(emotesBttv)
      .map(([name, url]) => ({ name, url }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    ffz: Object.entries(emotesFfz)
      .map(([name, url]) => ({ name, url }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };

  console.log("Emotes organized:", {
    twitchGlobal: organized.twitchGlobal.length,
    twitchChannels: organized.twitchChannels.length,
    "7tv": organized["7tv"].length,
    bttv: organized.bttv.length,
    ffz: organized.ffz.length,
  });

  return organized;
}
