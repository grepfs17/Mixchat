/**
 * Server-side JSON store for Song Queue sessions.
 *
 * Persistence model:
 * - One file per session at `{baseDir}/{sessionId}.json`.
 * - Writes go through a temp file + atomic rename.
 * - In-process per-session mutex serialises mutations to prevent lost
 *   writes. Multi-process deployments would need a different strategy.
 * - Public reads return a stripped-down projection that omits `userId` and
 *   `ownerTokenHash`.
 *
 * Test mode: pass `baseDir` to point the store at a temp directory.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import {
  type SongQueueItem,
  type SongQueueOwnerBootstrap,
  type SongQueuePublicView,
  type SongQueueSession,
  type SongQueueSubmitter,
} from "../lib/songQueue/types";

export interface SongQueueStoreOptions {
  baseDir: string;
}

export type SongQueueReadResult =
  | { kind: "ok"; session: SongQueueSession }
  | { kind: "missing" }
  | { kind: "ended"; session: SongQueueSession };

const FILE_VERSION = 1;
const SESSION_ID_LEN = 24;
const OWNER_TOKEN_BYTES = 32;
const SESSION_ID_ALPHABET =
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

function sessionPath(baseDir: string, sessionId: string): string {
  return path.join(baseDir, `${sessionId}.json`);
}

// ---- Per-session write mutex ----
const mutexes = new Map<string, Promise<unknown>>();

async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = mutexes.get(key) || Promise.resolve();
  let release: () => void = () => {};
  const next = new Promise<void>((resolve) => (release = resolve));
  mutexes.set(
    key,
    prev.then(() => next),
  );
  try {
    await prev;
    return await fn();
  } finally {
    release();
    if (mutexes.get(key) === prev.then(() => next)) {
      mutexes.delete(key);
    }
  }
}

// ---- Read / write helpers ----
async function ensureDir(baseDir: string): Promise<void> {
  await fs.mkdir(baseDir, { recursive: true });
}

async function readSession(
  baseDir: string,
  sessionId: string,
): Promise<SongQueueSession | null> {
  try {
    const raw = await fs.readFile(sessionPath(baseDir, sessionId), "utf8");
    const parsed = JSON.parse(raw) as SongQueueSession;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.items)) {
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

async function writeSession(
  baseDir: string,
  session: SongQueueSession,
): Promise<void> {
  await ensureDir(baseDir);
  const target = sessionPath(baseDir, session.sessionId);
  const tmp = `${target}.${randomBytes(4).toString("hex")}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(session, null, 2), "utf8");
  await fs.rename(tmp, target);
}

// ---- Public API ----

export async function createSession(
  opts: SongQueueStoreOptions,
  input: { title?: string; isPublic?: boolean; channelName?: string; channelPlatform?: string } = {},
): Promise<SongQueueOwnerBootstrap> {
  await ensureDir(opts.baseDir);
  const sessionId = genId(SESSION_ID_LEN, SESSION_ID_ALPHABET);
  const ownerToken = genId(OWNER_TOKEN_BYTES * 2, SESSION_ID_ALPHABET);
  const now = new Date().toISOString();
  const session: SongQueueSession = {
    sessionId,
    title: input.title?.trim() || "",
    channelName: input.channelName?.trim() || "",
    channelPlatform: input.channelPlatform?.trim() || "",
    ownerTokenHash: hashToken(ownerToken),
    createdAt: now,
    lastSeenAt: now,
    isPublic: Boolean(input.isPublic),
    currentIndex: 0,
    version: 0,
    ended: false,
    items: [],
  };
  await withLock(sessionId, () => writeSession(opts.baseDir, session));
  return {
    sessionId,
    ownerToken,
    isPublic: session.isPublic,
    publicUrl: `/s/${sessionId}`,
    title: session.title,
    channelName: session.channelName,
    channelPlatform: session.channelPlatform,
    createdAt: session.createdAt,
  };
}

export async function getSession(
  opts: SongQueueStoreOptions,
  sessionId: string,
): Promise<SongQueueSession | null> {
  return readSession(opts.baseDir, sessionId);
}

/**
 * Owner-only: verify the bearer token matches the stored hash, then update
 * `lastSeenAt` (heartbeat) and run the mutator. Returns the updated session.
 */
export async function mutateSession<T>(
  opts: SongQueueStoreOptions,
  sessionId: string,
  ownerToken: string,
  fn: (session: SongQueueSession) => { session: SongQueueSession; result: T } | Promise<{ session: SongQueueSession; result: T }>,
): Promise<{ ok: true; result: T; session: SongQueueSession } | { ok: false; reason: "missing" | "auth" | "ended" }> {
  return withLock(sessionId, async () => {
    const session = await readSession(opts.baseDir, sessionId);
    if (!session) return { ok: false, reason: "missing" };
    if (hashToken(ownerToken) !== session.ownerTokenHash) {
      return { ok: false, reason: "auth" };
    }
    if (session.ended) return { ok: false, reason: "ended" };
    const next = await fn({
      ...session,
      lastSeenAt: new Date().toISOString(),
    });
    next.session.version = (session.version ?? 0) + 1;
    await writeSession(opts.baseDir, next.session);
    return { ok: true, result: next.result, session: next.session };
  });
}

export async function readSessionWithToken(
  opts: SongQueueStoreOptions,
  sessionId: string,
  ownerToken: string,
): Promise<SongQueueReadResult> {
  const session = await readSession(opts.baseDir, sessionId);
  if (!session) return { kind: "missing" };
  if (hashToken(ownerToken) !== session.ownerTokenHash) {
    return { kind: "missing" };
  }
  if (session.ended) return { kind: "ended", session };
  return { kind: "ok", session };
}

export function publicView(session: SongQueueSession): SongQueuePublicView {
  return {
    title: session.title,
    channelName: session.channelName || "",
    channelPlatform: session.channelPlatform || "",
    currentIndex: session.currentIndex,
    version: session.version ?? 0,
    ended: Boolean(session.ended),
    createdAt: session.createdAt,
    items: session.items.map((item) => ({
      id: item.id,
      videoId: item.videoId,
      title: item.title,
      channelTitle: item.channelTitle,
      thumbnail: item.thumbnail,
      status: item.status,
      submittedAt: item.submittedAt,
      durationSec: item.durationSec,
      submitter: {
        author: item.submitter.author,
        platform: item.submitter.platform,
      },
    })),
  };
}

export async function readPublic(
  opts: SongQueueStoreOptions,
  sessionId: string,
): Promise<SongQueuePublicView | null> {
  const session = await readSession(opts.baseDir, sessionId);
  if (!session) return null;
  if (!session.isPublic) return null;
  return publicView(session);
}

export function newItemId(): string {
  return genId(16, SESSION_ID_ALPHABET);
}

export function makeItem(input: {
  id: string;
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  submitter: SongQueueSubmitter;
  submittedAt: string;
}): SongQueueItem {
  return {
    id: input.id,
    videoId: input.videoId,
    title: input.title,
    channelTitle: input.channelTitle,
    thumbnail: input.thumbnail,
    durationSec: 0,
    submitter: input.submitter,
    submittedAt: input.submittedAt,
    status: "pending",
  };
}

/**
 * Garbage-collect sessions that have not been seen for the given number of
 * days. Returns the number of sessions removed.
 */
export async function gcSessions(
  opts: SongQueueStoreOptions,
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
    const sessionId = entry.slice(0, -".json".length);
    const session = await readSession(opts.baseDir, sessionId);
    if (!session) continue;
    if (new Date(session.lastSeenAt).getTime() > cutoff) continue;
    try {
      await fs.unlink(sessionPath(opts.baseDir, sessionId));
      removed += 1;
    } catch {
      // Best-effort; another process may have already removed it.
    }
  }
  return removed;
}

export { FILE_VERSION };
