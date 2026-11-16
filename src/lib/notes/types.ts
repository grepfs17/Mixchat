/**
 * Types and pure helpers for the viewer stream-notes feature.
 *
 * A note is stamped with the elapsed stream time at the moment it was written,
 * the same value the chat header uptime display shows. Each note stores the
 * anchor used for that calculation so older notes keep their original elapsed
 * time after the stream ends.
 */

export const MAX_NOTES_PER_CHANNEL = 500;
export const MAX_NOTE_LENGTH = 1000;

export interface StreamNote {
  id: string;
  channel: string;
  text: string;
  /** Whether this note shows an elapsed-time timestamp. */
  hasTimestamp: boolean;
  /** Epoch ms when the note was written. */
  timestampMs: number;
  /** Epoch ms this note's elapsed time is measured from. */
  anchorMs: number;
  /** Stream start this note belongs to, or null when written offline. */
  streamStartMs: number | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Page-load anchor for notes written while no live stream is known, so they
 * still get a monotonic "session" elapsed time instead of failing.
 */
const PAGE_LOAD_MS =
  typeof performance !== "undefined" &&
  typeof performance.timeOrigin === "number"
    ? performance.timeOrigin
    : Date.now();

export function noteAnchorMs(
  streamStartedAt?: Date | null,
): number {
  return streamStartedAt ? streamStartedAt.getTime() : PAGE_LOAD_MS;
}

export function noteStreamStartMs(
  streamStartedAt?: Date | null,
): number | null {
  return streamStartedAt ? streamStartedAt.getTime() : null;
}

/** Mirrors the chat header `.uptime-display` formatting. */
export function formatElapsed(ms: number): string {
  const diffSec = Math.max(0, Math.floor(ms / 1000));
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffDay > 0) return `${diffDay}d ${diffHour % 24}h ${diffMin % 60}m`;
  if (diffHour > 0) return `${diffHour}h ${diffMin % 60}m ${diffSec % 60}s`;
  if (diffMin > 0) return `${diffMin}m ${diffSec % 60}s`;
  return `${diffSec}s`;
}

export function elapsedFor(note: StreamNote): number {
  return Math.max(0, note.timestampMs - note.anchorMs);
}

function genId(): string {
  if (
    typeof globalThis !== "undefined" &&
    typeof globalThis.crypto?.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function makeNoteId(): string {
  return genId();
}

export function createNote(input: {
  channel: string;
  text: string;
  streamStartedAt?: Date | null;
  withTimestamp?: boolean;
}): StreamNote | null {
  const text = input.text.trim();
  if (!input.channel || !text) return null;
  const timestampMs = Date.now();
  return {
    id: makeNoteId(),
    channel: input.channel,
    text: text.slice(0, MAX_NOTE_LENGTH),
    hasTimestamp: input.withTimestamp !== false,
    timestampMs,
    anchorMs: noteAnchorMs(input.streamStartedAt),
    streamStartMs: noteStreamStartMs(input.streamStartedAt),
    createdAt: new Date(timestampMs).toISOString(),
    updatedAt: new Date(timestampMs).toISOString(),
  };
}

export function isValidNote(value: unknown): value is StreamNote {
  if (!value || typeof value !== "object") return false;
  const note = value as Partial<StreamNote>;
  return (
    typeof note.id === "string" &&
    note.id.length > 0 &&
    typeof note.channel === "string" &&
    typeof note.text === "string" &&
    (note.hasTimestamp === undefined ||
      typeof note.hasTimestamp === "boolean") &&
    typeof note.timestampMs === "number" &&
    Number.isFinite(note.timestampMs) &&
    typeof note.anchorMs === "number" &&
    Number.isFinite(note.anchorMs) &&
    (note.streamStartMs === null ||
      (typeof note.streamStartMs === "number" &&
        Number.isFinite(note.streamStartMs))) &&
    typeof note.createdAt === "string" &&
    typeof note.updatedAt === "string"
  );
}

/** Rebuild a stored note from validated fields, dropping unknown properties. */
export function normalizeNote(value: unknown): StreamNote | null {
  if (!isValidNote(value)) return null;
  return {
    id: value.id,
    channel: value.channel,
    text: value.text.slice(0, MAX_NOTE_LENGTH),
    hasTimestamp: value.hasTimestamp !== false,
    timestampMs: value.timestampMs,
    anchorMs: value.anchorMs,
    streamStartMs: value.streamStartMs,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}
