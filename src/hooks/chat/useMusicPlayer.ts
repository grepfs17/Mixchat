import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import {
  DEFAULT_MUSIC_PLAYER_SETTINGS,
  MAX_PLAYLISTS,
  MAX_TRACKS_PER_PLAYLIST,
  makePlaylistId,
  makeTrackId,
  type MusicPlayerItem,
  type MusicPlayerSettings,
  type MusicPlaylist,
} from "../../lib/musicPlayer/types";
import { parseYouTubeId } from "../../lib/songQueue/types";
import {
  fetchVideoMeta,
  VideoValidationError,
} from "../../lib/songQueue/oembed";
import {
  deletePlaylistFromIDB,
  loadAllPlaylists,
  loadSettings,
  savePlaylist,
  saveSettings,
} from "../../lib/musicPlayer/idb";
import { getSharedMusic, putSharedMusic } from "../../lib/streamTools/api";
import type { SharedMusicState } from "../../lib/streamTools/state";

/**
 * Streamer-only Music Player hook, persisted via IndexedDB.
 *
 * Playlists and scalar settings are separate IDB records. Gate the UI on
 * `hydrated` so the empty state doesn't flash before hydration. IDB writes
 * happen outside state updaters because React 18 strict mode runs updaters
 * twice. A dangling `activePlaylistId` is auto-healed after deletes.
 */
export interface UseMusicPlayerResult {
  /** True once the initial IDB hydration has completed. */
  hydrated: boolean;
  playlists: MusicPlaylist[];
  activePlaylist: MusicPlaylist | null;
  currentItem: MusicPlayerItem | null;
  currentIndex: number;
  volume: number;
  loop: boolean;
  /** True when the streamer dismissed the mini bar (persisted). */
  miniBarHidden: boolean;
  /** True while a URL is being validated by oEmbed. */
  loadingUrl: boolean;
  /** Last oEmbed failure surfaced to the user. */
  error: string | null;

  createPlaylist: (name: string) => MusicPlaylist;
  renamePlaylist: (id: string, name: string) => void;
  deletePlaylist: (id: string) => void;
  setActivePlaylist: (id: string) => void;

  /**
   * Validate `input` via oEmbed and append the resulting track to the
   * playlist identified by `targetPlaylistId`, defaults to the current
   * active playlist. Passing it explicitly avoids stale-closure bugs in
   * callers that just created a playlist and want to add to it in the
   * same click.
   */
  addTrackFromUrl: (
    input: string,
    targetPlaylistId?: string,
  ) => Promise<void>;
  removeTrack: (trackId: string) => void;
  reorderTracks: (fromId: string, toId: string) => void;

  playTrackIndex: (index: number) => void;
  next: () => void;
  previous: () => void;

  setVolume: (vol: number) => void;
  setLoop: (loop: boolean) => void;

  /** Associate a playlist with a Twitch category for auto-select. */
  setPlaylistCategory: (
    playlistId: string,
    categoryId: string | null,
    categoryName: string,
  ) => void;

  /** Dismiss the mini bar. Persisted. Survives reload. */
  hideMiniBar: () => void;
  showMiniBar: () => void;

  /** Shared playback state. Only the audio host actually renders sound. */
  isPlaying: boolean;
  isAudioHost: boolean;
  setPlaying: (playing: boolean) => void;
}

export interface UseMusicPlayerOptions {
  /** When set, playlists and playback are shared server-side per channel. */
  channelKey?: string | null;
  /** True for the broadcaster's client, which is the audio host. */
  isHost?: boolean;
}

function nextIndexIn(active: MusicPlaylist, idx: number): number {
  if (active.items.length === 0) return 0;
  const atEnd = idx >= active.items.length - 1;
  return atEnd ? 0 : idx + 1;
}

function previousIndexIn(active: MusicPlaylist, idx: number): number {
  if (active.items.length === 0) return 0;
  if (idx <= 0) return active.items.length - 1;
  return idx - 1;
}

export function useMusicPlayer(
  options: UseMusicPlayerOptions = {},
): UseMusicPlayerResult {
  const sharedChannel = options.channelKey ?? null;
  const isAudioHost = !sharedChannel || options.isHost !== false;
  const [isPlaying, setIsPlaying] = useState(false);
  const [playlists, setPlaylists] = useState<MusicPlaylist[]>([]);
  const [settings, setSettings] = useState<MusicPlayerSettings>({
    ...DEFAULT_MUSIC_PLAYER_SETTINGS,
  });
  const [hydrated, setHydrated] = useState(false);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sharedVersionRef = useRef(-1);
  const sharedLoadedRef = useRef(false);
  const skipPushRef = useRef(false);
  const pushingRef = useRef(false);

  const applySharedMusic = useCallback((music: SharedMusicState) => {
    skipPushRef.current = true;
    setPlaylists(music.playlists);
    setSettings(music.settings);
    setIsPlaying(Boolean(music.isPlaying));
  }, []);

  // ---- IDB hydration (mount only) ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [loadedPlaylists, loadedSettings] = await Promise.all([
          loadAllPlaylists(),
          loadSettings(),
        ]);
        if (cancelled) return;

        if (!sharedChannel) {
          setPlaylists(loadedPlaylists);
          setSettings(loadedSettings);
          setHydrated(true);
          return;
        }

        try {
          const shared = await getSharedMusic(sharedChannel);
          if (cancelled) return;
          sharedVersionRef.current = shared.version;
          sharedLoadedRef.current = true;
          const hasServerData =
            shared.music.playlists.length > 0 ||
            shared.music.settings.activePlaylistId !== null;
          if (
            hasServerData ||
            loadedPlaylists.length === 0 ||
            !isAudioHost
          ) {
            applySharedMusic(shared.music);
          } else {
            // One-time migration: the broadcaster already had local playlists
            // before shared state existed. Upload them on first load.
            setPlaylists(loadedPlaylists);
            setSettings(loadedSettings);
          }
        } catch {
          setPlaylists(loadedPlaylists);
          setSettings(loadedSettings);
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sharedChannel, applySharedMusic, isAudioHost]);

  // ---- Shared-state polling ----
  useEffect(() => {
    if (!sharedChannel) return;
    let cancelled = false;
    const tick = async () => {
      if (
        pushingRef.current ||
        (typeof document !== "undefined" && document.hidden)
      ) {
        return;
      }
      try {
        const next = await getSharedMusic(sharedChannel);
        if (cancelled || next.version <= sharedVersionRef.current) return;
        sharedVersionRef.current = next.version;
        applySharedMusic(next.music);
      } catch {
        // Retry on the next tick.
      }
    };
    const timer = window.setInterval(tick, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [sharedChannel, applySharedMusic]);

  // ---- Push local changes to the shared store ----
  useEffect(() => {
    if (!sharedChannel || !hydrated || !sharedLoadedRef.current) return;
    if (skipPushRef.current) {
      skipPushRef.current = false;
      return;
    }
    const timer = window.setTimeout(async () => {
      if (pushingRef.current) return;
      pushingRef.current = true;
      try {
        const res = await putSharedMusic(sharedChannel, sharedVersionRef.current, {
          playlists,
          settings,
          isPlaying,
        });
        sharedVersionRef.current = res.version;
        if (!res.ok) applySharedMusic(res.music);
      } catch {
        // Keep editing locally; the next change retries.
      } finally {
        pushingRef.current = false;
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [sharedChannel, hydrated, playlists, settings, isPlaying, applySharedMusic]);

  const activePlaylist = useMemo<MusicPlaylist | null>(() => {
    if (!settings.activePlaylistId) return null;
    return playlists.find((p) => p.id === settings.activePlaylistId) ?? null;
  }, [playlists, settings.activePlaylistId]);

  const currentItem = useMemo<MusicPlayerItem | null>(() => {
    if (!activePlaylist) return null;
    const lastIdx = Math.max(0, activePlaylist.items.length - 1);
    const idx = Math.min(Math.max(0, settings.currentIndex), lastIdx);
    return activePlaylist.items[idx] ?? null;
  }, [activePlaylist, settings.currentIndex]);

  // ---- IDB-aware mutators ----
  // State is the UI source of truth. IDB writes run in the background outside
  // state updaters (React 18 strict mode double-invokes them). IDB failures
  // are logged, not thrown.

  const commitPlaylist = useCallback(
    (next: MusicPlaylist) => {
      setPlaylists((prev) => {
        const idx = prev.findIndex((p) => p.id === next.id);
        const merged = [...prev];
        if (idx === -1) merged.unshift(next);
        else merged[idx] = next;
        return merged.slice(0, MAX_PLAYLISTS);
      });
      void savePlaylist(next);
    },
    [],
  );

  const commitSettings = useCallback(
    (patch: Partial<MusicPlayerSettings>) => {
      setSettings((prev) => ({ ...prev, ...patch }));
    },
    [],
  );

  // The redundant write right after hydration is harmless (idempotent put).
  useEffect(() => {
    if (hydrated) {
      void saveSettings(settings);
    }
  }, [settings, hydrated]);

  // ---- Mutations ----

  const createPlaylist = useCallback(
    (name: string): MusicPlaylist => {
      const trimmed = name.trim().slice(0, 80) || "Untitled playlist";
      const now = new Date().toISOString();
      const playlist: MusicPlaylist = {
        id: makePlaylistId(),
        name: trimmed,
        items: [],
        createdAt: now,
        updatedAt: now,
        categoryId: null,
        categoryName: "",
      };
      setError(null);
      setPlaylists((prev) => [playlist, ...prev].slice(0, MAX_PLAYLISTS));
      void savePlaylist(playlist);
      commitSettings({ activePlaylistId: playlist.id, currentIndex: 0 });
      return playlist;
    },
    [commitSettings],
  );

  // Track latest playlists via ref so mutators can compute updates
  // outside state updaters (keeping updaters pure per react-doctor).
  const playlistsRef = useRef(playlists);
  playlistsRef.current = playlists;

  const renamePlaylist = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim().slice(0, 80);
      if (!trimmed) return;
      const target = playlistsRef.current.find((p) => p.id === id);
      if (!target) return;
      const updated: MusicPlaylist = {
        ...target,
        name: trimmed,
        updatedAt: new Date().toISOString(),
      };
      setPlaylists((prev) => prev.map((p) => (p.id === id ? updated : p)));
      void savePlaylist(updated);
    },
    [],
  );

  const deletePlaylist = useCallback((id: string) => {
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
    void deletePlaylistFromIDB(id);
    // The auto-heal effect picks a new active playlist if `id` was active,
    // avoiding nested setState and React batch-ordering assumptions.
  }, []);

  const setActivePlaylist = useCallback(
    (id: string) => {
      commitSettings({ activePlaylistId: id, currentIndex: 0 });
    },
    [commitSettings],
  );

  const playTrackIndex = useCallback(
    (index: number) => {
      if (!activePlaylist || activePlaylist.items.length === 0) return;
      const clamped = Math.max(
        0,
        Math.min(index, activePlaylist.items.length - 1),
      );
      commitSettings({ currentIndex: clamped });
    },
    [activePlaylist, commitSettings],
  );

  const next = useCallback(() => {
    if (!activePlaylist || activePlaylist.items.length === 0) return;
    const target = settings.loop
      ? nextIndexIn(activePlaylist, settings.currentIndex)
      : Math.min(
          settings.currentIndex + 1,
          activePlaylist.items.length - 1,
        );
    if (!settings.loop && target === settings.currentIndex) return;
    commitSettings({ currentIndex: target });
  }, [activePlaylist, settings.currentIndex, settings.loop, commitSettings]);

  const previous = useCallback(() => {
    if (!activePlaylist || activePlaylist.items.length === 0) return;
    const target = previousIndexIn(activePlaylist, settings.currentIndex);
    commitSettings({ currentIndex: target });
  }, [activePlaylist, settings.currentIndex, commitSettings]);

  const removeTrack = useCallback(
    (trackId: string) => {
      if (!activePlaylist) return;
      const removeIdx = activePlaylist.items.findIndex(
        (it) => it.id === trackId,
      );
      if (removeIdx === -1) return;
      const items = activePlaylist.items.filter((it) => it.id !== trackId);

      // Adjust currentIndex so playback continues on the same logical
      // track. If we removed the active track and it was the last item,
      // clamp to the new last index.
      let nextIndex = settings.currentIndex;
      if (removeIdx < nextIndex) {
        nextIndex = Math.max(0, nextIndex - 1);
      } else if (nextIndex >= items.length) {
        nextIndex = Math.max(0, items.length - 1);
      }

      commitPlaylist({
        ...activePlaylist,
        items,
        updatedAt: new Date().toISOString(),
      });
      if (nextIndex !== settings.currentIndex) {
        commitSettings({ currentIndex: nextIndex });
      }
    },
    [activePlaylist, settings.currentIndex, commitPlaylist, commitSettings],
  );

  const reorderTracks = useCallback(
    (fromId: string, toId: string) => {
      if (!activePlaylist || fromId === toId) return;
      const items = activePlaylist.items;
      const fromIdx = items.findIndex((it) => it.id === fromId);
      const toIdx = items.findIndex((it) => it.id === toId);
      if (fromIdx === -1 || toIdx === -1) return;
      const nextItems = [...items];
      const [moved] = nextItems.splice(fromIdx, 1);
      nextItems.splice(toIdx, 0, moved);

      // Adjust currentIndex for the reorder. Three cases:
      // - moved track IS the active one → currentIdx becomes toIdx
      // - active stayed after fromIdx and toIdx ≥ currentIdx → shift -1
      // - active stayed before fromIdx and toIdx ≤ currentIdx → shift +1
      let nextCurrentIndex = settings.currentIndex;
      if (fromIdx === settings.currentIndex) {
        nextCurrentIndex = toIdx;
      } else if (
        fromIdx < settings.currentIndex &&
        toIdx >= settings.currentIndex
      ) {
        nextCurrentIndex -= 1;
      } else if (
        fromIdx > settings.currentIndex &&
        toIdx <= settings.currentIndex
      ) {
        nextCurrentIndex += 1;
      }

      commitPlaylist({
        ...activePlaylist,
        items: nextItems,
        updatedAt: new Date().toISOString(),
      });
      if (nextCurrentIndex !== settings.currentIndex) {
        commitSettings({ currentIndex: nextCurrentIndex });
      }
    },
    [
      activePlaylist,
      settings.currentIndex,
      commitPlaylist,
      commitSettings,
    ],
  );

  const addTrackFromUrl = useCallback(
    async (input: string, targetPlaylistId?: string) => {
      setError(null);
      const videoId = parseYouTubeId(input);
      if (!videoId) {
        setError("Not a valid YouTube URL or video id.");
        return;
      }
      // Capture the target id at click-time so an `add` issued right
      // after `createPlaylist` lands in the just-created playlist, even
      // before React has re-rendered with the new activeId.
      const resolvedId = targetPlaylistId ?? settings.activePlaylistId;
      if (!resolvedId) {
        setError("Create or select a playlist first.");
        return;
      }
      setLoadingUrl(true);
      try {
        const meta = await fetchVideoMeta(videoId);
        const newItem: MusicPlayerItem = {
          id: makeTrackId(),
          videoId: meta.videoId,
          title: meta.title,
          channelTitle: meta.channelTitle,
          thumbnail: meta.thumbnail,
          durationSec: 0,
        };
        // flushSync commits pending updates (e.g. createPlaylist) so this
        // append doesn't read the pre-create snapshot. The updater may run
        // twice under strict mode: savePlaylist is an idempotent put.
        flushSync(() => setPlaylists((p) => p));
        const freshPlaylists = playlistsRef.current;

        const pi = freshPlaylists.findIndex((p) => p.id === resolvedId);
        if (pi === -1) {
          setError("Could not find the target playlist.");
          return;
        }
        const pl = freshPlaylists[pi];
        if (pl.items.some((it) => it.videoId === meta.videoId)) {
          setError("This track is already in the playlist.");
          return;
        }
        const cappedItems =
          pl.items.length >= MAX_TRACKS_PER_PLAYLIST
            ? pl.items
            : [...pl.items, newItem];
        const updatedPlaylist: MusicPlaylist = {
          ...pl,
          items: cappedItems,
          updatedAt: new Date().toISOString(),
        };

        flushSync(() => {
          setPlaylists((prev) => {
            const i = prev.findIndex((p) => p.id === resolvedId);
            if (i === -1) return prev;
            const merged = [...prev];
            merged[i] = updatedPlaylist;
            return merged;
          });
        });
        void savePlaylist(updatedPlaylist);
      } catch (err) {
        if (err instanceof VideoValidationError) {
          setError(err.message);
        } else {
          setError(err instanceof Error ? err.message : "Failed to add track");
        }
      } finally {
        setLoadingUrl(false);
      }
    },
    [settings.activePlaylistId],
  );

  const setVolume = useCallback(
    (vol: number) => {
      const clamped = Math.max(0, Math.min(100, Math.round(vol)));
      commitSettings({ volume: clamped });
    },
    [commitSettings],
  );

  const setLoop = useCallback(
    (loop: boolean) => {
      commitSettings({ loop });
    },
    [commitSettings],
  );

  const hideMiniBar = useCallback(() => {
    commitSettings({ miniBarHidden: true });
  }, [commitSettings]);

  const showMiniBar = useCallback(() => {
    commitSettings({ miniBarHidden: false });
  }, [commitSettings]);

  const setPlaying = useCallback((playing: boolean) => {
    setIsPlaying(Boolean(playing));
  }, []);

  const setPlaylistCategory = useCallback(
    (playlistId: string, categoryId: string | null, categoryName: string) => {
      const target = playlistsRef.current.find((p) => p.id === playlistId);
      if (!target) return;
      const updated: MusicPlaylist = {
        ...target,
        categoryId,
        categoryName: categoryName.trim().slice(0, 200),
        updatedAt: new Date().toISOString(),
      };
      setPlaylists((prev) => prev.map((p) => (p.id === playlistId ? updated : p)));
      void savePlaylist(updated);
    },
    [],
  );

  // ---- Auto-heal: resolve dangling activePlaylistId after deletes ----
  // If `activePlaylistId` points to a playlist that no longer exists
  // (deleted on disk from another tab, original blob was corrupt),
  // fall back to the first remaining playlist or null.
  useEffect(() => {
    if (!hydrated) return;
    if (!settings.activePlaylistId) return;
    const stillExists = playlists.some(
      (p) => p.id === settings.activePlaylistId,
    );
    if (stillExists) return;
    const fallback = playlists[0]?.id ?? null;
    commitSettings({ activePlaylistId: fallback, currentIndex: 0 });
  }, [
    hydrated,
    playlists,
    settings.activePlaylistId,
    commitSettings,
  ]);

  return {
    hydrated,
    playlists,
    activePlaylist,
    currentItem,
    currentIndex: settings.currentIndex,
    volume: settings.volume,
    loop: settings.loop,
    miniBarHidden: settings.miniBarHidden,
    loadingUrl,
    error,
    createPlaylist,
    renamePlaylist,
    deletePlaylist,
    setActivePlaylist,
    addTrackFromUrl,
    removeTrack,
    reorderTracks,
    playTrackIndex,
    next,
    previous,
    setVolume,
    setLoop,
    hideMiniBar,
    showMiniBar,
    setPlaylistCategory,
    isPlaying,
    isAudioHost,
    setPlaying,
  };
}
