import {
  bumpEmoteMapVersion,
  notifyEmotesReloaded,
  setEmotes7tv,
  setEmotesBttv,
  setEmotesFfz,
  setEmotesTwitch,
  setEmotesTwitchGlobal,
  setEmotesTwitchByChannel,
  setEmoteAuthors,
  setLastUserId,
  lastUserId,
  emotesTwitch,
} from "./state";
import { fetch7TVGlobalEmotes, fetch7TVEmotes, authors7tv } from "./7tv";
import { fetchBTTVGlobalEmotes, fetchBTTVEmotes, authorsBttv } from "./bttv";
import { fetchFFZGlobalEmotes, fetchFFZEmotes, authorsFfz } from "./ffz";
import {
  fetchTwitchGlobalEmotes,
  fetchTwitchChannelEmotes,
  fetchUserEmotesByChannel,
} from "./twitch";
import { subscribeTo7TVChannelUpdates } from "./7tv";
import { migrateEmoteCachesFromLocalStorage } from "./emoteStorage";

export type {
  EmotesBySource,
} from "./types";

export { parseMessageWithEmotes } from "./parser";
export { applyMentionColors } from "./parser";
export { tokenizeThirdPartyEmotesForYoutube } from "./parser";
export type { YoutubeEmoteToken } from "./parser";

export { describeEffects, normalizeEffects, isFfzEffectWord } from "./modifiers";
export type { EmoteEffect } from "./modifiers";

export {
  searchEmotes,
  getDisabledEmotes,
  getDisabledEmoteChannels,
  isEmoteChannelDisabled,
  toggleDisableEmote,
  toggleDisableEmoteChannel,
  getEmoteAliases,
  addEmoteAlias,
  removeEmoteAlias,
  getAllEmotesOrganized,
} from "./search";

export { clearEmoteCacheStorage } from "./state";

export {
  emoteMapVersion,
  setEmotes7tv,
  setEmotesBttv,
  setEmotesFfz,
  setEmoteAuthors,
  bumpEmoteMapVersion,
  notifyEmotesReloaded,
} from "./state";

export { useEmoteMapVersion, useDisabledEmotes } from "./hooks";

/**
 * Initialize emotes for a given channel.
 *
 * Each provider is fetched and applied independently, so a slow or failing API
 * cannot block the others. As each source resolves, its map updates and
 * `emotes-reloaded` fires so the UI refreshes. The promise still waits for
 * every source to settle so callers can clear their loading indicator.
 */
export async function initializeEmotes(
  channelId: string,
  channelName: string,
  userId?: string,
): Promise<void> {
  await migrateEmoteCachesFromLocalStorage();

  const stv7 = Promise.all([
    fetch7TVGlobalEmotes(),
    fetch7TVEmotes(channelId),
  ]).then(([g, c]) => {
    setEmotes7tv({ ...g, ...c });
    bumpEmoteMapVersion();
    notifyEmotesReloaded();
  });

  const bttv = Promise.all([
    fetchBTTVGlobalEmotes(),
    fetchBTTVEmotes(channelId),
  ]).then(([g, c]) => {
    setEmotesBttv({ ...g, ...c });
    bumpEmoteMapVersion();
    notifyEmotesReloaded();
  });

  const ffz = Promise.all([
    fetchFFZGlobalEmotes(),
    fetchFFZEmotes(channelName),
  ]).then(([g, c]) => {
    setEmotesFfz({ ...g, ...c });
    bumpEmoteMapVersion();
    notifyEmotesReloaded();
  });

  const twitch = Promise.all([
    fetchTwitchGlobalEmotes(),
    fetchTwitchChannelEmotes(channelId),
  ]).then(async ([g, c]) => {
    setEmotesTwitchGlobal(g);
    setEmotesTwitch({ ...g, ...c });

    const effectiveUserId = userId || lastUserId;
    if (effectiveUserId) {
      setLastUserId(effectiveUserId);
      const channelGroups = await fetchUserEmotesByChannel(effectiveUserId);
      setEmotesTwitchByChannel(channelGroups);
      for (const group of channelGroups) {
        Object.assign(emotesTwitch, group.emotes);
      }
    } else {
      setEmotesTwitchByChannel([]);
    }

    bumpEmoteMapVersion();
    notifyEmotesReloaded();
  });

  await Promise.allSettled([stv7, bttv, ffz, twitch]);

  setEmoteAuthors({
    ...authors7tv,
    ...authorsBttv,
    ...authorsFfz,
  });
}

// Re-export 7TV real-time subscription with a fixed two-argument signature.
// This wrapper injects `initializeEmotes` as the reinitialize callback so
// consumers don't have to thread it through themselves.
export function subscribeTo7TVUpdates(
  channelId: string,
  channelName: string,
): () => void {
  return subscribeTo7TVChannelUpdates(channelId, channelName, initializeEmotes);
}
