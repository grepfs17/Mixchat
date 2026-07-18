import type { EmotesBySource } from "./types";
import {
  emotes7tv,
  emotesBttv,
  emotesFfz,
  emotesTwitchGlobal,
  emotesTwitchByChannel,
  notifyEmotesReloaded,
} from "./state";
import { getEmoteUrl } from "./utils";

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

  // Search Twitch global emotes
  Object.entries(emotesTwitchGlobal).forEach(([name, url]) => {
    if (name.toLowerCase().includes(lowerQuery) && !isEmoteDisabled(name)) {
      results.push({ name, url, source: "Twitch" });
    }
  });

  // Search user's subscription emotes (only emotes they can actually use)
  emotesTwitchByChannel.forEach((group) => {
    Object.entries(group.emotes).forEach(([name, url]) => {
      if (name.toLowerCase().includes(lowerQuery) && !isEmoteDisabled(name)) {
        results.push({ name, url, source: "Twitch" });
      }
    });
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
export const DISABLED_EMOTES_KEY = "disabled_emotes_v1";

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

function isEmoteDisabled(name: string): boolean {
  return getDisabledEmotes().has(name);
}

export function toggleDisableEmote(name: string): void {
  try {
    const set = getDisabledEmotes();
    if (set.has(name)) set.delete(name);
    else set.add(name);
    localStorage.setItem(DISABLED_EMOTES_KEY, JSON.stringify(Array.from(set)));

    // Notify listeners (reuse emotes-reloaded so UI refreshes emote lists and autocomplete)
    notifyEmotesReloaded();
  } catch (e) {
    console.warn("Failed to toggle emote disabled state", e);
  }
}

/**
 * Get all emotes organized by source
 */
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
