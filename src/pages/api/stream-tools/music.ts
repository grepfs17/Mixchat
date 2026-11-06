import type { APIRoute } from "astro";
import { parseChannelKey } from "../../../lib/wheel/api";
import { checkRateLimit } from "../../../lib/rateLimit";
import {
  DEFAULT_MUSIC_PLAYER_SETTINGS,
  MAX_PLAYLISTS,
  MAX_TRACKS_PER_PLAYLIST,
  type MusicPlaylist,
  type MusicPlayerItem,
  type MusicPlayerSettings,
} from "../../../lib/musicPlayer/types";
import type { SharedMusicState } from "../../../lib/streamTools/state";
import { clientAddress, json } from "../../../server/wheelApi";
import { authorizeChannel } from "../../../server/wheelAuth";
import { getStreamToolsStoreOptions } from "../../../server/streamToolsConfig";
import {
  getStreamToolsState,
  mutateStreamToolsStateIfVersion,
} from "../../../server/streamToolsState";
import { readJsonBody } from "../../../server/jsonBody";

const MAX_MUSIC_BODY_BYTES = 5 * 1024 * 1024;
const MAX_MUSIC_ID_LENGTH = 64;
const MAX_TRACK_TITLE_LENGTH = 200;
const MAX_TRACK_CHANNEL_TITLE_LENGTH = 200;
const MAX_TRACK_THUMBNAIL_LENGTH = 500;
const MAX_TRACK_DURATION_SEC = 24 * 60 * 60;

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
      !p.id ||
      typeof p.name !== "string" ||
      !Array.isArray(p.items)
    ) {
      return null;
    }
    const items: MusicPlayerItem[] = [];
    for (const raw of p.items.slice(0, MAX_TRACKS_PER_PLAYLIST)) {
      if (!raw || typeof raw !== "object") continue;
      const it = raw as Partial<MusicPlayerItem>;
      if (
        typeof it.id !== "string" ||
        !it.id ||
        typeof it.videoId !== "string" ||
        typeof it.title !== "string"
      ) {
        continue;
      }
      items.push({
        id: it.id.slice(0, MAX_MUSIC_ID_LENGTH),
        videoId: it.videoId.slice(0, MAX_MUSIC_ID_LENGTH),
        title: it.title.slice(0, MAX_TRACK_TITLE_LENGTH),
        channelTitle:
          typeof it.channelTitle === "string"
            ? it.channelTitle.slice(0, MAX_TRACK_CHANNEL_TITLE_LENGTH)
            : "",
        thumbnail:
          typeof it.thumbnail === "string"
            ? it.thumbnail.slice(0, MAX_TRACK_THUMBNAIL_LENGTH)
            : "",
        durationSec:
          typeof it.durationSec === "number" &&
          Number.isFinite(it.durationSec)
            ? Math.min(
                Math.max(0, Math.floor(it.durationSec)),
                MAX_TRACK_DURATION_SEC,
              )
            : 0,
      });
    }
    playlists.push({
      id: p.id.slice(0, MAX_MUSIC_ID_LENGTH),
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
      typeof rawSettings.activePlaylistId === "string"
        ? rawSettings.activePlaylistId.slice(0, MAX_MUSIC_ID_LENGTH)
        : rawSettings.activePlaylistId === null
          ? null
          : DEFAULT_MUSIC_PLAYER_SETTINGS.activePlaylistId,
    currentIndex:
      typeof rawSettings.currentIndex === "number" &&
      Number.isFinite(rawSettings.currentIndex)
        ? Math.min(
            Math.max(0, Math.floor(rawSettings.currentIndex)),
            MAX_TRACKS_PER_PLAYLIST - 1,
          )
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
  const parsed = await readJsonBody(request, MAX_MUSIC_BODY_BYTES);
  if (!parsed.ok) {
    return json({ error: parsed.error }, parsed.status);
  }
  const body = parsed.value as MusicBody;
  if (!body || typeof body !== "object") {
    return json({ error: "Invalid body" }, 400);
  }
  const access = await authorize(cookies, body.channelKey);
  if ("error" in access) return access.error;
  const music = sanitizeMusic(body.music);
  if (!music) return json({ error: "Invalid music state" }, 400);
  const opts = getStreamToolsStoreOptions();
  if (typeof body.version !== "number" || !Number.isFinite(body.version)) {
    const current = await getStreamToolsState(opts, access.key);
    return json(
      { error: "State changed", version: current.version, music: current.music },
      409,
    );
  }
  // Check and write under the same channel lock so two writers with the
  // same expected version cannot both pass and clobber each other.
  const mutation = await mutateStreamToolsStateIfVersion(
    opts,
    access.key,
    body.version,
    (state) => {
      state.music = music;
    },
  );
  if (!mutation.ok) {
    return json(
      {
        error: "State changed",
        version: mutation.state.version,
        music: mutation.state.music,
      },
      409,
    );
  }
  return json({
    version: mutation.state.version,
    music: mutation.state.music,
  });
};
