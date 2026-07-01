/**
 * Thin client-side fetch helpers for the Song Queue REST API.
 *
 * The streamer-side React app uses these to drive the queue. Public
 * listeners (the Astro page) call the same endpoints but in a different
 * page context.
 */

import type {
  SongQueueItem,
  SongQueueItemStatus,
  SongQueueOwnerBootstrap,
  SongQueuePublicView,
  SongQueueSession,
  SongQueueSubmitter,
} from "./types";

export class SongQueueApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "SongQueueApiError";
  }
}

function baseHeaders(token?: string): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function handle<T>(res: Response): Promise<T> {
  if (res.ok) {
    return (await res.json()) as T;
  }
  let body: { error?: string; code?: string } = {};
  try {
    body = (await res.json()) as { error?: string; code?: string };
  } catch {
    // ignore
  }
  throw new SongQueueApiError(
    res.status,
    body.error || `Request failed (${res.status})`,
    body.code,
  );
}

export async function createSongQueue(
  input: { title?: string; isPublic?: boolean; channelName?: string; channelPlatform?: string } = {},
): Promise<SongQueueOwnerBootstrap> {
  const res = await fetch("/api/song-queue", {
    method: "POST",
    headers: baseHeaders(),
    body: JSON.stringify(input),
  });
  return handle<SongQueueOwnerBootstrap>(res);
}

export async function getSongQueue(
  sessionId: string,
  ownerToken: string,
): Promise<SongQueueSession> {
  const res = await fetch(`/api/song-queue/${encodeURIComponent(sessionId)}`, {
    headers: baseHeaders(ownerToken),
  });
  return handle<SongQueueSession>(res);
}

export async function closeSongQueue(
  sessionId: string,
  ownerToken: string,
): Promise<void> {
  const res = await fetch(`/api/song-queue/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
    headers: baseHeaders(ownerToken),
  });
  if (!res.ok) await handle(res);
}

export async function patchSongQueue(
  sessionId: string,
  ownerToken: string,
  patch: { isPublic?: boolean },
): Promise<SongQueueSession> {
  const res = await fetch(`/api/song-queue/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    headers: baseHeaders(ownerToken),
    body: JSON.stringify(patch),
  });
  return handle<SongQueueSession>(res);
}

export async function appendSongQueueItem(
  sessionId: string,
  ownerToken: string,
  input: { videoId: string; submitter: SongQueueSubmitter; maxQueueLength?: number },
): Promise<SongQueueItem> {
  const res = await fetch(
    `/api/song-queue/${encodeURIComponent(sessionId)}/items`,
    {
      method: "POST",
      headers: baseHeaders(ownerToken),
      body: JSON.stringify(input),
    },
  );
  return handle<SongQueueItem>(res);
}

export async function updateSongQueueItem(
  sessionId: string,
  ownerToken: string,
  itemId: string,
  patch: { status?: SongQueueItemStatus; position?: number },
): Promise<SongQueueItem> {
  const res = await fetch(
    `/api/song-queue/${encodeURIComponent(sessionId)}/items/${encodeURIComponent(itemId)}`,
    {
      method: "PATCH",
      headers: baseHeaders(ownerToken),
      body: JSON.stringify(patch),
    },
  );
  const body = (await handle<{ item: SongQueueItem }>(res));
  return body.item;
}

export async function removeSongQueueItem(
  sessionId: string,
  ownerToken: string,
  itemId: string,
): Promise<void> {
  const res = await fetch(
    `/api/song-queue/${encodeURIComponent(sessionId)}/items/${encodeURIComponent(itemId)}`,
    {
      method: "DELETE",
      headers: baseHeaders(ownerToken),
    },
  );
  if (!res.ok) await handle(res);
}

export async function setSongQueueIndex(
  sessionId: string,
  ownerToken: string,
  currentIndex: number,
  extra: { durationSec?: number; status?: "playing" | "played" | "skipped" } = {},
): Promise<void> {
  const res = await fetch(
    `/api/song-queue/${encodeURIComponent(sessionId)}/play`,
    {
      method: "POST",
      headers: baseHeaders(ownerToken),
      body: JSON.stringify({ currentIndex, ...extra }),
    },
  );
  if (!res.ok) await handle(res);
}

export async function getPublicSongQueue(
  sessionId: string,
): Promise<SongQueuePublicView> {
  const res = await fetch(
    `/api/song-queue/${encodeURIComponent(sessionId)}/public`,
  );
  return handle<SongQueuePublicView>(res);
}
