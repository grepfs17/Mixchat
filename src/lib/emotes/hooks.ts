import { useEffect, useState, useSyncExternalStore } from "react";
import { emoteMapVersion } from "./state";
import { DISABLED_EMOTES_KEY, getDisabledEmotes } from "./search";

/**
 * Subscribe to the current emote map version. The version is bumped on every
 * change to `emotes7tv` / `emotesBttv` / `emotesFfz` / `emotesTwitch` (see
 * `bumpEmoteMapVersion` in `./state`) and the `emotes-reloaded` DOM event is
 * fired in lockstep. The hook uses `useSyncExternalStore` so it re-renders
 * exactly when the version changes, no more, no less — without the manual
 * `useState` + counter dance the component would otherwise need.
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
 * Returns a `Set<string>` of disabled emote names, refreshed whenever the
 * `emotes-reloaded` event fires (the disabled list is toggled via
 * `toggleDisableEmote`, which also fires that event) or another tab mutates
 * the underlying localStorage entry (cross-tab sync via the `storage` event).
 *
 * The expensive `JSON.parse(localStorage.getItem(...))` is therefore paid at
 * most once per change rather than on every chat re-render.
 *
 * Note: useSyncExternalStore would be preferred here but getDisabledEmotes()
 * returns a new Set on every call, which breaks Object.is referential stability
 * and causes cascading re-renders. The useState+useEffect pattern with targeted
 * event listeners is the correct approach for this case.
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
