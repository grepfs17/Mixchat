import { useCallback, useEffect, useMemo, useState } from "react";
import {
  clearPastPlaylists,
  getPastPlaylists,
  removePastPlaylist,
  type PastPlaylistEntry,
} from "../../lib/streamerTools/pastPlaylists";
import {
  deletePastSongQueue,
  deletePastSongQueues,
  getPastSongQueue,
  listPastSongQueues,
  setPastSongQueuePublic,
  type PastPlaylistSummary,
} from "../../lib/songQueue/api";
import type { SongQueuePublicView } from "../../lib/songQueue/types";

export type CombinedItem = {
  key: string;
  source: "local" | "server";
  sessionId: string;
  title: string;
  endedAt: string;
  itemCount: number;
  playedCount: number;
  skippedCount: number;
  thumbnail: string | null;
  isPublic: boolean;
  /** Owner token (available for local entries and server entries that match a local entry). */
  ownerToken?: string;
};

export interface UsePastPlaylistsResult {
  combined: CombinedItem[];
  localEntries: PastPlaylistEntry[];
  openKey: string | null;
  setOpenKey: (key: string | null) => void;
  openMeta: CombinedItem | null;
  openPublicUrl: string | null;
  loadingServer: boolean;
  serverError: string | null;
  serverDetail: SongQueuePublicView | null;
  loadingDetail: boolean;
  detailError: string | null;
  linkCopied: boolean;
  copiedItemId: string | null;
  makingPublic: boolean;
  publicError: string | null;
  handleDelete: (key: string) => Promise<void>;
  handleClear: () => Promise<void>;
  handleCopyPublicUrl: () => void;
  handleCopySongUrl: (itemId: string, videoId: string) => void;
  handleMakePublic: (sessionId: string) => Promise<void>;
}

export function usePastPlaylists(
  channelKey: string | null,
  publicOrigin: string,
): UsePastPlaylistsResult {
  const [localEntries, setLocalEntries] = useState<PastPlaylistEntry[]>(() =>
    getPastPlaylists(),
  );
  const [serverEntries, setServerEntries] = useState<PastPlaylistSummary[]>(
    [],
  );
  const [loadingServer, setLoadingServer] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [serverDetail, setServerDetail] =
    useState<SongQueuePublicView | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null);
  const [makingPublic, setMakingPublic] = useState(false);
  const [publicError, setPublicError] = useState<string | null>(null);

  const channelParts = useMemo(() => {
    if (!channelKey || !channelKey.includes(":")) return null;
    const [platform, ...rest] = channelKey.split(":");
    return { channelName: rest.join(":"), channelPlatform: platform };
  }, [channelKey]);

  // Build a lookup of sessionId → ownerToken from local entries.
  const ownerTokenMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of localEntries) {
      if (entry.ownerToken) {
        // Map by the session creation timestamp as a proxy for sessionId
        // since local entries use local IDs, not server sessionIds.
        map.set(entry.createdAt, entry.ownerToken);
      }
    }
    return map;
  }, [localEntries]);

  const refreshLocal = useCallback(() => {
    setLocalEntries(getPastPlaylists());
  }, []);

  const refreshServer = useCallback(async () => {
    if (!channelParts) {
      setServerEntries([]);
      return;
    }
    setLoadingServer(true);
    setServerError(null);
    try {
      const list = await listPastSongQueues(channelParts);
      setServerEntries(list);
    } catch (err) {
      setServerError(
        err instanceof Error ? err.message : "Failed to load past queues",
      );
    } finally {
      setLoadingServer(false);
    }
  }, [channelParts]);

  useEffect(() => {
    refreshLocal();
  }, [refreshLocal]);

  useEffect(() => {
    refreshServer();
  }, [refreshServer]);

  // Lazy-fetch full contents when opening a server entry.
  useEffect(() => {
    if (!openKey || !channelParts) return;
    if (openKey.startsWith("local:")) {
      setServerDetail(null);
      setDetailError(null);
      return;
    }
    if (!openKey.startsWith("server:")) return;
    const sessionId = openKey.slice("server:".length);

    // Find ownerToken: first try to match by sessionId in server entries
    // and cross-reference with local entries by createdAt.
    const serverEntry = serverEntries.find((e) => e.sessionId === sessionId);
    let ownerToken: string | undefined;
    if (serverEntry) {
      ownerToken = ownerTokenMap.get(serverEntry.createdAt);
    }

    if (!ownerToken) {
      setDetailError(
        "Owner token not available. This session may have been created on another device.",
      );
      return;
    }

    let cancelled = false;
    setLoadingDetail(true);
    setDetailError(null);
    setServerDetail(null);
    void (async () => {
      try {
        const view = await getPastSongQueue({
          sessionId,
          ownerToken,
        });
        if (cancelled) return;
        setServerDetail(view);
      } catch (err) {
        if (cancelled) return;
        setDetailError(
          err instanceof Error ? err.message : "Failed to load playlist",
        );
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openKey, channelParts, serverEntries, ownerTokenMap]);

  const combined = useMemo<CombinedItem[]>(() => {
    const items: CombinedItem[] = [];
    for (const e of serverEntries) {
      const ownerToken = ownerTokenMap.get(e.createdAt);
      items.push({
        key: `server:${e.sessionId}`,
        source: "server",
        sessionId: e.sessionId,
        title: e.title,
        endedAt: e.lastSeenAt,
        itemCount: e.itemCount,
        playedCount: e.playedCount,
        skippedCount: e.skippedCount,
        thumbnail: e.firstThumbnail,
        isPublic: e.isPublic,
        ownerToken,
      });
    }
    for (const e of localEntries) {
      items.push({
        key: `local:${e.id}`,
        source: "local",
        sessionId: "",
        title: e.title,
        endedAt: e.endedAt,
        itemCount: e.itemCount,
        playedCount: e.playedCount,
        skippedCount: e.skippedCount,
        thumbnail: e.items[0]?.thumbnail || null,
        isPublic: false,
        ownerToken: e.ownerToken,
      });
    }
    items.sort((a, b) => b.endedAt.localeCompare(a.endedAt));
    return items;
  }, [localEntries, serverEntries, ownerTokenMap]);

  useEffect(() => {
    if (openKey && !combined.some((c) => c.key === openKey)) {
      setOpenKey(null);
    }
  }, [openKey, combined]);

  useEffect(() => {
    setLinkCopied(false);
    setCopiedItemId(null);
    setPublicError(null);
  }, [openKey]);

  const handleDelete = useCallback(
    async (key: string) => {
      if (
        typeof window !== "undefined" &&
        !window.confirm("Delete this past playlist? This cannot be undone.")
      ) {
        return;
      }
      if (key.startsWith("local:")) {
        removePastPlaylist(key.slice("local:".length));
        refreshLocal();
        return;
      }
      if (!channelParts) return;
      const sessionId = key.slice("server:".length);

      // Find ownerToken for this session.
      const item = combined.find((c) => c.key === key);
      if (!item?.ownerToken) {
        if (typeof window !== "undefined") {
          window.alert(
            "Owner token not available. Cannot delete this session.",
          );
        }
        return;
      }

      try {
        await deletePastSongQueue({
          sessionId,
          ownerToken: item.ownerToken,
        });
        refreshServer();
        if (openKey === key) {
          setOpenKey(null);
          setServerDetail(null);
        }
      } catch (err) {
        if (typeof window !== "undefined") {
          window.alert(
            `Failed to delete: ${err instanceof Error ? err.message : "unknown error"}`,
          );
        }
      }
    },
    [channelParts, combined, openKey, refreshLocal, refreshServer],
  );

  const handleClear = useCallback(async () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Clear all past song-queue playlists? This cannot be undone.",
      )
    ) {
      return;
    }
    clearPastPlaylists();
    refreshLocal();
    if (channelParts) {
      // Collect ownerTokens for server entries that have them.
      const sessions: Array<{ sessionId: string; ownerToken: string }> = [];
      for (const item of combined) {
        if (item.source === "server" && item.ownerToken && item.sessionId) {
          sessions.push({
            sessionId: item.sessionId,
            ownerToken: item.ownerToken,
          });
        }
      }
      if (sessions.length > 0) {
        try {
          await deletePastSongQueues({ sessions });
        } catch (err) {
          if (typeof window !== "undefined") {
            window.alert(
              `Failed to clear server playlists: ${err instanceof Error ? err.message : "unknown error"}`,
            );
          }
        }
      }
      refreshServer();
      setOpenKey(null);
      setServerDetail(null);
    }
  }, [channelParts, combined, refreshLocal, refreshServer]);

  const openMeta = useMemo(
    () => (openKey ? combined.find((c) => c.key === openKey) ?? null : null),
    [openKey, combined],
  );

  const openPublicUrl = useMemo(
    () =>
      openMeta && openMeta.source === "server" && openMeta.isPublic
        ? `${publicOrigin}/s/${openMeta.sessionId}`
        : null,
    [openMeta, publicOrigin],
  );

  const handleCopyPublicUrl = useCallback(() => {
    if (!openPublicUrl) return;
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard
      .writeText(openPublicUrl)
      .then(() => {
        setLinkCopied(true);
        window.setTimeout(() => setLinkCopied(false), 1500);
      })
      .catch(() => {});
  }, [openPublicUrl]);

  const handleCopySongUrl = useCallback((itemId: string, videoId: string) => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopiedItemId(itemId);
        window.setTimeout(
          () =>
            setCopiedItemId((current) =>
              current === itemId ? null : current,
            ),
          1500,
        );
      })
      .catch(() => undefined);
  }, []);

  const handleMakePublic = useCallback(
    async (sessionId: string) => {
      if (!channelParts) return;
      if (
        typeof window !== "undefined" &&
        !window.confirm(
          "Make this past playlist public? A read-only share link will be created.",
        )
      ) {
        return;
      }

      // Find ownerToken for this session.
      const item = combined.find(
        (c) => c.sessionId === sessionId && c.source === "server",
      );
      if (!item?.ownerToken) {
        setPublicError(
          "Owner token not available. Cannot make this session public.",
        );
        return;
      }

      setMakingPublic(true);
      setPublicError(null);
      try {
        await setPastSongQueuePublic({
          sessionId,
          ownerToken: item.ownerToken,
          isPublic: true,
        });
        setServerEntries((prev) =>
          prev.map((e) =>
            e.sessionId === sessionId ? { ...e, isPublic: true } : e,
          ),
        );
      } catch (err) {
        setPublicError(
          err instanceof Error ? err.message : "Failed to make playlist public",
        );
      } finally {
        setMakingPublic(false);
      }
    },
    [channelParts, combined],
  );

  return {
    combined,
    localEntries,
    openKey,
    setOpenKey,
    openMeta,
    openPublicUrl,
    loadingServer,
    serverError,
    serverDetail,
    loadingDetail,
    detailError,
    linkCopied,
    copiedItemId,
    makingPublic,
    publicError,
    handleDelete,
    handleClear,
    handleCopyPublicUrl,
    handleCopySongUrl,
    handleMakePublic,
  };
}
