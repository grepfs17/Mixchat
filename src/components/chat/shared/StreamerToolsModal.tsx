import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FaArrowLeft,
  FaCopy,
  FaShareSquare,
  FaTimes,
  FaTrash,
  FaTwitch,
  FaWindowMinimize,
  FaWrench,
  FaYoutube,
} from "react-icons/fa";
import GiveawayPanel from "./GiveawayPanel";
import SongQueuePanel from "./SongQueuePanel";
import MusicPlayerPanel from "./MusicPlayerPanel";
import type { GiveawayEntry } from "../../../lib/streamerTools/giveaway";
import type { UseGiveawayResult } from "../../../hooks/chat/useGiveaway";
import type { UseSongQueueResult } from "../../../hooks/chat/useSongQueue";
import type { UseMusicPlayerResult } from "../../../hooks/chat/useMusicPlayer";
import {
  clearGiveawayHistory,
  getGiveawayHistory,
  type GiveawayHistoryEntry,
} from "../../../lib/streamerTools/history";
import {
  clearPastPlaylists,
  getPastPlaylists,
  removePastPlaylist,
  type PastPlaylistEntry,
} from "../../../lib/streamerTools/pastPlaylists";
import {
  deletePastSongQueue,
  deletePastSongQueues,
  getPastSongQueue,
  listPastSongQueues,
  setPastSongQueuePublic,
  type PastPlaylistSummary,
} from "../../../lib/songQueue/api";
import type { SongQueuePublicView } from "../../../lib/songQueue/types";

interface StreamerToolsModalProps {
  giveaway: UseGiveawayResult;
  songQueue: UseSongQueueResult;
  musicPlayer: UseMusicPlayerResult;
  onAnnounce: (winner: GiveawayEntry, message: string) => Promise<void>;
  onMinimize: () => void;
  onClose: () => void;
  /** When provided, the modal opens directly into this tool. */
  initialTool?: ToolId | null;
  /** Whether the user is connected to YouTube (gates YouTube scope options). */
  youtubeConnected?: boolean;
  /** Public origin used to build the song-queue share link. */
  publicOrigin?: string;
  /** Channel key (e.g. "twitch:streamerlogin") used to list past playlists. */
  channelKey?: string | null;
  /** Current Twitch category id — for playlist auto-select. */
  streamGameId?: string;
  /** Current Twitch category name — for playlist auto-select hint. */
  streamGameName?: string;
  /** Search Twitch categories (same API as stream-info category picker). */
  onSearchCategories?: (
    query: string,
  ) => Promise<Array<{ id: string; name: string }>>;
}

type ToolId = "music-player" | "giveaway" | "song-queue";

interface ToolDescriptor {
  id: ToolId;
  label: string;
  description: string;
}

const TOOLS: ToolDescriptor[] = [
  {
    id: "music-player",
    label: "Music Player",
    description:
      "Build YouTube playlists for stream and play them in a mini bar.",
  },
  {
    id: "giveaway",
    label: "Giveaway",
    description: "Pick a winner from viewers who type a keyword in chat.",
  },
  {
    id: "song-queue",
    label: "Song Queue",
    description: "Let viewers queue YouTube songs in chat.",
  },
];

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString([], {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function HistorySection({ onChanged }: { onChanged: () => void }) {
  const [history, setHistory] = useState<GiveawayHistoryEntry[]>(() =>
    getGiveawayHistory(),
  );

  const refresh = useCallback(() => {
    setHistory(getGiveawayHistory());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (onChanged) onChanged();
  }, [history, onChanged]);

  const handleClear = () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Clear all giveaway history? This cannot be undone.")
    ) {
      return;
    }
    clearGiveawayHistory();
    refresh();
  };

  if (history.length === 0) {
    return (
      <div className="streamer-tools-history streamer-tools-history--empty">
        <span>
          No past giveaways yet. Run one and the winner will show here.
        </span>
      </div>
    );
  }

  return (
    <div className="streamer-tools-history">
      <div className="streamer-tools-history-header">
        <span className="streamer-tools-history-title">Recent winners</span>
        <button type="button"
          className="streamer-tools-history-clear"
          onClick={handleClear}
          title="Clear all history"
        >
          Clear
        </button>
      </div>
      <ul className="streamer-tools-history-list">
        {history.map((entry) => (
          <li
            key={entry.id}
            className="streamer-tools-history-item"
            data-platform={entry.winner.platform}
          >
            <div className="streamer-tools-history-item-main">
              <span className="streamer-tools-history-winner">
                {entry.winner.authorAvatar ? (
                  <img
                    src={entry.winner.authorAvatar}
                    alt=""
                    className="streamer-tools-history-avatar"
                  />
                ) : (
                  <span className="streamer-tools-history-avatar streamer-tools-history-avatar--placeholder" />
                )}
                <span className="streamer-tools-history-name">
                  {entry.winner.author}
                </span>
                <span
                  className="streamer-tools-history-platform"
                  title={entry.winner.platform}
                >
                  {entry.winner.platform === "twitch" ? (
                    <FaTwitch size={11} />
                  ) : (
                    <FaYoutube size={11} />
                  )}
                </span>
              </span>
              <span className="streamer-tools-history-keyword">
                Keyword: <strong>{entry.keyword}</strong>
              </span>
            </div>
            <div className="streamer-tools-history-meta">
              <span className="streamer-tools-history-date">
                {formatDate(entry.revealedAt)}
              </span>
              <span className="streamer-tools-history-count">
                {entry.entryCount} entr
                {entry.entryCount === 1 ? "y" : "ies"}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function PastPlaylistsSection({
  channelKey,
  publicOrigin = "",
}: {
  channelKey: string | null;
  publicOrigin?: string;
}) {
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
    setLoadingDetail(true);
    setDetailError(null);
    setServerDetail(null);
    void (async () => {
      try {
        const view = await getPastSongQueue({
          sessionId,
          ...channelParts,
        });
        setServerDetail(view);
      } catch (err) {
        setDetailError(
          err instanceof Error ? err.message : "Failed to load playlist",
        );
      } finally {
        setLoadingDetail(false);
      }
    })();
  }, [openKey, channelParts]);

  type CombinedItem = {
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
  };

  const combined = useMemo<CombinedItem[]>(() => {
    const items: CombinedItem[] = [];
    for (const e of serverEntries) {
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
      });
    }
    items.sort((a, b) => b.endedAt.localeCompare(a.endedAt));
    return items;
  }, [localEntries, serverEntries]);

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

  const handleDelete = async (key: string) => {
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
    try {
      await deletePastSongQueue({ sessionId, ...channelParts });
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
  };

  const handleClear = async () => {
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
      const ids = serverEntries.map((e) => e.sessionId);
      if (ids.length > 0) {
        try {
          await deletePastSongQueues({ sessionIds: ids, ...channelParts });
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
  };

  if (combined.length === 0 && !loadingServer) {
    return (
      <div className="past-playlists past-playlists--empty">
        <span>
          {serverError
            ? `Couldn't load past queues: ${serverError}`
            : "No past song queues yet. End a queue and it will show here."}
        </span>
      </div>
    );
  }

  const openMeta = openKey
    ? combined.find((c) => c.key === openKey) ?? null
    : null;

  const openPublicUrl =
    openMeta && openMeta.source === "server" && openMeta.isPublic
      ? `${publicOrigin}/s/${openMeta.sessionId}`
      : null;

  const handleCopyPublicUrl = () => {
    if (!openPublicUrl) return;
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard
      .writeText(openPublicUrl)
      .then(() => {
        setLinkCopied(true);
        window.setTimeout(() => setLinkCopied(false), 1500);
      })
      .catch(() => {
        // Clipboard write can fail in insecure contexts — just skip the flash.
      });
  };

  const handleCopySongUrl = (itemId: string, videoId: string) => {
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
  };

  const handleMakePublic = async (sessionId: string) => {
    if (!channelParts) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Make this past playlist public? A read-only share link will be created.",
      )
    ) {
      return;
    }
    setMakingPublic(true);
    setPublicError(null);
    try {
      await setPastSongQueuePublic({
        sessionId,
        ...channelParts,
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
  };

  if (openMeta) {
    const localDetail =
      openMeta.source === "local"
        ? localEntries.find((e) => `local:${e.id}` === openKey) ?? null
        : null;
    const items =
      openMeta.source === "local" && localDetail
        ? localDetail.items
        : (serverDetail?.items ?? null);

    return (
      <div className="past-playlists past-playlists--detail">
        <div className="past-playlists-detail-header">
          <button type="button"
            className="past-playlists-back"
            onClick={() => setOpenKey(null)}
            title="Back to past playlists"
          >
            <FaArrowLeft size={12} />
            <span>Back</span>
          </button>
          <div className="past-playlists-detail-actions">
            {openMeta.source === "server" && !openMeta.isPublic ? (
              <button type="button"
                className="past-playlists-share"
                onClick={() => handleMakePublic(openMeta.sessionId)}
                disabled={makingPublic}
                title="Make this playlist public and create a shareable link"
                aria-label="Make playlist public"
              >
                <FaShareSquare size={11} />
                <span>{makingPublic ? "Sharing…" : "Make public"}</span>
              </button>
            ) : null}
            {openPublicUrl ? (
              <button type="button"
                className="past-playlists-copy"
                onClick={handleCopyPublicUrl}
                title={`Copy ${openPublicUrl}`}
                aria-label="Copy public URL"
              >
                <FaCopy size={11} />
                <span>{linkCopied ? "Copied" : "Copy link"}</span>
              </button>
            ) : (
              <span
                className="past-playlists-copy past-playlists-copy--disabled"
                title="This queue was never shared publicly"
              >
                <FaCopy size={11} />
                <span>Not shared</span>
              </span>
            )}
            <button type="button"
              className="past-playlists-delete"
              onClick={() => handleDelete(openMeta.key)}
              title="Delete this playlist"
              aria-label="Delete playlist"
            >
              <FaTrash size={11} />
              <span>Delete</span>
            </button>
          </div>
        </div>
        {publicError ? (
          <div className="past-playlists-server-error">
            {publicError}
          </div>
        ) : null}
        <div className="past-playlists-detail-meta">
          <span className="past-playlists-detail-title">
            {openMeta.title || "Untitled queue"}
          </span>
          <span className="past-playlists-detail-stats">
            {openMeta.itemCount} song{openMeta.itemCount === 1 ? "" : "s"} ·{" "}
            {openMeta.playedCount} played · {openMeta.skippedCount} skipped
          </span>
          <span className="past-playlists-detail-date">
            {openMeta.source === "local" ? "Ended " : "Last seen "}
            {formatDate(openMeta.endedAt)}
          </span>
        </div>
        {loadingDetail ? (
          <div className="past-playlists-detail-loading">Loading…</div>
        ) : detailError ? (
          <div className="past-playlists-detail-loading">
            Failed to load: {detailError}
          </div>
        ) : !items || items.length === 0 ? (
          <div className="past-playlists-detail-loading">
            No songs in this queue.
          </div>
        ) : (
          <ul className="past-playlists-detail-list">
            {items.map((item) => (
              <li
                key={item.id}
                className="past-playlists-detail-item"
                data-status={item.status}
              >
                <a
                  className="past-playlists-detail-thumb"
                  href={`https://www.youtube.com/watch?v=${item.videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open on YouTube"
                >
                  <img src={item.thumbnail} alt="" loading="lazy" />
                  <span className="past-playlists-detail-duration">
                    {formatDuration(item.durationSec)}
                  </span>
                </a>
                <div className="past-playlists-detail-info">
                  <span className="past-playlists-detail-song-title">
                    {item.title}
                  </span>
                  <span className="past-playlists-detail-song-channel">
                    {item.channelTitle}
                  </span>
                  <span className="past-playlists-detail-submitter">
                    by {item.submitter.author}
                    {item.submitter.platform === "twitch" ? (
                      <FaTwitch
                        size={10}
                        className="past-playlists-detail-platform"
                      />
                    ) : (
                      <FaYoutube
                        size={10}
                        className="past-playlists-detail-platform"
                      />
                    )}
                  </span>
                </div>
                <button type="button"
                  className="past-playlists-detail-copy"
                  onClick={() => handleCopySongUrl(item.id, item.videoId)}
                  title={`Copy https://www.youtube.com/watch?v=${item.videoId}`}
                  aria-label="Copy song URL"
                >
                  <FaCopy size={11} />
                  <span>
                    {copiedItemId === item.id ? "Copied" : "Copy URL"}
                  </span>
                </button>
                <span className="past-playlists-detail-status">
                  {item.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="past-playlists">
      <div className="past-playlists-header">
        <span className="past-playlists-title">
          Past song queues{loadingServer ? " (loading…)" : ""}
        </span>
        <button type="button"
          className="past-playlists-clear"
          onClick={handleClear}
          title="Clear all past playlists"
        >
          Clear
        </button>
      </div>
      {serverError ? (
        <div className="past-playlists-server-error">
          Server history unavailable: {serverError}
        </div>
      ) : null}
      <ul className="past-playlists-list">
        {combined.map((entry) => {
          const entryUrl =
            entry.source === "server" && entry.isPublic
              ? `${publicOrigin}/s/${entry.sessionId}`
              : null;
          return (
            <li
              key={entry.key}
              className="past-playlists-item"
              data-source={entry.source}
            >
              <button type="button"
                className="past-playlists-item-button"
                onClick={() => setOpenKey(entry.key)}
                title="View playlist"
              >
                <span className="past-playlists-item-thumb-wrap">
                  {entry.thumbnail ? (
                    <img
                      src={entry.thumbnail}
                      alt=""
                      className="past-playlists-item-thumb"
                      loading="lazy"
                    />
                  ) : (
                    <span className="past-playlists-item-thumb past-playlists-item-thumb--empty" />
                  )}
                </span>
                <span className="past-playlists-item-main">
                  <span className="past-playlists-item-title">
                    {entry.title || "Untitled queue"}
                  </span>
                  <span className="past-playlists-item-sub">
                    {entry.itemCount} song{entry.itemCount === 1 ? "" : "s"} ·{" "}
                    {entry.playedCount} played · {entry.skippedCount} skipped
                  </span>
                </span>
                <span className="past-playlists-item-meta">
                  <span className="past-playlists-item-source">
                    {entry.source === "server" ? "Server" : "Local"}
                  </span>
                  <span className="past-playlists-item-date">
                    {formatDate(entry.endedAt)}
                  </span>
                </span>
              </button>
              {entryUrl ? (
                <button type="button"
                  className="past-playlists-item-copy"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (typeof navigator === "undefined" || !navigator.clipboard)
                      return;
                    navigator.clipboard
                      .writeText(entryUrl)
                      .then(() => {
                        setLinkCopied(false);
                      })
                      .catch(() => undefined);
                  }}
                  title={`Copy ${entryUrl}`}
                  aria-label="Copy public URL"
                >
                  <FaCopy size={11} />
                </button>
              ) : null}
              <button type="button"
                className="past-playlists-item-delete"
                onClick={() => handleDelete(entry.key)}
                title="Delete this playlist"
                aria-label="Delete playlist"
              >
                <FaTrash size={11} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function StreamerToolsModal({
  giveaway,
  songQueue,
  musicPlayer,
  onAnnounce,
  onMinimize,
  onClose,
  initialTool = null,
  youtubeConnected = false,
  publicOrigin = "",
  channelKey = null,
  streamGameId = "",
  streamGameName = "",
  onSearchCategories,
}: StreamerToolsModalProps) {
  const [activeTool, setActiveTool] = useState<ToolId | null>(initialTool);
  const [announcing, setAnnouncing] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Minimize is allowed whenever the active tool has something to keep
  // running. The giveaway is minimizable while running or revealed; the
  // song queue is minimizable while open; the music player is minimizable
  // as soon as it has at least one track loaded so the mini bar keeps
  // playing while the streamer chats/edit elsewhere.
  const musicHasItems =
    !!musicPlayer.activePlaylist &&
    musicPlayer.activePlaylist.items.length > 0;
  const canMinimize =
    (activeTool === "giveaway" && giveaway.phase !== "config") ||
    (activeTool === "song-queue" && songQueue.phase === "open") ||
    (activeTool === "music-player" && musicHasItems);
  const minimizeTitle = canMinimize
    ? "Minimize (the tool keeps running in the corner)"
    : "Nothing to minimize in this state";

  const tool = useMemo(
    () => TOOLS.find((t) => t.id === activeTool) ?? null,
    [activeTool],
  );

  return (
    <div
      role="presentation"
      className="embed-config-overlay"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
      ref={overlayRef}
    >
      <div
        className="streamer-tools-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Streamer tools"
      >
        <div className="streamer-tools-header">
          <h2 className="streamer-tools-title">
            <FaWrench size={18} />{" "}
            {tool ? `Streamer tools - ${tool.label}` : "Streamer tools"}
          </h2>
          <div className="streamer-tools-header-actions">
            <button type="button"
              className="streamer-tools-header-btn"
              onClick={onMinimize}
              disabled={!canMinimize}
              title={minimizeTitle}
              aria-label="Minimize"
            >
              <FaWindowMinimize size={14} />
            </button>
            <button type="button"
              className="streamer-tools-header-btn"
              onClick={onClose}
              title="Close"
              aria-label="Close"
            >
              <FaTimes size={16} />
            </button>
          </div>
        </div>

        <div className="streamer-tools-body">
          {!tool ? (
            <>
              <ul className="streamer-tools-list">
                {TOOLS.map((t) => (
                  <li key={t.id} className="streamer-tools-list-item">
                    <div className="streamer-tools-list-meta">
                      <span className="streamer-tools-list-label">
                        {t.label}
                      </span>
                      <span className="streamer-tools-list-desc">
                        {t.description}
                      </span>
                    </div>
                    <button type="button"
                      className="streamer-tools-list-open"
                      onClick={() => setActiveTool(t.id)}
                    >
                      Open
                    </button>
                  </li>
                ))}
              </ul>
              <HistorySection onChanged={() => {}} />
              <PastPlaylistsSection
                channelKey={channelKey}
                publicOrigin={publicOrigin}
              />
            </>
          ) : (
            <div className="streamer-tools-active">
              <button type="button"
                className="streamer-tools-back"
                onClick={() => setActiveTool(null)}
                title="Back to tools"
              >
                <FaArrowLeft size={12} />
                <span>Back to tools</span>
              </button>
              {tool.id === "giveaway" && (
                <GiveawayPanel
                  giveaway={giveaway}
                  youtubeConnected={youtubeConnected}
                  onAnnounce={async (winner, text) => {
                    if (announcing) return;
                    setAnnouncing(true);
                    try {
                      await onAnnounce(winner, text);
                    } finally {
                      setAnnouncing(false);
                    }
                  }}
                  announcing={announcing}
                />
              )}
              {tool.id === "music-player" && (
                <MusicPlayerPanel
                  player={musicPlayer}
                  streamGameId={streamGameId}
                  streamGameName={streamGameName}
                  onSearchCategories={onSearchCategories}
                />
              )}
              {tool.id === "song-queue" && (
                <SongQueuePanel
                  publicOrigin={publicOrigin}
                  phase={songQueue.phase}
                  config={songQueue.config}
                  setConfig={songQueue.setConfig}
                  currentItem={songQueue.currentItem}
                  pending={songQueue.pending}
                  history={songQueue.history}
                  items={songQueue.items}
                  loading={songQueue.loading}
                  error={songQueue.error}
                  publicUrl={
                    songQueue.bootstrap
                      ? `${publicOrigin}${songQueue.bootstrap.publicUrl}`
                      : null
                  }
                  start={async () => {
                    await songQueue.start();
                  }}
                  end={async () => {
                    await songQueue.end();
                  }}
                  remove={async (id) => {
                    await songQueue.remove(id);
                  }}
                  skip={async (id) => {
                    await songQueue.skip(id);
                  }}
                  playNow={async (id) => {
                    await songQueue.playNow(id);
                  }}
                  next={async () => {
                    await songQueue.next();
                  }}
                  previous={async () => {
                    await songQueue.previous();
                  }}
                  reportDuration={async (id, dur) => {
                    await songQueue.reportDuration(id, dur);
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
