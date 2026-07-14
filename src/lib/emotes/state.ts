import type { EmoteMap, EmoteCache, ChannelEmoteGroup } from "./types";
import {
  getEmoteCache,
  setEmoteCache,
  clearAllEmoteCaches,
} from "./emoteStorage";

const CACHE_DURATION_DAYS = 7;
const MS_PER_DAY = 1000 * 60 * 60 * 24;
export const CACHE_DURATION = CACHE_DURATION_DAYS * MS_PER_DAY;

/** 7TV connection state */
export let activeEmoteSetId: string | null = null;
export let eventSource7tv: EventSource | null = null;
export let reconnect7tvTimer: ReturnType<typeof setTimeout> | null = null;
export let reconnect7tvDelay = 5000;

/** Emote maps populated by each service. */
export let emotes7tv: EmoteMap = {};
export let emotesBttv: EmoteMap = {};
export let emotesFfz: EmoteMap = {};
export let emotesTwitch: EmoteMap = {};
export let emotesTwitchGlobal: EmoteMap = {};
export let emotesTwitchByChannel: ChannelEmoteGroup[] = [];

/** Emote author map — emote name → author display name. */
export let emoteAuthors: Record<string, string> = {};

/** Last Twitch user ID used to fetch subscribed channel emotes. */
export let lastUserId: string | undefined;

/**
 * Monotonic counter bumped every time one of the module-level emote maps is
 * reassigned. It is mixed into the parseCache key so stale entries become
 * unreachable as soon as a new source applies — no manual cache.clear() and
 * no forced re-render are needed.
 */
export let emoteMapVersion = 0;
export function bumpEmoteMapVersion(): void {
  emoteMapVersion++;
}

/** Fire the 'emotes-reloaded' DOM event for UI listeners (EmoteMenu etc.). */
export function notifyEmotesReloaded(): void {
  if (
    typeof window !== "undefined" &&
    typeof window.dispatchEvent === "function"
  ) {
    window.dispatchEvent(new Event("emotes-reloaded"));
  }
}

/** Parse result cache keyed by emote-map version + input text. */
export const parseCache = new Map<string, string>();
export const MAX_PARSE_CACHE = 500;

export function setActiveEmoteSetId(id: string | null): void {
  activeEmoteSetId = id;
}

export function setEmotes7tv(map: EmoteMap): void {
  emotes7tv = map;
}

export function setEmotesBttv(map: EmoteMap): void {
  emotesBttv = map;
}

export function setEmotesFfz(map: EmoteMap): void {
  emotesFfz = map;
}

export function setEmotesTwitch(map: EmoteMap): void {
  emotesTwitch = map;
}

export function setEmotesTwitchGlobal(map: EmoteMap): void {
  emotesTwitchGlobal = map;
}

export function setEmotesTwitchByChannel(groups: ChannelEmoteGroup[]): void {
  emotesTwitchByChannel = groups;
}

export function setEmoteAuthors(map: Record<string, string>): void {
  emoteAuthors = map;
}

export function setLastUserId(id: string | undefined): void {
  lastUserId = id;
}

export function setEventSource7tv(es: EventSource | null): void {
  eventSource7tv = es;
}

export function setReconnect7tvTimer(
  timer: ReturnType<typeof setTimeout> | null,
): void {
  reconnect7tvTimer = timer;
}

export function setReconnect7tvDelay(delay: number): void {
  reconnect7tvDelay = delay;
}

/**
 * Get cached emotes if valid
 */
export async function getCachedEmotes(
  cacheKey: string,
): Promise<EmoteMap | null> {
  try {
    const cacheData = await getEmoteCache<EmoteCache>(cacheKey);
    if (!cacheData) return null;

    const isExpired = Date.now() - cacheData.timestamp > CACHE_DURATION;
    if (isExpired) {
      // expired — will be cleaned up on next write; no need to await delete
      return null;
    }

    // Sanitize: drop any entry whose value is not a plain string
    const raw = cacheData.emotes;
    const clean: EmoteMap = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "string") clean[k] = v;
    }

    // Restore 7TV specific data if present
    if (cacheData.emoteSetId) {
      activeEmoteSetId = cacheData.emoteSetId;
    }

    return clean;
  } catch {
    return null;
  }
}

/**
 * Save emotes to cache
 */
export async function setCachedEmotes(
  cacheKey: string,
  emotes: EmoteMap,
  emoteSetId?: string,
  authors?: Record<string, string>,
): Promise<void> {
  try {
    const cacheData: EmoteCache = {
      emotes,
      timestamp: Date.now(),
      emoteSetId,
      authors,
    };
    await setEmoteCache(cacheKey, cacheData);
  } catch (error) {
    console.warn("Failed to cache emotes:", error);
  }
}

/**
 * Get cached authors for a given cache key, if valid.
 */
export async function getCachedAuthors(
  cacheKey: string,
): Promise<Record<string, string> | null> {
  try {
    const cacheData = await getEmoteCache<EmoteCache>(cacheKey);
    if (!cacheData) return null;
    if (Date.now() - cacheData.timestamp > CACHE_DURATION) return null;
    return cacheData.authors ?? null;
  } catch {
    return null;
  }
}

/**
 * Clear all emote caches
 */
async function clearEmoteCache(): Promise<void> {
  await clearAllEmoteCaches();

  emotes7tv = {};
  emotesBttv = {};
  emotesFfz = {};
  emotesTwitch = {};
  emotesTwitchGlobal = {};
  emotesTwitchByChannel = [];
  emoteAuthors = {};
  lastUserId = undefined;
  parseCache.clear();
}

/**
 * Clear emote caches from storage only (IndexedDB/localStorage).
 * In-memory maps are left intact so the UI keeps showing old emotes
 * while fresh data is fetched in the background.
 */
export async function clearEmoteCacheStorage(): Promise<void> {
  await clearAllEmoteCaches();
}
