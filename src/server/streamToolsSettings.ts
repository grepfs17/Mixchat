/**
 * Server-side Stream tools access settings.
 *
 * One file per channel. Public reads let moderators discover whether the
 * streamer enabled Stream tools for them. Writes are owner-only at the route
 * layer; this store only handles persistence.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import type { StreamToolsStoreOptions } from "./streamToolsConfig";

export interface StreamToolsSettings {
  enabled: boolean;
  allowMods: boolean;
}

interface StoredSettings extends StreamToolsSettings {
  fileVersion: number;
  channelKey: string;
  updatedAt: string;
}

const FILE_VERSION = 1;
export const DEFAULT_STREAM_TOOLS_SETTINGS: StreamToolsSettings = {
  enabled: true,
  allowMods: false,
};

const mutexes = new Map<string, Promise<unknown>>();

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

function settingsPath(opts: StreamToolsStoreOptions, channelKey: string): string {
  return path.join(opts.baseDir, safeFileName(channelKey));
}

async function readStored(
  opts: StreamToolsStoreOptions,
  channelKey: string,
): Promise<StoredSettings | null> {
  try {
    const raw = await fs.readFile(settingsPath(opts, channelKey), "utf8");
    const parsed = JSON.parse(raw) as Partial<StoredSettings>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      fileVersion: FILE_VERSION,
      channelKey: normalizeChannelKey(channelKey),
      enabled:
        typeof parsed.enabled === "boolean"
          ? parsed.enabled
          : DEFAULT_STREAM_TOOLS_SETTINGS.enabled,
      allowMods:
        typeof parsed.allowMods === "boolean"
          ? parsed.allowMods
          : DEFAULT_STREAM_TOOLS_SETTINGS.allowMods,
      updatedAt:
        typeof parsed.updatedAt === "string"
          ? parsed.updatedAt
          : new Date(0).toISOString(),
    };
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "ENOENT"
    ) {
      return null;
    }
    throw err;
  }
}

async function writeStored(
  opts: StreamToolsStoreOptions,
  settings: StoredSettings,
): Promise<void> {
  await fs.mkdir(opts.baseDir, { recursive: true });
  const target = settingsPath(opts, settings.channelKey);
  const tmp = `${target}.${randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(settings, null, 2), "utf8");
  await fs.rename(tmp, target);
}

export async function getStreamToolsSettings(
  opts: StreamToolsStoreOptions,
  channelKey: string,
): Promise<StreamToolsSettings> {
  const stored = await readStored(opts, channelKey);
  if (!stored) return { ...DEFAULT_STREAM_TOOLS_SETTINGS };
  return { enabled: stored.enabled, allowMods: stored.allowMods };
}

export async function updateStreamToolsSettings(
  opts: StreamToolsStoreOptions,
  channelKey: string,
  patch: Partial<StreamToolsSettings>,
): Promise<StreamToolsSettings> {
  const key = normalizeChannelKey(channelKey);
  return withLock(key, async () => {
    const current = (await readStored(opts, key)) ?? {
      fileVersion: FILE_VERSION,
      channelKey: key,
      ...DEFAULT_STREAM_TOOLS_SETTINGS,
      updatedAt: new Date(0).toISOString(),
    };
    const next: StoredSettings = {
      ...current,
      enabled:
        typeof patch.enabled === "boolean" ? patch.enabled : current.enabled,
      allowMods:
        typeof patch.allowMods === "boolean"
          ? patch.allowMods
          : current.allowMods,
      updatedAt: new Date().toISOString(),
    };
    await writeStored(opts, next);
    return { enabled: next.enabled, allowMods: next.allowMods };
  });
}
