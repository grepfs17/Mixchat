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

/**
 * `all` grants every Twitch moderator of the channel, `selected` only the
 * entries listed in `allowedMods`.
 */
export type StreamToolsModAccess = "all" | "selected";

/**
 * One moderator grant. The user id is what access checks match on, so a
 * renamed login cannot move a grant to someone else; the login is kept only
 * to render the selection back to the streamer.
 */
export interface AllowedMod {
  id: string;
  login: string;
}

export interface StreamToolsSettings {
  enabled: boolean;
  allowMods: boolean;
  modAccess: StreamToolsModAccess;
  /** Grants, only used when `modAccess` is `selected`. */
  allowedMods: AllowedMod[];
}

interface StoredSettings extends StreamToolsSettings {
  fileVersion: number;
  channelKey: string;
  updatedAt: string;
}

/** Upper bound on stored grants, so one write cannot bloat the settings file. */
export const MAX_ALLOWED_MODS = 500;
/** Upper bound on a stored user id or login. */
export const MAX_MOD_FIELD_LENGTH = 64;

const FILE_VERSION = 2;
export const DEFAULT_STREAM_TOOLS_SETTINGS: StreamToolsSettings = {
  enabled: true,
  allowMods: false,
  modAccess: "all",
  allowedMods: [],
};

function normalizeModAccess(value: unknown): StreamToolsModAccess {
  return value === "selected" ? "selected" : "all";
}

function normalizeAllowedMods(value: unknown): AllowedMod[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const mods: AllowedMod[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    if (!id || id.length > MAX_MOD_FIELD_LENGTH || seen.has(id)) continue;
    seen.add(id);
    const login = typeof raw.login === "string" ? raw.login.trim() : "";
    mods.push({
      id,
      login: login.toLowerCase().slice(0, MAX_MOD_FIELD_LENGTH),
    });
    if (mods.length >= MAX_ALLOWED_MODS) break;
  }
  return mods;
}

/**
 * Shape check for a grant arriving over the API. The store truncates on read;
 * writes are rejected outright so the streamer sees what was refused.
 */
export function isAllowedModEntry(value: unknown): value is AllowedMod {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    entry.id.trim().length > 0 &&
    entry.id.length <= MAX_MOD_FIELD_LENGTH &&
    (entry.login === undefined ||
      (typeof entry.login === "string" &&
        entry.login.length <= MAX_MOD_FIELD_LENGTH))
  );
}

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
      modAccess: normalizeModAccess(parsed.modAccess),
      allowedMods: normalizeAllowedMods(parsed.allowedMods),
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
  const source = stored ?? DEFAULT_STREAM_TOOLS_SETTINGS;
  return {
    enabled: source.enabled,
    allowMods: source.allowMods,
    modAccess: source.modAccess,
    // Copy so callers can never mutate the shared defaults or the parse result.
    allowedMods: [...source.allowedMods],
  };
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
      allowedMods: [],
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
      modAccess:
        patch.modAccess === "all" || patch.modAccess === "selected"
          ? patch.modAccess
          : current.modAccess,
      allowedMods: Array.isArray(patch.allowedMods)
        ? normalizeAllowedMods(patch.allowedMods)
        : current.allowedMods,
      updatedAt: new Date().toISOString(),
    };
    await writeStored(opts, next);
    return {
      enabled: next.enabled,
      allowMods: next.allowMods,
      modAccess: next.modAccess,
      allowedMods: next.allowedMods,
    };
  });
}
