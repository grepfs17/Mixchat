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
  EmoteMap,
  EmoteCache,
  ChannelEmoteGroup,
  ChannelGroupCache,
  BroadcasterInfo,
  TwitchChannelEmotes,
  EmotesBySource,
} from "./types";

export { parseMessageWithEmotes } from "./parser";
export { lookupEmote, lookupThirdPartyEmote, tokenizeThirdPartyEmotesForYoutube } from "./parser";
export type { YoutubeEmoteToken } from "./parser";

export {
  searchEmotes,
  getDisabledEmotes,
  toggleDisableEmote,
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
 * Each provider (7TV, BTTV, FFZ, Twitch) is fetched and applied independently
 * so a slow or failing API (e.g. 7TV returning 504s) cannot block the others.
 * As soon as a source resolves, its module-level map is updated, the parseCache
 * is invalidated via `bumpEmoteMapVersion`, and `emotes-reloaded` fires so the
 * UI (EmoteMenu, MessageInput) refreshes. The returned promise still waits for
 * every source to settle so callers (handleRefreshEmotes) can clear their
 * loading indicator at the end.
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
// The internal three-argument opening-event-source implementation lives in
// ./7tv under the name `subscribeTo7TVChannelUpdates`; this wrapper injects
// `initializeEmotes` as the reinitialize callback so consumers don't have to
// thread it through themselves.
export function subscribeTo7TVUpdates(
  channelId: string,
  channelName: string,
): () => void {
  return subscribeTo7TVChannelUpdates(channelId, channelName, initializeEmotes);
}
