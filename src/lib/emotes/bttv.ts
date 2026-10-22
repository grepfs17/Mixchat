import type { EmoteMap } from "./types";
import { getCachedEmotes, getCachedAuthors, setCachedEmotes } from "./state";
import { EMOTE_SIZE, fetchWithTimeout } from "./utils";

/** Accumulated author data for BTTV emotes, populated during fetch. */
export const authorsBttv: Record<string, string> = {};

export async function fetchBTTVGlobalEmotes(): Promise<EmoteMap> {
  const cacheKey = "emotes_bttv_global";
  const cached = await getCachedEmotes(cacheKey);
  if (cached) {
    const cachedAuthors = await getCachedAuthors(cacheKey);
    if (cachedAuthors) Object.assign(authorsBttv, cachedAuthors);
    return cached;
  }

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

    await setCachedEmotes(cacheKey, emotes, undefined, { ...authorsBttv });
    return emotes;
  } catch (error) {
    console.warn("BTTV global emotes not loaded", error);
    return {};
  }
}

export async function fetchBTTVEmotes(channelId: string): Promise<EmoteMap> {
  const cacheKey = `emotes_bttv_${channelId}`;
  const cached = await getCachedEmotes(cacheKey);
  if (cached) {
    const cachedAuthors = await getCachedAuthors(cacheKey);
    if (cachedAuthors) Object.assign(authorsBttv, cachedAuthors);
    return cached;
  }

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
        const authorName = emote.user?.displayName;
        if (authorName) authorsBttv[emote.code] = authorName;
      });
    }

    await setCachedEmotes(cacheKey, emotes, undefined, { ...authorsBttv });
    return emotes;
  } catch (error) {
    console.warn("BTTV emotes not loaded", error);
    return {};
  }
}
