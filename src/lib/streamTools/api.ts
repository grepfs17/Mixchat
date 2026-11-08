import type { PollState } from "../../components/chat/shared/bannerTypes";
import type { GiveawayEntry } from "../streamerTools/giveaway";
import type { GiveawayHistoryEntry } from "../streamerTools/history";
import type {
  PollRelayCommand,
  PollRelayState,
} from "./pollRelay";
import type { SharedGiveawayState } from "./state";

async function parseError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body?.error || fallback;
  } catch {
    return fallback;
  }
}

export interface SharedGiveawayResponse {
  version: number;
  giveaway: SharedGiveawayState;
  history?: GiveawayHistoryEntry[];
}

export interface PollRelayResponse extends PollRelayState {
  claimed?: PollRelayCommand | null;
}

function parsePollState(value: unknown): PollState | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<PollState>;
  if (typeof raw.id !== "string" || typeof raw.title !== "string") return null;
  if (!Array.isArray(raw.choices)) return null;
  const endsAt = new Date(raw.endsAt as string | number | Date);
  if (Number.isNaN(endsAt.getTime())) return null;
  return {
    id: raw.id,
    title: raw.title,
    choices: raw.choices.map((choice) => ({
      id: String(choice.id),
      title: String(choice.title),
      votes: Number(choice.votes) || 0,
    })),
    totalVotes: Number(raw.totalVotes) || 0,
    endsAt,
    ...(typeof raw.status === "string" ? { status: raw.status } : {}),
  };
}

function parsePollRelay(value: unknown): PollRelayResponse {
  if (!value || typeof value !== "object") {
    return { poll: null, command: null, updatedAt: 0 };
  }
  const raw = value as Partial<PollRelayState> & {
    claimed?: PollRelayCommand | null;
  };
  return {
    poll: parsePollState(raw.poll),
    command: raw.command ?? null,
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0,
    ...(raw.claimed !== undefined ? { claimed: raw.claimed } : {}),
  };
}

export async function getPollRelay(
  channelKey: string,
): Promise<PollRelayResponse> {
  const params = new URLSearchParams({ channelKey });
  const res = await fetch(`/api/stream-tools/poll?${params.toString()}`);
  if (!res.ok) {
    throw new Error(await parseError(res, "Failed to load poll relay"));
  }
  return parsePollRelay(await res.json());
}

export async function pollRelayAction(
  channelKey: string,
  action: string,
  payload: Record<string, unknown> = {},
): Promise<PollRelayResponse> {
  const res = await fetch("/api/stream-tools/poll", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channelKey, action, ...payload }),
  });
  if (!res.ok) {
    throw new Error(await parseError(res, "Poll relay action failed"));
  }
  return parsePollRelay(await res.json());
}

export async function getSharedGiveaway(
  channelKey: string,
): Promise<SharedGiveawayResponse> {
  const params = new URLSearchParams({ channelKey });
  const res = await fetch(`/api/stream-tools/giveaway?${params.toString()}`);
  if (!res.ok) throw new Error(await parseError(res, "Failed to load giveaway"));
  return (await res.json()) as SharedGiveawayResponse;
}

export async function giveawayAction<T = unknown>(
  channelKey: string,
  action: string,
  payload: Record<string, unknown> = {},
): Promise<
  SharedGiveawayResponse & {
    claimedWinner?: GiveawayEntry | null;
  }
> {
  const res = await fetch("/api/stream-tools/giveaway", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channelKey, action, ...payload }),
  });
  if (!res.ok) throw new Error(await parseError(res, "Giveaway action failed"));
  return (await res.json()) as SharedGiveawayResponse & {
    claimedWinner?: GiveawayEntry | null;
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

export type StreamToolsRole = "owner" | "moderator" | "none";

/**
 * Who the current visitor is for a channel: the broadcaster, a moderator the
 * broadcaster allowed, or neither. Tool pages use this to gate actions that
 * only the streamer may perform.
 */
export async function fetchStreamToolsAccess(
  channelKey: string,
): Promise<StreamToolsRole> {
  const params = new URLSearchParams({ channelKey });
  const res = await fetch(`/api/stream-tools/access?${params.toString()}`);
  if (!res.ok) throw new Error(await parseError(res, "Failed to check access"));
  const body = (await res.json()) as { role?: StreamToolsRole };
  return body.role ?? "none";
}
