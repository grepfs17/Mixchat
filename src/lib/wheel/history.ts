/**
 * Wheel Spin history helpers.
 *
 * The winners themselves live on the wheel record (`src/lib/wheel/types.ts`)
 * so the streamer and moderators see the same list; this module only holds
 * client-side formatting.
 */
import type { WheelHistoryEntry } from "./types";

export type { WheelHistoryEntry };

export function formatHistoryTime(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const sec = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${min}:${sec} ${dd}/${mm}`;
}
