/**
 * Client-side REST wrapper around `/api/wheel`. Owner-token persistence lives
 * in `./tokenStore`.
 */
import type {
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

export async function listWheels(channelKey: string): Promise<WheelSummary[]> {
  const params = new URLSearchParams({ channelKey });
  const res = await fetch(`/api/wheel?${params.toString()}`);
  if (!res.ok) throw new Error(await parseError(res, "Failed to load wheels"));
  const body = (await res.json()) as { wheels?: WheelSummary[] };
  return Array.isArray(body.wheels) ? body.wheels : [];
}

export async function createWheel(input: {
  channelKey: string;
  name?: string;
  options?: string[];
}): Promise<WheelOwnerBootstrap> {
  const res = await fetch("/api/wheel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseError(res, "Failed to create wheel"));
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
  if (res.status === 404) throw new Error("Wheel not found");
  if (!res.ok) throw new Error(await parseError(res, "Failed to load wheel"));
  const body = (await res.json()) as { wheel: WheelPublicView };
  return body.wheel;
}

export async function updateWheel(
  wheelId: string,
  patch: { name?: string; options?: string[]; isPublic?: boolean },
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
  if (!res.ok) throw new Error(await parseError(res, "Failed to update wheel"));
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
  if (!res.ok) throw new Error(await parseError(res, "Failed to delete wheel"));
}
