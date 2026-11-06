/**
 * Client-side REST wrapper around `/api/wheel`. Owner-token persistence lives
 * in `./tokenStore`.
 */
import type {
  WheelHistoryEntry,
  WheelOwnerBootstrap,
  WheelPublicView,
  WheelSummary,
} from "./types";

interface ChannelParts {
  channelName: string;
  channelPlatform: string;
}

/** Splits a `platform:name` channel key (e.g. `twitch:alice`). */
export function parseChannelKey(channelKey: string | null): ChannelParts | null {
  if (!channelKey) return null;
  const idx = channelKey.indexOf(":");
  if (idx <= 0 || idx === channelKey.length - 1) return null;
  const channelPlatform = channelKey.slice(0, idx).trim().toLowerCase();
  const channelName = channelKey.slice(idx + 1).trim();
  if (!channelName || (channelPlatform !== "twitch" && channelPlatform !== "youtube")) {
    return null;
  }
  return { channelName, channelPlatform };
}

async function parseError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body?.error || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Carries the HTTP status (and `Retry-After`, when the server sends it) so
 * callers can react to throttling instead of retrying on a fixed cadence.
 */
export class WheelApiError extends Error {
  readonly status: number;
  readonly retryAfterSec: number | null;

  constructor(
    message: string,
    status: number,
    retryAfterSec: number | null = null,
  ) {
    super(message);
    this.name = "WheelApiError";
    this.status = status;
    this.retryAfterSec = retryAfterSec;
  }
}

function readRetryAfter(res: Response): number | null {
  const raw = res.headers.get("Retry-After");
  if (!raw) return null;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

async function apiError(res: Response, fallback: string): Promise<WheelApiError> {
  return new WheelApiError(
    await parseError(res, fallback),
    res.status,
    readRetryAfter(res),
  );
}

export async function listWheels(channelKey: string): Promise<WheelSummary[]> {
  const params = new URLSearchParams({ channelKey });
  const res = await fetch(`/api/wheel?${params.toString()}`);
  if (!res.ok) throw await apiError(res, "Failed to load wheels");
  const body = (await res.json()) as { wheels?: WheelSummary[] };
  return Array.isArray(body.wheels) ? body.wheels : [];
}

export async function createWheel(input: {
  channelKey: string;
  name?: string;
  options?: string[];
  allowDuplicates?: boolean;
}): Promise<WheelOwnerBootstrap> {
  const res = await fetch("/api/wheel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await apiError(res, "Failed to create wheel");
  return (await res.json()) as WheelOwnerBootstrap;
}

export async function fetchWheel(
  wheelId: string,
  ownerToken?: string | null,
  channelKey?: string | null,
): Promise<WheelPublicView> {
  const params = new URLSearchParams();
  if (channelKey) params.set("channelKey", channelKey);
  const headers: Record<string, string> = {};
  if (ownerToken) headers.Authorization = `Bearer ${ownerToken}`;
  const res = await fetch(
    `/api/wheel/${encodeURIComponent(wheelId)}?${params.toString()}`,
    { headers },
  );
  if (res.status === 404) throw new WheelApiError("Wheel not found", 404);
  if (!res.ok) throw await apiError(res, "Failed to load wheel");
  const body = (await res.json()) as { wheel: WheelPublicView };
  return body.wheel;
}

export interface WheelPatch {
  name?: string;
  options?: string[];
  isPublic?: boolean;
  /** Repeated options may occupy several slices instead of being dropped. */
  allowDuplicates?: boolean;
  /** Prepend a winner to the wheel's server-side history. */
  addHistory?: WheelHistoryEntry;
  /** Drop every stored winner. */
  clearHistory?: boolean;
}

export async function updateWheel(
  wheelId: string,
  patch: WheelPatch,
  auth: { ownerToken?: string | null; channelKey?: string | null },
): Promise<WheelPublicView> {
  const params = new URLSearchParams();
  if (auth.channelKey) params.set("channelKey", auth.channelKey);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth.ownerToken) headers.Authorization = `Bearer ${auth.ownerToken}`;
  const res = await fetch(
    `/api/wheel/${encodeURIComponent(wheelId)}?${params.toString()}`,
    { method: "PATCH", headers, body: JSON.stringify(patch) },
  );
  if (!res.ok) throw await apiError(res, "Failed to update wheel");
  const body = (await res.json()) as { wheel: WheelPublicView };
  return body.wheel;
}

export async function deleteWheel(
  wheelId: string,
  auth: { ownerToken?: string | null; channelKey?: string | null },
): Promise<void> {
  const params = new URLSearchParams();
  if (auth.channelKey) params.set("channelKey", auth.channelKey);
  const headers: Record<string, string> = {
    "X-HTTP-Method-Override": "DELETE",
  };
  if (auth.ownerToken) headers.Authorization = `Bearer ${auth.ownerToken}`;
  // POST + method override: Astro's CSRF guard rejects cross-site `DELETE`
  // verb submissions, matching the Song Queue client's approach.
  const res = await fetch(
    `/api/wheel/${encodeURIComponent(wheelId)}?${params.toString()}`,
    { method: "POST", headers },
  );
  if (!res.ok) throw await apiError(res, "Failed to delete wheel");
}
