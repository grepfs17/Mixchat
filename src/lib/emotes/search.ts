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
  const aliases = getEmoteAliases();
  const matchesQuery = (name: string): boolean => {
    if (name.toLowerCase().includes(lowerQuery)) return true;
    const alias = aliases[name];
    return Boolean(alias?.toLowerCase().includes(lowerQuery));
  };

  // Search Twitch global emotes
  Object.entries(emotesTwitchGlobal).forEach(([name, url]) => {
    if (matchesQuery(name) && !isEmoteDisabled(name)) {
      results.push({ name, url, source: "Twitch" });
    }
  });

  // Search user's subscription emotes (only emotes they can actually use).
  // Channels disabled in bulk are skipped entirely, matching the individual
  // per-emote disable behaviour above.
  emotesTwitchByChannel.forEach((group) => {
    if (isEmoteChannelDisabled(group.channelId)) return;
    Object.entries(group.emotes).forEach(([name, url]) => {
      if (matchesQuery(name) && !isEmoteDisabled(name)) {
        results.push({ name, url, source: "Twitch" });
      }
    });
  });

  // Search 7TV emotes
  Object.entries(emotes7tv).forEach(([name, url]) => {
    if (matchesQuery(name) && !isEmoteDisabled(name)) {
      results.push({ name, url: getEmoteUrl(url), source: "7TV" });
    }
  });

  // Search BTTV emotes
  Object.entries(emotesBttv).forEach(([name, url]) => {
    if (matchesQuery(name) && !isEmoteDisabled(name)) {
      results.push({ name, url, source: "BTTV" });
    }
  });

  // Search FFZ emotes
  Object.entries(emotesFfz).forEach(([name, url]) => {
    if (matchesQuery(name) && !isEmoteDisabled(name)) {
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

/**
 * Twitch channels disabled as a whole (stored as array of channel IDs).
 * Separate from `DISABLED_EMOTES_KEY` so disabling a channel survives new
 * emotes being added to it and never pollutes the per-emote name list.
 */
export const DISABLED_EMOTE_CHANNELS_KEY = "disabled_emote_channels:v1";

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

export function getDisabledEmoteChannels(): Set<string> {
  try {
    const raw = localStorage.getItem(DISABLED_EMOTE_CHANNELS_KEY);
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

export function isEmoteChannelDisabled(channelId: string): boolean {
  return getDisabledEmoteChannels().has(channelId);
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

export function toggleDisableEmoteChannel(channelId: string): void {
  try {
    const set = getDisabledEmoteChannels();
    if (set.has(channelId)) set.delete(channelId);
    else set.add(channelId);
    localStorage.setItem(
      DISABLED_EMOTE_CHANNELS_KEY,
      JSON.stringify(Array.from(set)),
    );

    // Notify listeners (reuse emotes-reloaded so UI refreshes emote lists and autocomplete)
    notifyEmotesReloaded();
  } catch (e) {
    console.warn("Failed to toggle emote channel disabled state", e);
  }
}

/**
 * Emote aliases (stored in localStorage as `{ emoteName: alias }`).
 * Each emote has at most one alias; adding a new alias replaces the old one.
 * The alias lets an emote surface in autocomplete when the user types the
 * alias instead of the emote's canonical name.
 */
export const EMOTE_ALIASES_KEY = "emote_aliases:v1";

export function getEmoteAliases(): Record<string, string> {
  try {
    const raw = localStorage.getItem(EMOTE_ALIASES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, string> = {};
    for (const [name, value] of Object.entries(parsed)) {
      if (typeof value === "string") {
        out[name] = value;
      } else if (Array.isArray(value)) {
        // Legacy shape (multiple aliases per emote): keep only the first.
        const first = value.find((v): v is string => typeof v === "string");
        if (first) out[name] = first;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function addEmoteAlias(name: string, alias: string): void {
  try {
    const trimmed = alias.trim();
    if (!trimmed) return;
    const aliases = getEmoteAliases();
    if (aliases[name] === trimmed) return;
    aliases[name] = trimmed;
    localStorage.setItem(EMOTE_ALIASES_KEY, JSON.stringify(aliases));

    // Notify listeners (reuse emotes-reloaded so UI refreshes emote lists and autocomplete)
    notifyEmotesReloaded();
  } catch (e) {
    console.warn("Failed to add emote alias", e);
  }
}

export function removeEmoteAlias(name: string): void {
  try {
    const aliases = getEmoteAliases();
    delete aliases[name];
    localStorage.setItem(EMOTE_ALIASES_KEY, JSON.stringify(aliases));

    // Notify listeners (reuse emotes-reloaded so UI refreshes emote lists and autocomplete)
    notifyEmotesReloaded();
  } catch (e) {
    console.warn("Failed to remove emote alias", e);
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
