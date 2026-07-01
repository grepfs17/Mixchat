import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FaArrowLeft,
  FaTimes,
  FaTwitch,
  FaWindowMinimize,
  FaWrench,
  FaYoutube,
} from "react-icons/fa";
import GiveawayPanel from "./GiveawayPanel";
import SongQueuePanel from "./SongQueuePanel";
import type { GiveawayEntry } from "../../../lib/streamerTools/giveaway";
import type { UseGiveawayResult } from "../../../hooks/chat/useGiveaway";
import type { UseSongQueueResult } from "../../../hooks/chat/useSongQueue";
import {
  clearGiveawayHistory,
  getGiveawayHistory,
  type GiveawayHistoryEntry,
} from "../../../lib/streamerTools/history";

interface StreamerToolsModalProps {
  giveaway: UseGiveawayResult;
  songQueue: UseSongQueueResult;
  onAnnounce: (winner: GiveawayEntry, message: string) => Promise<void>;
  onMinimize: () => void;
  onClose: () => void;
  /** When provided, the modal opens directly into this tool. */
  initialTool?: ToolId | null;
  /** Whether the user is connected to YouTube (gates YouTube scope options). */
  youtubeConnected?: boolean;
  /** Public origin used to build the song-queue share link. */
  publicOrigin?: string;
}

type ToolId = "giveaway" | "song-queue";

interface ToolDescriptor {
  id: ToolId;
  label: string;
  description: string;
}

const TOOLS: ToolDescriptor[] = [
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
        <button
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

export default function StreamerToolsModal({
  giveaway,
  songQueue,
  onAnnounce,
  onMinimize,
  onClose,
  initialTool = null,
  youtubeConnected = false,
  publicOrigin = "",
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
  // song queue is minimizable while open.
  const canMinimize =
    (activeTool === "giveaway" && giveaway.phase !== "config") ||
    (activeTool === "song-queue" && songQueue.phase === "open");
  const minimizeTitle = canMinimize
    ? "Minimize (the tool keeps running in the corner)"
    : "Nothing to minimize in this state";

  const tool = useMemo(
    () => TOOLS.find((t) => t.id === activeTool) ?? null,
    [activeTool],
  );

  return (
    <div
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
            <button
              className="streamer-tools-header-btn"
              onClick={onMinimize}
              disabled={!canMinimize}
              title={minimizeTitle}
              aria-label="Minimize"
            >
              <FaWindowMinimize size={14} />
            </button>
            <button
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
                    <button
                      className="streamer-tools-list-open"
                      onClick={() => setActiveTool(t.id)}
                    >
                      Open
                    </button>
                  </li>
                ))}
              </ul>
              <HistorySection onChanged={() => {}} />
            </>
          ) : (
            <div className="streamer-tools-active">
              <button
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
