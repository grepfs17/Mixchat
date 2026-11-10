import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FaArrowLeft,
  FaCopy,
  FaInfoCircle,
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
import PollPanel from "./PollPanel";
import PredictionPanel from "./PredictionPanel";
import type { PollState, PredictionState } from "./bannerTypes";
import type { GiveawayEntry } from "../../../lib/streamerTools/giveaway";
import type { UseGiveawayResult } from "../../../hooks/chat/useGiveaway";
import type { UsePollCreatorResult } from "../../../hooks/chat/usePollCreator";
import type { UsePredictionCreatorResult } from "../../../hooks/chat/usePredictionCreator";
import type { UseSongQueueResult } from "../../../hooks/chat/useSongQueue";
import type { UseMusicPlayerResult } from "../../../hooks/chat/useMusicPlayer";
import {
  type GiveawayHistoryEntry,
} from "../../../lib/streamerTools/history";
import {
  usePastPlaylists,
  type CombinedItem,
} from "../../../hooks/chat/usePastPlaylists";
import type { PastPlaylistEntry } from "../../../lib/streamerTools/pastPlaylists";
import type { SongQueuePublicView } from "../../../lib/songQueue/types";
import { IS_DESKTOP } from "../../../lib/constants";
import { useChannelModerators } from "../../../hooks/chat/useChannelModerators";
import type {
  StreamToolsModAccess,
  StreamToolsSettings,
} from "../../../hooks/chat/useStreamToolsSettings";
import { giveawayAction } from "../../../lib/streamTools/api";

interface StreamerToolsModalProps {
  giveaway: UseGiveawayResult;
  poll: UsePollCreatorResult;
  livePoll: PollState | null;
  prediction: UsePredictionCreatorResult;
  livePrediction: PredictionState | null;
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
  /** Current Twitch category id, for playlist auto-select. */
  streamGameId?: string;
  /** Current Twitch category name, for playlist auto-select hint. */
  streamGameName?: string;
  /** Search Twitch categories (same API as stream-info category picker). */
  onSearchCategories?: (
    query: string,
  ) => Promise<Array<{ id: string; name: string }>>;
  /** Whether the viewer is the broadcaster or a moderator. */
  role?: "owner" | "moderator";
  /** Whether the broadcaster can run native polls and predictions. */
  affiliateEligible?: boolean;
  /** Server-backed access settings. The owner can edit `allowMods`, `modAccess` and `allowedMods`. */
  settings?: StreamToolsSettings;
  onUpdateSettings?: (
    patch: Partial<StreamToolsSettings>,
  ) => Promise<void>;
}

type ToolId =
  | "music-player"
  | "giveaway"
  | "poll"
  | "prediction"
  | "song-queue"
  | "wheel";

interface ToolDescriptor {
  id: ToolId;
  label: string;
  description: string;
}

const WEB_ONLY_TOOLS = new Set<ToolId>(["song-queue", "wheel"]);

function isToolAvailable(id: ToolId): boolean {
  return !IS_DESKTOP || !WEB_ONLY_TOOLS.has(id);
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
    id: "poll",
    label: "Poll",
    description: "Ask chat to vote with a Twitch poll.",
  },
  {
    id: "prediction",
    label: "Prediction",
    description: "Let viewers bet Channel Points on an outcome.",
  },
  {
    id: "song-queue",
    label: "Song Queue",
    description: "Let viewers queue YouTube songs in chat.",
  },
  {
    id: "wheel",
    label: "Wheel Spin",
    description:
      "Spin a wheel to pick a winner. Opens in a new tab. Save and share wheels.",
  },
];

const AVAILABLE_TOOLS = TOOLS.filter((tool) => isToolAvailable(tool.id));

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

function HistorySection({
  history,
  onClear,
}: {
  history: GiveawayHistoryEntry[];
  onClear: () => void;
}) {
  const handleClear = () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Clear all giveaway history? This cannot be undone.")
    ) {
      return;
    }
    onClear();
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

function PastPlaylistsEmpty({ serverError }: { serverError: string | null }) {
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

function PastPlaylistDetailItem({
  item,
  copiedItemId,
  onCopySongUrl,
}: {
  item: SongQueuePublicView["items"][number];
  copiedItemId: string | null;
  onCopySongUrl: (itemId: string, videoId: string) => void;
}) {
  return (
    <li
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
        onClick={() => onCopySongUrl(item.id, item.videoId)}
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
  );
}

function PastPlaylistDetailList({
  loadingDetail,
  detailError,
  items,
  copiedItemId,
  onCopySongUrl,
}: {
  loadingDetail: boolean;
  detailError: string | null;
  items: SongQueuePublicView["items"] | null;
  copiedItemId: string | null;
  onCopySongUrl: (itemId: string, videoId: string) => void;
}) {
  if (loadingDetail) {
    return <div className="past-playlists-detail-loading">Loading…</div>;
  }
  if (detailError) {
    return (
      <div className="past-playlists-detail-loading">
        Failed to load: {detailError}
      </div>
    );
  }
  if (!items || items.length === 0) {
    return (
      <div className="past-playlists-detail-loading">
        No songs in this queue.
      </div>
    );
  }
  return (
    <ul className="past-playlists-detail-list">
      {items.map((item) => (
        <PastPlaylistDetailItem
          key={item.id}
          item={item}
          copiedItemId={copiedItemId}
          onCopySongUrl={onCopySongUrl}
        />
      ))}
    </ul>
  );
}

function PastPlaylistDetailHeader({
  openMeta,
  openPublicUrl,
  makingPublic,
  linkCopied,
  publicError,
  onBack,
  onMakePublic,
  onCopyPublicUrl,
  onDelete,
}: {
  openMeta: CombinedItem;
  openPublicUrl: string | null;
  makingPublic: boolean;
  linkCopied: boolean;
  publicError: string | null;
  onBack: () => void;
  onMakePublic: (sessionId: string) => void;
  onCopyPublicUrl: () => void;
  onDelete: (key: string) => void;
}) {
  return (
    <>
      <div className="past-playlists-detail-header">
        <button type="button"
          className="past-playlists-back"
          onClick={onBack}
          title="Back to past playlists"
        >
          <FaArrowLeft size={12} />
          <span>Back</span>
        </button>
        <div className="past-playlists-detail-actions">
          {openMeta.source === "server" && !openMeta.isPublic ? (
            <button type="button"
              className="past-playlists-share"
              onClick={() => onMakePublic(openMeta.sessionId)}
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
              onClick={onCopyPublicUrl}
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
            onClick={() => onDelete(openMeta.key)}
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
    </>
  );
}

function PastPlaylistDetailMeta({ openMeta }: { openMeta: CombinedItem }) {
  return (
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
  );
}

function PastPlaylistDetail({
  openMeta,
  openKey,
  localEntries,
  serverDetail,
  loadingDetail,
  detailError,
  openPublicUrl,
  makingPublic,
  linkCopied,
  publicError,
  copiedItemId,
  onBack,
  onMakePublic,
  onCopyPublicUrl,
  onCopySongUrl,
  onDelete,
}: {
  openMeta: CombinedItem;
  openKey: string | null;
  localEntries: PastPlaylistEntry[];
  serverDetail: SongQueuePublicView | null;
  loadingDetail: boolean;
  detailError: string | null;
  openPublicUrl: string | null;
  makingPublic: boolean;
  linkCopied: boolean;
  publicError: string | null;
  copiedItemId: string | null;
  onBack: () => void;
  onMakePublic: (sessionId: string) => void;
  onCopyPublicUrl: () => void;
  onCopySongUrl: (itemId: string, videoId: string) => void;
  onDelete: (key: string) => void;
}) {
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
      <PastPlaylistDetailHeader
        openMeta={openMeta}
        openPublicUrl={openPublicUrl}
        makingPublic={makingPublic}
        linkCopied={linkCopied}
        publicError={publicError}
        onBack={onBack}
        onMakePublic={onMakePublic}
        onCopyPublicUrl={onCopyPublicUrl}
        onDelete={onDelete}
      />
      <PastPlaylistDetailMeta openMeta={openMeta} />
      <PastPlaylistDetailList
        loadingDetail={loadingDetail}
        detailError={detailError}
        items={items}
        copiedItemId={copiedItemId}
        onCopySongUrl={onCopySongUrl}
      />
    </div>
  );
}

function PastPlaylistListItem({
  entry,
  publicOrigin,
  onOpen,
  onDelete,
}: {
  entry: CombinedItem;
  publicOrigin: string;
  onOpen: (key: string) => void;
  onDelete: (key: string) => void;
}) {
  const entryUrl =
    entry.source === "server" && entry.isPublic
      ? `${publicOrigin}/s/${entry.sessionId}`
      : null;
  return (
    <li
      className="past-playlists-item"
      data-source={entry.source}
    >
      <button type="button"
        className="past-playlists-item-button"
        onClick={() => onOpen(entry.key)}
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
        onClick={() => onDelete(entry.key)}
        title="Delete this playlist"
        aria-label="Delete playlist"
      >
        <FaTrash size={11} />
      </button>
    </li>
  );
}

function PastPlaylistsList({
  combined,
  publicOrigin,
  loadingServer,
  serverError,
  onOpen,
  onDelete,
  onClear,
}: {
  combined: CombinedItem[];
  publicOrigin: string;
  loadingServer: boolean;
  serverError: string | null;
  onOpen: (key: string) => void;
  onDelete: (key: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="past-playlists">
      <div className="past-playlists-header">
        <span className="past-playlists-title">
          Past song queues{loadingServer ? " (loading…)" : ""}
        </span>
        <button type="button"
          className="past-playlists-clear"
          onClick={onClear}
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
        {combined.map((entry) => (
          <PastPlaylistListItem
            key={entry.key}
            entry={entry}
            publicOrigin={publicOrigin}
            onOpen={onOpen}
            onDelete={onDelete}
          />
        ))}
      </ul>
    </div>
  );
}

function PastPlaylistsSection({
  channelKey,
  publicOrigin = "",
}: {
  channelKey: string | null;
  publicOrigin?: string;
}) {
  const {
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
  } = usePastPlaylists(channelKey, publicOrigin);

  if (combined.length === 0 && !loadingServer) {
    return <PastPlaylistsEmpty serverError={serverError} />;
  }

  if (openMeta) {
    return (
      <PastPlaylistDetail
        openMeta={openMeta}
        openKey={openKey}
        localEntries={localEntries}
        serverDetail={serverDetail}
        loadingDetail={loadingDetail}
        detailError={detailError}
        openPublicUrl={openPublicUrl}
        makingPublic={makingPublic}
        linkCopied={linkCopied}
        publicError={publicError}
        copiedItemId={copiedItemId}
        onBack={() => setOpenKey(null)}
        onMakePublic={handleMakePublic}
        onCopyPublicUrl={handleCopyPublicUrl}
        onCopySongUrl={handleCopySongUrl}
        onDelete={handleDelete}
      />
    );
  }

  return (
    <PastPlaylistsList
      combined={combined}
      publicOrigin={publicOrigin}
      loadingServer={loadingServer}
      serverError={serverError}
      onOpen={setOpenKey}
      onDelete={handleDelete}
      onClear={handleClear}
    />
  );
}

export default function StreamerToolsModal({
  giveaway,
  poll,
  livePoll,
  prediction,
  livePrediction,
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
  role = "owner",
  affiliateEligible = true,
  settings,
  onUpdateSettings,
}: StreamerToolsModalProps) {
  const [activeTool, setActiveTool] = useState<ToolId | null>(
    initialTool && AVAILABLE_TOOLS.some((tool) => tool.id === initialTool)
      ? initialTool
      : null,
  );
  const [announcing, setAnnouncing] = useState(false);
  const [savingAccess, setSavingAccess] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [accessInfoOpen, setAccessInfoOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  const canManageAccess =
    role === "owner" && Boolean(settings) && Boolean(onUpdateSettings) && !IS_DESKTOP;
  const showModPicker = canManageAccess && Boolean(settings?.allowMods);
  const {
    mods,
    loading: modsLoading,
    settled: modsSettled,
    error: modsError,
    needsReauth: modsNeedsReauth,
    reload: reloadMods,
  } = useChannelModerators(
    channelKey,
    showModPicker && settings?.modAccess === "selected",
  );

  const saveAccessSettings = useCallback(
    async (patch: Partial<StreamToolsSettings>) => {
      if (!onUpdateSettings) return;
      setSavingAccess(true);
      setAccessError(null);
      try {
        await onUpdateSettings(patch);
      } catch (err) {
        setAccessError(
          err instanceof Error
            ? err.message
            : "Failed to save moderator access",
        );
      } finally {
        setSavingAccess(false);
      }
    },
    [onUpdateSettings],
  );

  const modRows = useMemo(() => {
    const rows = mods.map((mod) => ({
      key: mod.userId,
      id: mod.userId,
      login: mod.login,
      label: mod.displayName,
      stale: false,
    }));
    // Keep grants that Twitch no longer lists visible, so stale entries can
    // still be removed.
    const listed = new Set(rows.map((row) => row.id));
    for (const grant of settings?.allowedMods ?? []) {
      if (listed.has(grant.id)) continue;
      rows.push({
        key: `stale:${grant.id}`,
        id: grant.id,
        login: grant.login,
        label: grant.login || grant.id,
        stale: true,
      });
    }
    return rows;
  }, [mods, settings?.allowedMods]);

  const allowedModIds = new Set(
    (settings?.allowedMods ?? []).map((mod) => mod.id),
  );

  const toggleAllowedMod = useCallback(
    async (mod: { id: string; login: string }, checked: boolean) => {
      if (!settings) return;
      const current = settings.allowedMods.filter(
        (entry) => entry.id !== mod.id,
      );
      await saveAccessSettings({
        allowedMods: checked ? [...current, mod] : current,
      });
    },
    [settings, saveAccessSettings],
  );

  const setModAccess = useCallback(
    (modAccess: StreamToolsModAccess) => saveAccessSettings({ modAccess }),
    [saveAccessSettings],
  );

  // Switch panels when a caller requests a tool while the modal is already
  // open (for example `/createpoll`).
  useEffect(() => {
    if (initialTool && AVAILABLE_TOOLS.some((tool) => tool.id === initialTool)) {
      setActiveTool(initialTool);
    }
  }, [initialTool]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Unwind the innermost layer first.
      if (accessInfoOpen) {
        setAccessInfoOpen(false);
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, accessInfoOpen]);

  // Minimize is allowed whenever the active tool has something to keep
  // running. The giveaway is minimizable while running or revealed. The
  // song queue is minimizable while open. The music player is minimizable
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
    () => AVAILABLE_TOOLS.find((t) => t.id === activeTool) ?? null,
    [activeTool],
  );

  const openWheelTool = useCallback(() => {
    const origin =
      publicOrigin ||
      (typeof window !== "undefined" ? window.location.origin : "");
    const query = channelKey
      ? `?channel=${encodeURIComponent(channelKey)}`
      : "";
    window.open(`${origin}/wheel${query}`, "_blank", "noopener,noreferrer");
  }, [channelKey, publicOrigin]);

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
        aria-label="Stream tools"
      >
        <div className="streamer-tools-header">
          <h2 className="streamer-tools-title">
            <FaWrench size={18} />{" "}
            {tool ? `Stream tools - ${tool.label}` : "Stream tools"}
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
              {role === "moderator" && (
                <div className="stream-tools-access-banner">
                  You are controlling Stream tools as a moderator.
                </div>
              )}
              {role === "owner" && settings && onUpdateSettings && !IS_DESKTOP && (
                <div className="stream-tools-access">
                  <div className="stream-tools-access-row">
                    <label className="stream-tools-access-toggle">
                      <input
                        type="checkbox"
                        checked={settings.allowMods}
                        disabled={savingAccess}
                        onChange={(e) =>
                          void saveAccessSettings({
                            allowMods: e.target.checked,
                          })
                        }
                      />
                      <span>Allow moderators to use Stream tools</span>
                    </label>
                    <button
                      type="button"
                      className="stream-tools-access-info"
                      onClick={() => setAccessInfoOpen(true)}
                      title="What can moderators do?"
                      aria-label="What can moderators do?"
                    >
                      <FaInfoCircle size={13} />
                    </button>
                  </div>

                  {accessError && (
                    <div className="stream-tools-access-error" role="alert">
                      {accessError}
                    </div>
                  )}

                  {settings.allowMods && (
                    <fieldset
                      className="stream-tools-access-scope"
                      disabled={savingAccess}
                    >
                      <legend className="stream-tools-access-scope-label">
                        Give access to
                      </legend>
                      <label className="stream-tools-access-scope-option">
                        <input
                          type="radio"
                          name="stream-tools-mod-access"
                          checked={settings.modAccess === "all"}
                          onChange={() => void setModAccess("all")}
                        />
                        <span>All moderators</span>
                      </label>
                      <label className="stream-tools-access-scope-option">
                        <input
                          type="radio"
                          name="stream-tools-mod-access"
                          checked={settings.modAccess === "selected"}
                          onChange={() => void setModAccess("selected")}
                        />
                        <span>Only selected moderators</span>
                      </label>

                      {settings.modAccess === "selected" && (
                        <div
                          className="stream-tools-access-mods"
                          role="group"
                          aria-label="Select moderators"
                        >
                          {modsLoading && (
                            <span className="stream-tools-access-mods-status">
                              Loading moderators...
                            </span>
                          )}
                          {modsNeedsReauth && (
                            <span className="stream-tools-access-mods-status">
                              Reconnect your Twitch account to load the
                              moderator list.
                            </span>
                          )}
                          {modsError && (
                            <span className="stream-tools-access-mods-error">
                              {modsError}{" "}
                              <button
                                type="button"
                                className="stream-tools-access-mods-retry"
                                onClick={reloadMods}
                              >
                                Retry
                              </button>
                            </span>
                          )}
                          {modsSettled &&
                            !modsError &&
                            !modsNeedsReauth &&
                            modRows.length === 0 && (
                              <span className="stream-tools-access-mods-status">
                                No moderators found.
                              </span>
                            )}
                          {modsSettled &&
                            modRows.map((row) => (
                              <label
                                key={row.key}
                                className="stream-tools-access-mod"
                              >
                                <input
                                  type="checkbox"
                                  checked={allowedModIds.has(row.id)}
                                  onChange={(e) =>
                                    void toggleAllowedMod(
                                      { id: row.id, login: row.login },
                                      e.target.checked,
                                    )
                                  }
                                />
                                <span>{row.label}</span>
                                {row.stale && (
                                  <span className="stream-tools-access-mod-note">
                                    not a moderator
                                  </span>
                                )}
                              </label>
                            ))}
                          {modsSettled &&
                            !modsError &&
                            modRows.length > 0 &&
                            settings.allowedMods.length === 0 && (
                              <span className="stream-tools-access-mods-status">
                                No one is selected, so no moderator gets
                                access.
                              </span>
                            )}
                        </div>
                      )}
                    </fieldset>
                  )}
                </div>
              )}

              {accessInfoOpen && (
                <div
                  className="stream-tools-access-modal"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="stream-tools-access-title"
                  onClick={() => setAccessInfoOpen(false)}
                >
                  <div
                    className="stream-tools-access-modal-box"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="stream-tools-access-modal-head">
                      <h3 id="stream-tools-access-title">
                        <FaInfoCircle size={15} />
                        What moderators can do
                      </h3>
                      <button
                        type="button"
                        className="stream-tools-access-modal-close"
                        onClick={() => setAccessInfoOpen(false)}
                        title="Close"
                        aria-label="Close"
                      >
                        <FaTimes size={14} />
                      </button>
                    </div>

                    <p className="stream-tools-access-modal-intro">
                      When this is on, Twitch moderators of your channel get
                      the same Stream tools you have. You can allow every
                      moderator or only the ones you select.
                    </p>

                    <div className="stream-tools-access-modal-cols">
                      <div className="stream-tools-access-modal-col">
                        <h4>They can</h4>
                        <ul>
                          <li>Run a giveaway: start, cancel, reveal, announce</li>
                          <li>Use the music player: playlists, tracks, play/pause</li>
                          <li>Manage the song queue: start, end, add, skip, remove</li>
                          <li>Create and edit wheels: rename, options, delete</li>
                          <li>Request Twitch polls, run by the streamer</li>
                        </ul>
                      </div>
                      <div className="stream-tools-access-modal-col">
                        <h4>They can&apos;t</h4>
                        <ul>
                          <li>Spin the wheel</li>
                          <li>Create or manage Twitch predictions</li>
                          <li>Change this setting</li>
                        </ul>
                      </div>
                    </div>

                    <p className="stream-tools-access-modal-note">
                      Only Twitch moderators are included, and only those you
                      allow.
                    </p>

                    <div className="stream-tools-access-modal-actions">
                      <button
                        type="button"
                        className="stream-tools-access-modal-ok"
                        onClick={() => setAccessInfoOpen(false)}
                      >
                        Got it
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <ul className="streamer-tools-list">
                {AVAILABLE_TOOLS.map((t) => (
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
                      onClick={() => {
                        if (t.id === "wheel") {
                          openWheelTool();
                          return;
                        }
                        setActiveTool(t.id);
                      }}
                    >
                      Open
                    </button>
                  </li>
                ))}
              </ul>
              <HistorySection
                history={giveaway.history}
                onClear={giveaway.clearHistory}
              />
              {!IS_DESKTOP && (
                <PastPlaylistsSection
                  channelKey={channelKey}
                  publicOrigin={publicOrigin}
                />
              )}
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
                    // Shared giveaways: exactly one client may post the
                    // winner message. Claim it first and bail if another
                    // client already did.
                    if (!IS_DESKTOP && channelKey) {
                      try {
                        const res = await giveawayAction(
                          channelKey,
                          "claimAnnounce",
                        );
                        if (!res.claimedWinner) return;
                      } catch {
                        return;
                      }
                    }
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
              {tool.id === "poll" && (
                <PollPanel
                  poll={poll}
                  livePoll={livePoll}
                  role={role}
                  affiliateEligible={affiliateEligible}
                />
              )}
              {tool.id === "prediction" && (
                <PredictionPanel
                  prediction={prediction}
                  livePrediction={livePrediction}
                  role={role}
                  affiliateEligible={affiliateEligible}
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
