/**
 * Server-side JSON store for Wheel Spin wheels.
 *
 * Mirrors `songQueueStore.ts`: one file per wheel at
 * `{baseDir}/{wheelId}.json`, temp file + atomic rename, and an in-process
 * per-wheel mutex to prevent lost writes. Public reads omit `ownerTokenHash`.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import {
  DEFAULT_WHEEL_OPTIONS,
  MAX_WHEEL_NAME_LENGTH,
  WHEEL_ID_LENGTH,
  sanitizeWheelOptions,
  type WheelOwnerBootstrap,
  type WheelPublicView,
  type WheelRecord,
  type WheelSummary,
} from "../lib/wheel/types";

export interface WheelStoreOptions {
  baseDir: string;
}

const FILE_VERSION = 1;
const OWNER_TOKEN_BYTES = 32;
const ID_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function genId(len: number, alphabet: string): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function wheelPath(baseDir: string, wheelId: string): string {
  return path.join(baseDir, `${wheelId}.json`);
}

function normalizeChannel(name?: string, platform?: string): { name: string; platform: string } {
  return {
    name: (name || "").trim().toLowerCase(),
    platform: (platform || "").trim().toLowerCase(),
  };
}

function channelMatches(
  wheel: WheelRecord,
  channel: { channelName: string; channelPlatform: string },
): boolean {
  const want = normalizeChannel(channel.channelName, channel.channelPlatform);
  return (
    (wheel.channelName || "").trim().toLowerCase() === want.name &&
    (wheel.channelPlatform || "").trim().toLowerCase() === want.platform
  );
}

// ---- Per-wheel write mutex ----
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
    if (mutexes.get(key) === chain) {
      mutexes.delete(key);
    }
  }
}

async function ensureDir(baseDir: string): Promise<void> {
  await fs.mkdir(baseDir, { recursive: true });
}

async function readWheel(
  baseDir: string,
  wheelId: string,
): Promise<WheelRecord | null> {
  try {
    const raw = await fs.readFile(wheelPath(baseDir, wheelId), "utf8");
    const parsed = JSON.parse(raw) as WheelRecord & { fileVersion?: number };
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.options)) {
      return null;
    }
    return parsed;
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

async function writeWheel(baseDir: string, wheel: WheelRecord): Promise<void> {
  await ensureDir(baseDir);
  const target = wheelPath(baseDir, wheel.id);
  const payload = { fileVersion: FILE_VERSION, ...wheel };
  const tmp = `${target}.${randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(payload, null, 2), "utf8");
  await fs.rename(tmp, target);
}

export function publicWheelView(wheel: WheelRecord): WheelPublicView {
  const view: WheelPublicView = {
    id: wheel.id,
    name: wheel.name,
    options: wheel.options,
    isPublic: Boolean(wheel.isPublic),
    channelName: wheel.channelName || "",
    channelPlatform: wheel.channelPlatform || "",
    createdAt: wheel.createdAt,
    updatedAt: wheel.updatedAt,
    version: wheel.version ?? 0,
  };
  // Keep `undefined` (rather than `[]`) for legacy wheels so clients can tell
  // "never had server history" apart from "history was cleared".
  if (wheel.history) view.history = wheel.history;
  return view;
}

function summarize(wheel: WheelRecord): WheelSummary {
  return {
    id: wheel.id,
    name: wheel.name,
    optionCount: wheel.options.length,
    isPublic: Boolean(wheel.isPublic),
    createdAt: wheel.createdAt,
    updatedAt: wheel.updatedAt,
  };
}

function sanitizeName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, MAX_WHEEL_NAME_LENGTH);
}

export async function createWheel(
  opts: WheelStoreOptions,
  input: {
    name?: string;
    options?: string[];
    channelName?: string;
    channelPlatform?: string;
    isPublic?: boolean;
  } = {},
): Promise<WheelOwnerBootstrap> {
  await ensureDir(opts.baseDir);
  const id = genId(WHEEL_ID_LENGTH, ID_ALPHABET);
  const ownerToken = genId(OWNER_TOKEN_BYTES * 2, ID_ALPHABET);
  const now = new Date().toISOString();
  const options = sanitizeWheelOptions(input.options);
  const wheel: WheelRecord = {
    id,
    name: sanitizeName(input.name) || "Untitled wheel",
    options: options.length ? options : [...DEFAULT_WHEEL_OPTIONS],
    channelName: (input.channelName || "").trim(),
    channelPlatform: (input.channelPlatform || "").trim(),
    ownerTokenHash: hashToken(ownerToken),
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
    isPublic: Boolean(input.isPublic),
    version: 0,
    history: [],
  };
  await withLock(id, () => writeWheel(opts.baseDir, wheel));
  return { id, ownerToken, wheel: publicWheelView(wheel) };
}

export async function getWheel(
  opts: WheelStoreOptions,
  wheelId: string,
): Promise<WheelRecord | null> {
  return readWheel(opts.baseDir, wheelId);
}

export async function listWheelsForChannel(
  opts: WheelStoreOptions,
  channelName: string,
  channelPlatform: string,
): Promise<WheelSummary[]> {
  const want = normalizeChannel(channelName, channelPlatform);
  if (!want.name || !want.platform) return [];
  let entries: string[];
  try {
    entries = await fs.readdir(opts.baseDir);
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "ENOENT"
    ) {
      return [];
    }
    throw err;
  }
  const jsonEntries = entries.filter((e) => e.endsWith(".json"));
  const results = await Promise.all(
    jsonEntries.map(async (e) => {
      const wheelId = e.slice(0, -".json".length);
      return readWheel(opts.baseDir, wheelId);
    }),
  );
  return results
    .filter((w): w is WheelRecord => w !== null)
    .filter(
      (w) =>
        (w.channelName || "").trim().toLowerCase() === want.name &&
        (w.channelPlatform || "").trim().toLowerCase() === want.platform,
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(summarize);
}

/**
 * Token-authenticated mutation. Returns the updated public view.
 */
export async function mutateWheel<T>(
  opts: WheelStoreOptions,
  wheelId: string,
  ownerToken: string,
  fn: (wheel: WheelRecord) => { wheel: WheelRecord; result: T } | Promise<{ wheel: WheelRecord; result: T }>,
): Promise<
  | { ok: true; result: T; wheel: WheelRecord }
  | { ok: false; reason: "missing" | "auth" }
> {
  return withLock(wheelId, async () => {
    const wheel = await readWheel(opts.baseDir, wheelId);
    if (!wheel) return { ok: false as const, reason: "missing" as const };
    if (hashToken(ownerToken) !== wheel.ownerTokenHash) {
      return { ok: false as const, reason: "auth" as const };
    }
    const now = new Date().toISOString();
    const next = await fn({ ...wheel, updatedAt: now, lastSeenAt: now });
    next.wheel.version = (wheel.version ?? 0) + 1;
    await writeWheel(opts.baseDir, next.wheel);
    return { ok: true as const, result: next.result, wheel: next.wheel };
  });
}

/**
 * Channel-trust mutation, used by the streamer's own-channel tool when the
 * per-wheel owner token is unavailable (e.g. after clearing localStorage).
 */
export async function mutateWheelByChannel<T>(
  opts: WheelStoreOptions,
  wheelId: string,
  channel: { channelName: string; channelPlatform: string },
  fn: (wheel: WheelRecord) => { wheel: WheelRecord; result: T } | Promise<{ wheel: WheelRecord; result: T }>,
): Promise<
  | { ok: true; result: T; wheel: WheelRecord }
  | { ok: false; reason: "missing" | "auth" }
> {
  return withLock(wheelId, async () => {
    const wheel = await readWheel(opts.baseDir, wheelId);
    if (!wheel) return { ok: false as const, reason: "missing" as const };
    if (!channelMatches(wheel, channel)) {
      return { ok: false as const, reason: "auth" as const };
    }
    const now = new Date().toISOString();
    const next = await fn({ ...wheel, updatedAt: now, lastSeenAt: now });
    next.wheel.version = (wheel.version ?? 0) + 1;
    await writeWheel(opts.baseDir, next.wheel);
    return { ok: true as const, result: next.result, wheel: next.wheel };
  });
}

export async function readWheelWithToken(
  opts: WheelStoreOptions,
  wheelId: string,
  ownerToken: string,
): Promise<WheelRecord | null> {
  const wheel = await readWheel(opts.baseDir, wheelId);
  if (!wheel) return null;
  if (hashToken(ownerToken) !== wheel.ownerTokenHash) return null;
  return wheel;
}

/** Read anything shareable: public wheels, or owner-readable with a token. */
export async function readReadableWheel(
  opts: WheelStoreOptions,
  wheelId: string,
  ownerToken?: string | null,
): Promise<WheelPublicView | null> {
  const wheel = await readWheel(opts.baseDir, wheelId);
  if (!wheel) return null;
  const isOwner = Boolean(ownerToken) && hashToken(ownerToken as string) === wheel.ownerTokenHash;
  if (!isOwner && !wheel.isPublic) return null;
  return publicWheelView(wheel);
}

/** Channel-trust read for the streamer's own-channel manager. */
export async function readWheelByChannel(
  opts: WheelStoreOptions,
  wheelId: string,
  channel: { channelName: string; channelPlatform: string },
): Promise<WheelPublicView | null> {
  const wheel = await readWheel(opts.baseDir, wheelId);
  if (!wheel) return null;
  if (!channelMatches(wheel, channel)) return null;
  return publicWheelView(wheel);
}

export async function deleteWheel(
  opts: WheelStoreOptions,
  wheelId: string,
  ownerToken: string,
): Promise<"ok" | "missing" | "auth"> {
  return withLock(wheelId, async () => {
    const wheel = await readWheel(opts.baseDir, wheelId);
    if (!wheel) return "missing" as const;
    if (hashToken(ownerToken) !== wheel.ownerTokenHash) return "auth" as const;
    return unlinkWheel(opts.baseDir, wheelId);
  });
}

export async function deleteWheelByChannel(
  opts: WheelStoreOptions,
  wheelId: string,
  channel: { channelName: string; channelPlatform: string },
): Promise<"ok" | "missing" | "auth"> {
  return withLock(wheelId, async () => {
    const wheel = await readWheel(opts.baseDir, wheelId);
    if (!wheel) return "missing" as const;
    if (!channelMatches(wheel, channel)) return "auth" as const;
    return unlinkWheel(opts.baseDir, wheelId);
  });
}

async function unlinkWheel(
  baseDir: string,
  wheelId: string,
): Promise<"ok" | "missing"> {
  try {
    await fs.unlink(wheelPath(baseDir, wheelId));
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "ENOENT"
    ) {
      return "missing";
    }
    throw err;
  }
  return "ok";
}

/** Garbage-collect wheels not touched for the given number of days. */
export async function gcWheels(
  opts: WheelStoreOptions,
  inactiveDays: number,
  now: Date = new Date(),
): Promise<number> {
  let removed = 0;
  let entries: string[];
  try {
    entries = await fs.readdir(opts.baseDir);
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "ENOENT"
    ) {
      return 0;
    }
    throw err;
  }
  const cutoff = now.getTime() - inactiveDays * 24 * 60 * 60 * 1000;
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    const wheelId = entry.slice(0, -".json".length);
    const wheel = await readWheel(opts.baseDir, wheelId);
    if (!wheel) continue;
    if (new Date(wheel.lastSeenAt).getTime() > cutoff) continue;
    try {
      await fs.unlink(wheelPath(opts.baseDir, wheelId));
      removed += 1;
    } catch {
      // Best effort.
    }
  }
  return removed;
}
