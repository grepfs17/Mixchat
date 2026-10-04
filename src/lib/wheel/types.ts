/**
 * Wheel Spin — shared types and limits.
 *
 * A "wheel" is a named, ordered list of options the streamer can spin. Wheels
 * are persisted server-side as individual JSON files (see
 * `src/server/wheelStore.ts`) and can be shared publicly by id.
 */

export interface WheelRecord {
  id: string;
  name: string;
  options: string[];
  channelName: string;
  channelPlatform: string;
  ownerTokenHash: string;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
  isPublic: boolean;
  version: number;
}

/** Safe projection returned to any reader (owner or public share link). */
export interface WheelPublicView {
  id: string;
  name: string;
  options: string[];
  isPublic: boolean;
  channelName: string;
  channelPlatform: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/** Lightweight list entry for the wheel sidebar. */
export interface WheelSummary {
  id: string;
  name: string;
  optionCount: number;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WheelOwnerBootstrap {
  id: string;
  ownerToken: string;
  wheel: WheelPublicView;
}

export const WHEEL_ID_LENGTH = 24;
export const MAX_WHEEL_NAME_LENGTH = 60;
export const MAX_WHEEL_OPTIONS = 100;
export const MAX_WHEEL_OPTION_LENGTH = 80;

export const DEFAULT_WHEEL_OPTIONS = [
  "Yes",
  "No",
  "Maybe",
  "Ask again later",
];

/**
 * Clamps a raw option list: trims, drops empties, removes duplicates
 * (case-insensitive) and caps the count/length.
 */
export function sanitizeWheelOptions(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const value = raw.trim().slice(0, MAX_WHEEL_OPTION_LENGTH);
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= MAX_WHEEL_OPTIONS) break;
  }
  return out;
}
