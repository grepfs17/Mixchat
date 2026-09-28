import type { EmoteMap } from "./types";
import { getCachedEmotes, getCachedAuthors, setCachedEmotes } from "./state";
import { EMOTE_SIZE, fetchWithTimeout } from "./utils";

/** Accumulated author data for FFZ emotes, populated during fetch. */
export const authorsFfz: Record<string, string> = {};

/**
 * Fetch FFZ global emotes
 */
export async function fetchFFZGlobalEmotes(): Promise<EmoteMap> {
  const cacheKey = "emotes_ffz_global_v2";
  const cached = await getCachedEmotes(cacheKey);
  if (cached) {
    const cachedAuthors = await getCachedAuthors(cacheKey);
    if (cachedAuthors) Object.assign(authorsFfz, cachedAuthors);
    return cached;
  }

  try {
    const response = await fetchWithTimeout(
      "https://api.frankerfacez.com/v1/set/global",
    );
    const data = await response.json();

    const emotes: EmoteMap = {};
    if (data.sets) {
      Object.values(data.sets).forEach((set: any) => {
        if (set.emoticons) {
          set.emoticons.forEach((emote: any) => {
            // Modifier emotes (ffzX, ffzW, ffzCursed, …) are effect words, not
            // renderable emotes. They are handled by the parser in modifiers.ts.
            if (emote.modifier) return;
            emotes[emote.name] =
              `https://cdn.frankerfacez.com/emote/${emote.id}/${EMOTE_SIZE}`;
            const ownerName = emote.owner?.display_name;
            if (ownerName) authorsFfz[emote.name] = ownerName;
          });
        }
      });
    }
    await setCachedEmotes(cacheKey, emotes, undefined, { ...authorsFfz });
    return emotes;
  } catch (error) {
    console.warn("FFZ global emotes not loaded", error);
    return {};
  }
}

/**
 * Fetch FFZ emotes for a given channel
 */
export async function fetchFFZEmotes(channelName: string): Promise<EmoteMap> {
  const cacheKey = `emotes_ffz_v2_${channelName}`;
  const cached = await getCachedEmotes(cacheKey);
  if (cached) {
    const cachedAuthors = await getCachedAuthors(cacheKey);
    if (cachedAuthors) Object.assign(authorsFfz, cachedAuthors);
    return cached;
  }

  try {
    const response = await fetchWithTimeout(
      `https://api.frankerfacez.com/v1/room/${channelName}`,
    );
    const data = await response.json();

    const emotes: EmoteMap = {};
    if (data.sets) {
      const setId = data.room.set;
      if (data.sets[setId]) {
        data.sets[setId].emoticons.forEach((emote: any) => {
          if (emote.modifier) return;
          emotes[emote.name] =
            `https://cdn.frankerfacez.com/emote/${emote.id}/${EMOTE_SIZE}`;
        });
      }
    }
    await setCachedEmotes(cacheKey, emotes, undefined, { ...authorsFfz });
    return emotes;
  } catch (error) {
    console.warn("FFZ emotes not loaded", error);
    return {};
  }
}
