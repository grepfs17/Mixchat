// Client-safe mirror of the server's `reconcileEndedItems`. The server
// helper lives in `src/server/` and pulls in node-only modules, so this
// is a pure data transform usable from React code.
import type { SongQueueItem } from "./types";

export function reconcileEndedItemsClient(
  items: SongQueueItem[],
  currentIndex: number,
): SongQueueItem[] {
  return items.map((it, i) => {
    if (it.status !== "playing") return it;
    if (i === currentIndex) {
      return { ...it, status: "played" as const };
    }
    return { ...it, status: "skipped" as const };
  });
}
