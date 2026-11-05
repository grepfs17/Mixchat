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
    music: defaultMusicState(),
  };
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
      music: state.music,
    };
  });
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

export function entryKey(entry: {
  platform: string;
  userId: string;
}): string {
  return `${entry.platform}:${entry.userId.toLowerCase()}`;
}
