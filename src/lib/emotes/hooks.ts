import { useEffect, useState, useSyncExternalStore } from "react";
import { emoteMapVersion } from "./state";
import { DISABLED_EMOTES_KEY, getDisabledEmotes } from "./search";

/**
 * Subscribe to the current emote map version, which bumps (in lockstep with
 * the `emotes-reloaded` event) whenever an emote map changes. `useSyncExternalStore`
 * re-renders only when the version changes.
 */
export function useEmoteMapVersion(): number {
  return useSyncExternalStore(
    (onChange) => {
      const handler = () => onChange();
      window.addEventListener("emotes-reloaded", handler);
      return () => window.removeEventListener("emotes-reloaded", handler);
    },
    () => emoteMapVersion,
    () => emoteMapVersion,
  );
}

/**
 * Returns disabled emote names, refreshed on `emotes-reloaded` and on
 * cross-tab `storage` mutations of the same key. Parsing therefore happens at
 * most once per change rather than on every chat re-render.
 *
 * `useSyncExternalStore` is unsuitable here because `getDisabledEmotes()`
 * returns a new Set each call, breaking referential stability.
 */
// eslint-disable-next-line react/prefer-use-sync-external-store
export function useDisabledEmotes(): Set<string> {
  const [disabled, setDisabled] = useState<Set<string>>(
    () => getDisabledEmotes(),
  );
  useEffect(() => {
    const refresh = () => setDisabled(getDisabledEmotes());
    const onStorage = (e: StorageEvent) => {
      // Only react to changes on our key (or full-clear, where key is null).
      // Other tabs mutating unrelated localStorage entries shouldn't force a
      // re-read + re-parse of the disabled-emote list.
      if (e.key === null || e.key === DISABLED_EMOTES_KEY) refresh();
    };
    window.addEventListener("emotes-reloaded", refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("emotes-reloaded", refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return disabled;
}
