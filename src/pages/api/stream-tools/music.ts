import type { APIRoute } from "astro";
import { parseChannelKey } from "../../../lib/wheel/api";
import { checkRateLimit } from "../../../lib/rateLimit";
import {
  DEFAULT_MUSIC_PLAYER_SETTINGS,
  MAX_PLAYLISTS,
  MAX_TRACKS_PER_PLAYLIST,
  type MusicPlaylist,
  type MusicPlayerSettings,
} from "../../../lib/musicPlayer/types";
import type { SharedMusicState } from "../../../lib/streamTools/state";
import { clientAddress, json } from "../../../server/wheelApi";
import { authorizeChannel } from "../../../server/wheelAuth";
import { getStreamToolsStoreOptions } from "../../../server/streamToolsConfig";
import {
  getStreamToolsState,
  mutateStreamToolsState,
} from "../../../server/streamToolsState";

interface MusicBody {
  channelKey?: string;
  version?: number;
  music?: unknown;
}

type AccessResult = { error: Response } | { key: string };

async function authorize(
  cookies: Parameters<typeof authorizeChannel>[0],
  channelKey: string | null | undefined,
): Promise<AccessResult> {
  const channel = parseChannelKey(channelKey ?? null);
  if (!channel) return { error: json({ error: "Missing channel" }, 400) };
  const auth = await authorizeChannel(cookies, channel, {
    allowModerators: true,
  });
  if (auth === "unauthenticated") {
    return { error: json({ error: "Not authenticated" }, 401) };
  }
  if (auth !== "ok") return { error: json({ error: "Forbidden" }, 403) };
  return {
    key: `${channel.channelPlatform}:${channel.channelName.toLowerCase()}`,
  };
}

function sanitizeMusic(value: unknown): SharedMusicState | null {
  if (!value || typeof value !== "object") return null;
  const music = value as Partial<SharedMusicState>;
  if (!Array.isArray(music.playlists)) return null;
  const playlists: MusicPlaylist[] = [];
  for (const raw of music.playlists.slice(0, MAX_PLAYLISTS)) {
    if (!raw || typeof raw !== "object") return null;
    const p = raw as Partial<MusicPlaylist>;
    if (
      typeof p.id !== "string" ||
      typeof p.name !== "string" ||
      !Array.isArray(p.items)
    ) {
      return null;
    }
    const items = p.items.slice(0, MAX_TRACKS_PER_PLAYLIST).filter((it) => {
      return (
        it &&
        typeof it === "object" &&
        typeof it.id === "string" &&
        typeof it.videoId === "string" &&
        typeof it.title === "string"
      );
    });
    playlists.push({
      id: p.id,
      name: p.name.slice(0, 80),
      items,
      createdAt:
        typeof p.createdAt === "string"
          ? p.createdAt
          : new Date().toISOString(),
      updatedAt:
        typeof p.updatedAt === "string"
          ? p.updatedAt
          : new Date().toISOString(),
      categoryId: typeof p.categoryId === "string" ? p.categoryId : null,
      categoryName:
        typeof p.categoryName === "string" ? p.categoryName.slice(0, 200) : "",
    });
  }

  const rawSettings =
    music.settings && typeof music.settings === "object"
      ? (music.settings as Partial<MusicPlayerSettings>)
      : {};
  const settings: MusicPlayerSettings = {
    activePlaylistId:
      typeof rawSettings.activePlaylistId === "string" ||
      rawSettings.activePlaylistId === null
        ? rawSettings.activePlaylistId
        : DEFAULT_MUSIC_PLAYER_SETTINGS.activePlaylistId,
    currentIndex:
      typeof rawSettings.currentIndex === "number" &&
      Number.isFinite(rawSettings.currentIndex)
        ? Math.max(0, Math.floor(rawSettings.currentIndex))
        : 0,
    volume:
      typeof rawSettings.volume === "number" && Number.isFinite(rawSettings.volume)
        ? Math.max(0, Math.min(100, Math.round(rawSettings.volume)))
        : DEFAULT_MUSIC_PLAYER_SETTINGS.volume,
    loop:
      typeof rawSettings.loop === "boolean"
        ? rawSettings.loop
        : DEFAULT_MUSIC_PLAYER_SETTINGS.loop,
    miniBarHidden:
      typeof rawSettings.miniBarHidden === "boolean"
        ? rawSettings.miniBarHidden
        : DEFAULT_MUSIC_PLAYER_SETTINGS.miniBarHidden,
  };

  return {
    playlists,
    settings,
    isPlaying: Boolean(music.isPlaying),
  };
}

export const GET: APIRoute = async ({ request, cookies }) => {
  if (
    !checkRateLimit(
      `${clientAddress(request)}:stream-tools-music-read`,
      180,
      60_000,
    )
  ) {
    return json({ error: "Too many requests" }, 429, { "Retry-After": "60" });
  }
  const channelKey = new URL(request.url).searchParams.get("channelKey");
  const access = await authorize(cookies, channelKey);
  if ("error" in access) return access.error;
  const state = await getStreamToolsState(getStreamToolsStoreOptions(), access.key);
  return json({ version: state.version, music: state.music });
};

export const PUT: APIRoute = async ({ request, cookies }) => {
  if (
    !checkRateLimit(
      `${clientAddress(request)}:stream-tools-music-write`,
      120,
      60_000,
    )
  ) {
    return json({ error: "Too many requests" }, 429, { "Retry-After": "60" });
  }
  let body: MusicBody;
  try {
    body = (await request.json()) as MusicBody;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!body || typeof body !== "object") {
    return json({ error: "Invalid body" }, 400);
  }
  const access = await authorize(cookies, body.channelKey);
  if ("error" in access) return access.error;
  const music = sanitizeMusic(body.music);
  if (!music) return json({ error: "Invalid music state" }, 400);
  const opts = getStreamToolsStoreOptions();
  const current = await getStreamToolsState(opts, access.key);
  if (typeof body.version !== "number" || body.version !== current.version) {
    return json(
      { error: "State changed", version: current.version, music: current.music },
      409,
    );
  }
  await mutateStreamToolsState(opts, access.key, (state) => {
    state.music = music;
  });
  const next = await getStreamToolsState(opts, access.key);
  return json({ version: next.version, music: next.music });
};
