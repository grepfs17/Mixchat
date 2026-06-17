import type { EmoteMap } from "./types";
import { getCachedEmotes, setCachedEmotes } from "./state";
import { EMOTE_SIZE, fetchWithTimeout } from "./utils";

/**
 * Fetch BTTV global emotes
 */
export async function fetchBTTVGlobalEmotes(): Promise<EmoteMap> {
  const cacheKey = "emotes_bttv_global";
  const cached = getCachedEmotes(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetchWithTimeout(
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
export async function fetchBTTVEmotes(channelId: string): Promise<EmoteMap> {
  const cacheKey = `emotes_bttv_${channelId}`;
  const cached = getCachedEmotes(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetchWithTimeout(
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
