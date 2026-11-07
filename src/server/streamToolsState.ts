/**
 * Shared, channel-scoped state for tools that need streamer + moderator
 * sync (Giveaway and Music Player today). Song Queue and Wheel already have
 * their own server stores.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { DEFAULT_MUSIC_PLAYER_SETTINGS } from "../lib/musicPlayer/types";
import { pickWinner } from "../lib/streamerTools/giveaway";
import type { GiveawayHistoryEntry } from "../lib/streamerTools/history";
import type {
  SharedGiveawayState,
  SharedMusicState,
  StreamToolsState,
} from "../lib/streamTools/state";
import type { StreamToolsStoreOptions } from "./streamToolsConfig";

interface StoredState extends StreamToolsState {
  fileVersion: number;
  channelKey: string;
  updatedAt: string;
}

const FILE_VERSION = 1;
/** Same cap the local (desktop) history uses. */
const MAX_HISTORY_ENTRIES = 50;
const mutexes = new Map<string, Promise<unknown>>();

function normalizeChannelKey(channelKey: string): string {
  return channelKey.trim().toLowerCase();
}

function safeFileName(channelKey: string): string {
  const key = normalizeChannelKey(channelKey);
  if (/^[a-z0-9:_-]+$/.test(key)) {
    return `${key.replace(/:/g, "-")}.json`;
  }
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 24);
  return `channel-${hash}.json`;
}

function statePath(opts: StreamToolsStoreOptions, channelKey: string): string {
  return path.join(opts.baseDir, "state", safeFileName(channelKey));
}

async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = mutexes.get(key) || Promise.resolve();
  let release: () => void = () => {};
  const next = new Promise<void>((resolve) => (release = resolve));
  const chain = prev.then(() => next);
  mutexes.set(key, chain);
  try {
    await prev;
    return await fn();
  } finally {
    release();
    if (mutexes.get(key) === chain) mutexes.delete(key);
  }
}

export function defaultGiveawayState(): SharedGiveawayState {
  return {
    phase: "config",
    keyword: "",
    duration: 180,
    scope: "both",
    eligibility: "everyone",
    startedAt: null,
    endsAt: null,
    winner: null,
    entries: [],
    announcedAt: null,
  };
}

export function defaultMusicState(): SharedMusicState {
  return {
    playlists: [],
    settings: { ...DEFAULT_MUSIC_PLAYER_SETTINGS },
    isPlaying: false,
  };
}

function freshState(channelKey: string): StoredState {
  return {
    fileVersion: FILE_VERSION,
    channelKey: normalizeChannelKey(channelKey),
    version: 0,
    updatedAt: new Date(0).toISOString(),
    giveaway: defaultGiveawayState(),
    giveawayHistory: [],
    music: defaultMusicState(),
  };
}

function validHistoryEntry(value: unknown): value is GiveawayHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<GiveawayHistoryEntry>;
  return (
    typeof entry.id === "string" &&
    typeof entry.revealedAt === "string" &&
    typeof entry.keyword === "string" &&
    !!entry.winner &&
    typeof entry.winner.userId === "string"
  );
}

function normalizeLoaded(
  channelKey: string,
  raw: Partial<StoredState> | null,
): StoredState {
  const base = freshState(channelKey);
  if (!raw || typeof raw !== "object") return base;
  return {
    ...base,
    version: Number.isInteger(raw.version) ? Number(raw.version) : 0,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : base.updatedAt,
    giveaway: {
      ...base.giveaway,
      ...(raw.giveaway && typeof raw.giveaway === "object"
        ? raw.giveaway
        : {}),
      entries: Array.isArray(raw.giveaway?.entries)
        ? raw.giveaway.entries
        : [],
    },
    giveawayHistory: Array.isArray(raw.giveawayHistory)
      ? raw.giveawayHistory.filter(validHistoryEntry)
      : [],
    music: {
      ...base.music,
      ...(raw.music && typeof raw.music === "object" ? raw.music : {}),
      playlists: Array.isArray(raw.music?.playlists)
        ? raw.music.playlists
        : [],
      settings: {
        ...base.music.settings,
        ...(raw.music?.settings && typeof raw.music.settings === "object"
          ? raw.music.settings
          : {}),
      },
    },
  };
}

async function readStored(
  opts: StreamToolsStoreOptions,
  channelKey: string,
): Promise<StoredState> {
  try {
    const raw = await fs.readFile(statePath(opts, channelKey), "utf8");
    return normalizeLoaded(channelKey, JSON.parse(raw) as Partial<StoredState>);
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "ENOENT"
    ) {
      return freshState(channelKey);
    }
    throw err;
  }
}

async function writeStored(
  opts: StreamToolsStoreOptions,
  state: StoredState,
): Promise<void> {
  const target = statePath(opts, state.channelKey);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
  await fs.rename(tmp, target);
}

/**
 * Append the current giveaway's winner to the shared history. Call it exactly
 * when a giveaway transitions to `revealed`; the phase guard in `resolveGiveaway`
 * and in the `reveal` action keeps each giveaway recorded once.
 */
export function recordGiveawayWinner(state: StoredState): void {
  const giveaway = state.giveaway;
  if (!giveaway.winner) return;
  const entry: GiveawayHistoryEntry = {
    id: `${Date.now()}-${randomBytes(4).toString("hex")}`,
    revealedAt: new Date().toISOString(),
    keyword: giveaway.keyword,
    winner: giveaway.winner,
    entryCount: giveaway.entries.length,
    durationSeconds: giveaway.duration,
    scope: giveaway.scope,
    eligibility: giveaway.eligibility,
  };
  state.giveawayHistory = [entry, ...state.giveawayHistory].slice(
    0,
    MAX_HISTORY_ENTRIES,
  );
}

function resolveGiveaway(state: StoredState): boolean {
  const giveaway = state.giveaway;
  if (giveaway.phase !== "running") return false;
  if (giveaway.endsAt === null || !Number.isFinite(giveaway.endsAt)) {
    return false;
  }
  if (hasEnded(giveaway.endsAt)) {
    state.giveaway = {
      ...giveaway,
      phase: "revealed",
      winner: giveaway.winner ?? pickWinner(giveaway.entries),
    };
    recordGiveawayWinner(state);
    return true;
  }
  return false;
}

function hasEnded(endsAt: number): boolean {
  return endsAt <= Date.now();
}

export async function getStreamToolsState(
  opts: StreamToolsStoreOptions,
  channelKey: string,
): Promise<StreamToolsState> {
  const key = normalizeChannelKey(channelKey);
  return withLock(key, async () => {
    const state = await readStored(opts, key);
    if (resolveGiveaway(state)) {
      state.version += 1;
      state.updatedAt = new Date().toISOString();
      await writeStored(opts, state);
    }
    return {
      version: state.version,
      giveaway: state.giveaway,
      giveawayHistory: state.giveawayHistory,
      music: state.music,
    };
  });
}

function snapshot(state: StoredState): StreamToolsState {
  return {
    version: state.version,
    giveaway: state.giveaway,
    giveawayHistory: state.giveawayHistory,
    music: state.music,
  };
}

export async function mutateStreamToolsState<T>(
  opts: StreamToolsStoreOptions,
  channelKey: string,
  fn: (state: StoredState) => T | Promise<T>,
): Promise<T> {
  const key = normalizeChannelKey(channelKey);
  return withLock(key, async () => {
    const state = await readStored(opts, key);
    resolveGiveaway(state);
    const result = await fn(state);
    state.version += 1;
    state.updatedAt = new Date().toISOString();
    await writeStored(opts, state);
    return result;
  });
}

export type StreamToolsVersionedMutation<T> =
  | { ok: true; result: T; state: StreamToolsState }
  | { ok: false; state: StreamToolsState };

/**
 * Mutate only when the stored version still matches `expectedVersion`.
 * The check and the write share the channel lock, so two callers with the
 * same expected version cannot both pass and overwrite each other.
 */
export async function mutateStreamToolsStateIfVersion<T>(
  opts: StreamToolsStoreOptions,
  channelKey: string,
  expectedVersion: number,
  fn: (state: StoredState) => T | Promise<T>,
): Promise<StreamToolsVersionedMutation<T>> {
  const key = normalizeChannelKey(channelKey);
  return withLock(key, async () => {
    const state = await readStored(opts, key);
    const revealed = resolveGiveaway(state);
    if (state.version !== expectedVersion) {
      // Persist an auto-reveal even though the caller lost the race, so a
      // conflict response cannot silently drop it.
      if (revealed) {
        state.version += 1;
        state.updatedAt = new Date().toISOString();
        await writeStored(opts, state);
      }
      return { ok: false, state: snapshot(state) };
    }
    const result = await fn(state);
    state.version += 1;
    state.updatedAt = new Date().toISOString();
    await writeStored(opts, state);
    return { ok: true, result, state: snapshot(state) };
  });
}

export function entryKey(entry: {
  platform: string;
  userId: string;
}): string {
  return `${entry.platform}:${entry.userId.toLowerCase()}`;
}
