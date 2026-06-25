import type { EmoteMap } from "./types";
import {
  getCachedEmotes,
  getCachedAuthors,
  setCachedEmotes,
  setActiveEmoteSetId,
  setEventSource7tv,
  setReconnect7tvTimer,
  setReconnect7tvDelay,
  activeEmoteSetId,
  eventSource7tv,
  reconnect7tvTimer,
  reconnect7tvDelay,
} from "./state";
import { EMOTE_SIZE, fetchWithTimeout, ZERO_WIDTH_FLAG } from "./utils";

/** Accumulated author data for 7TV emotes, populated during fetch. */
export const authors7tv: Record<string, string> = {};

const RECONNECT_7TV_MIN = 5000;
const RECONNECT_7TV_MAX = 300_000;

/**
 * Fetch 7TV global emotes
 */
export async function fetch7TVGlobalEmotes(): Promise<EmoteMap> {
  const cacheKey = "emotes_7tv_global_v2";
  const cached = getCachedEmotes(cacheKey);
  if (cached) {
    const cachedAuthors = getCachedAuthors(cacheKey);
    if (cachedAuthors) Object.assign(authors7tv, cachedAuthors);
    console.log(
      "Using cached 7TV global emotes, count:",
      Object.keys(cached).length,
    );
    return cached;
  }

  try {
    console.log("Fetching 7TV global emotes from 7tv.io");
    const response = await fetchWithTimeout(
      "https://7tv.io/v3/emote-sets/global",
    );
    const data = await response.json();

    const emotes: EmoteMap = {};
    if (data.emotes) {
      data.emotes.forEach((emote: any) => {
        const url = `https://cdn.7tv.app/emote/${emote.id}/${EMOTE_SIZE}x.webp`;
        const flags: number = emote.data?.flags ?? 0;
        emotes[emote.name] = flags & ZERO_WIDTH_FLAG ? `ZW:${url}` : url;
        const ownerName = emote.data?.owner?.display_name;
        if (ownerName) authors7tv[emote.name] = ownerName;
      });
    }
    setCachedEmotes(cacheKey, emotes, undefined, { ...authors7tv });
    console.log(
      "Fetched 7TV global emotes, count:",
      Object.keys(emotes).length,
    );
    return emotes;
  } catch (error) {
    console.warn("7TV global emotes not loaded", error);
    return {};
  }
}

/**
 * Fetch 7TV emotes for a given channel
 */
export async function fetch7TVEmotes(channelId: string): Promise<EmoteMap> {
  const cacheKey = `emotes_7tv_v2_${channelId}`;
  const cached = getCachedEmotes(cacheKey);
  if (cached) {
    const cachedAuthors = getCachedAuthors(cacheKey);
    if (cachedAuthors) Object.assign(authors7tv, cachedAuthors);
    return cached;
  }

  try {
    console.log(`[7TV] Fetching emotes for channelId: ${channelId}`);
    const response = await fetchWithTimeout(
      `https://7tv.io/v3/users/twitch/${channelId}?t=${Date.now()}`,
    );
    if (!response.ok) {
      console.warn(
        `[7TV] Failed to fetch channel data for ${channelId}: ${response.status}`,
      );
      return {};
    }
    const data = await response.json();
    console.log(
      `[7TV] Data received for ${channelId}:`,
      data.username,
      data.emote_set?.id,
    );

    const emotes: EmoteMap = {};
    let emoteSet = data.emote_set;
    let emoteSetIdToFetch = data.emote_set_id;

    // Deep Fallback: if root fields are null, check user.emote_sets array
    if (!emoteSet && !emoteSetIdToFetch && data.user?.emote_sets?.[0]) {
      emoteSetIdToFetch = data.user.emote_sets[0].id;
      console.log(
        `[7TV] Found emote set ID ${emoteSetIdToFetch} in user.emote_sets`,
      );
    }

    // Fallback Fetch: if emote_set is not embedded (null), but we have the ID, fetch it separately
    if (!emoteSet && emoteSetIdToFetch) {
      console.log(
        `[7TV] Emote set not embedded for ${channelId}, fetching set ${emoteSetIdToFetch} separately`,
      );
      try {
        const setResponse = await fetchWithTimeout(
          `https://7tv.io/v3/emote-sets/${emoteSetIdToFetch}?t=${Date.now()}`,
        );
        if (setResponse.ok) {
          emoteSet = await setResponse.json();
        } else {
          console.warn(
            `[7TV] Failed to fetch separate emote set ${emoteSetIdToFetch}: ${setResponse.status}`,
          );
        }
      } catch (e) {
        console.warn(`[7TV] Error fetching separate emote set:`, e);
      }
    }

    if (emoteSet) {
      setActiveEmoteSetId(emoteSet.id);
      console.log(
        `[7TV] Set activeEmoteSetId to ${activeEmoteSetId} for ${channelId}`,
      );
      if (emoteSet.emotes) {
        console.log(
          `[7TV] Emote set ${activeEmoteSetId} has ${emoteSet.emotes.length} emotes`,
        );
        emoteSet.emotes.forEach((emote: any) => {
          const url = `https://cdn.7tv.app/emote/${emote.id}/${EMOTE_SIZE}x.webp`;
          const flags: number = emote.data?.flags ?? 0;
          emotes[emote.name] = flags & ZERO_WIDTH_FLAG ? `ZW:${url}` : url;
          const ownerName = emote.data?.owner?.display_name;
          if (ownerName) authors7tv[emote.name] = ownerName;
        });
      }
    } else {
      console.warn(
        `[7TV] Response for ${channelId} has no emote_set available:`,
        Object.keys(data),
      );
    }
    setCachedEmotes(cacheKey, emotes, activeEmoteSetId || undefined, {
      ...authors7tv,
    });
    return emotes;
  } catch (error) {
    console.warn("7TV emotes not loaded", error);
    return {};
  }
}

// Subscribe to real-time 7TV emote updates for the active channel.
export function subscribeTo7TVUpdates(
  channelId: string,
  channelName: string,
  reinitialize: (channelId: string, channelName: string) => Promise<void>,
): () => void {
  if (typeof window === "undefined") return () => {};

  if (!activeEmoteSetId) {
    console.warn(
      `[7TV] Cannot subscribe to updates: activeEmoteSetId is missing for ${channelName} (${channelId}).`,
    );
    return () => {};
  }

  console.log(
    `[7TV] Connecting to EventAPI for emote set: ${activeEmoteSetId} (channel: ${channelName})`,
  );
  if (eventSource7tv) {
    eventSource7tv.close();
  }

  const subscription = encodeURIComponent(
    `emote_set.update<object_id=${activeEmoteSetId}>`,
  );
  const url = `https://events.7tv.io/v3@${subscription}`;

  console.log(
    `[7TV] Connecting to EventAPI for emote set: ${activeEmoteSetId}`,
  );
  const es = new EventSource(url);
  setEventSource7tv(es);

  es.addEventListener("hello", () => {
    console.log("[7TV] EventAPI: Handshake successful (hello received)");
    setReconnect7tvDelay(RECONNECT_7TV_MIN);
  });

  es.addEventListener("heartbeat", () => {
    // console.log('[7TV] EventAPI: Heartbeat received');
  });

  es.addEventListener("dispatch", async (event: any) => {
    try {
      const data = JSON.parse(event.data);
      // d.type is what identifies the event inside a dispatch
      if (data.type === "emote_set.update") {
        const body = data.body;
        if (!body) return;

        // 7TV v3 ChangeMap structure: pushed/pulled/updated arrays
        const pushed = body.pushed || [];
        const pulled = body.pulled || [];

        const emotesAdded = pushed
          .filter((p: any) => p.key === "emotes")
          .map((p: any) => p.value);

        const emotesRemoved = pulled
          .filter((p: any) => p.key === "emotes")
          .map((p: any) => p.old_value);

        if (emotesAdded.length > 0 || emotesRemoved.length > 0) {
          console.log(
            `[7TV] Emote set update: ${emotesAdded.length} added, ${emotesRemoved.length} removed`,
          );

          emotesAdded.forEach((v: any) => {
            window.dispatchEvent(
              new CustomEvent("7tv-emote-added", {
                detail: { name: v?.name, id: v?.id },
              }),
            );
          });

          emotesRemoved.forEach((v: any) => {
            window.dispatchEvent(
              new CustomEvent("7tv-emote-removed", {
                detail: { name: v?.name, id: v?.id },
              }),
            );
          });

          // Clear cache and re-initialize
          localStorage.removeItem(`emotes_7tv_v2_${channelId}`);
          await reinitialize(channelId, channelName);
        }
      }
    } catch (err) {
      console.error("[7TV] Failed to parse EventAPI message:", err);
    }
  });

  es.onerror = (err) => {
    console.error("[7TV] EventAPI connection error:", err);
    if (eventSource7tv) eventSource7tv.close();
    setReconnect7tvTimer(
      setTimeout(() => {
        setReconnect7tvDelay(
          Math.min(reconnect7tvDelay * 2, RECONNECT_7TV_MAX),
        );
        subscribeTo7TVUpdates(channelId, channelName, reinitialize);
      }, reconnect7tvDelay),
    );
  };

  return () => {
    if (reconnect7tvTimer) {
      clearTimeout(reconnect7tvTimer);
      setReconnect7tvTimer(null);
    }
    if (eventSource7tv) {
      console.log("[7TV] Disconnecting EventAPI");
      eventSource7tv.close();
      setEventSource7tv(null);
    }
  };
}
