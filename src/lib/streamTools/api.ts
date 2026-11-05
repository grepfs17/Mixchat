import type { GiveawayEntry } from "../streamerTools/giveaway";
import type { SharedGiveawayState } from "./state";

async function parseError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body?.error || fallback;
  } catch {
    return fallback;
  }
}

export async function getSharedGiveaway(
  channelKey: string,
): Promise<{ version: number; giveaway: SharedGiveawayState }> {
  const params = new URLSearchParams({ channelKey });
  const res = await fetch(`/api/stream-tools/giveaway?${params.toString()}`);
  if (!res.ok) throw new Error(await parseError(res, "Failed to load giveaway"));
  return (await res.json()) as {
    version: number;
    giveaway: SharedGiveawayState;
  };
}

export async function giveawayAction<T = unknown>(
  channelKey: string,
  action: string,
  payload: Record<string, unknown> = {},
): Promise<{
  version: number;
  giveaway: SharedGiveawayState;
  claimedWinner?: GiveawayEntry | null;
}> {
  const res = await fetch("/api/stream-tools/giveaway", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channelKey, action, ...payload }),
  });
  if (!res.ok) throw new Error(await parseError(res, "Giveaway action failed"));
  return (await res.json()) as {
    version: number;
    giveaway: SharedGiveawayState;
  } & T;
}

export async function ingestSharedGiveawayEntry(
  channelKey: string,
  entry: GiveawayEntry,
): Promise<void> {
  await giveawayAction(channelKey, "ingest", { entry });
}

export async function getSharedMusic(
  channelKey: string,
): Promise<{ version: number; music: import("./state").SharedMusicState }> {
  const params = new URLSearchParams({ channelKey });
  const res = await fetch(`/api/stream-tools/music?${params.toString()}`);
  if (!res.ok) throw new Error(await parseError(res, "Failed to load music state"));
  return (await res.json()) as {
    version: number;
    music: import("./state").SharedMusicState;
  };
}

export async function putSharedMusic(
  channelKey: string,
  version: number,
  music: import("./state").SharedMusicState,
): Promise<
  | { ok: true; version: number; music: import("./state").SharedMusicState }
  | { ok: false; version: number; music: import("./state").SharedMusicState }
> {
  const res = await fetch("/api/stream-tools/music", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channelKey, version, music }),
  });
  if (res.status === 409) {
    const body = (await res.json()) as {
      version: number;
      music: import("./state").SharedMusicState;
    };
    return { ok: false, version: body.version, music: body.music };
  }
  if (!res.ok) throw new Error(await parseError(res, "Failed to save music state"));
  const body = (await res.json()) as {
    version: number;
    music: import("./state").SharedMusicState;
  };
  return { ok: true, version: body.version, music: body.music };
}
