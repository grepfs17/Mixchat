import { useCallback, useEffect, useRef, useState } from "react";
import {
  MdClose,
  MdBarChart,
  MdContentCopy,
  MdCheck,
  MdExpandMore,
  MdExpandLess,
  MdRefresh,
} from "react-icons/md";
import { FaTwitch, FaYoutube } from "react-icons/fa";
import type { Platform } from "../../../lib/types";
import type {
  ChatStatEntry,
  ChatStatUser,
  ChatStatsResult,
} from "../../../lib/chatStats";
import "../../../styles/chat/ChatStatsOverlay.css";

interface ChatStatsOverlayProps {
  stats: ChatStatsResult;
  loading?: boolean;
  onClose: () => void;
  onResetEntry?: (key: string) => void;
  onResetEntries?: () => void;
}

function platformIcon(platform: Platform) {
  if (platform === "youtube") {
    return <FaYoutube size={11} className="chat-stats-user-platform youtube" />;
  }
  return <FaTwitch size={11} className="chat-stats-user-platform twitch" />;
}

function UserChip({ user }: { user: ChatStatUser }) {
  return (
    <span
      className="chat-stats-user"
      title={`${user.author} · ${user.count} message${user.count === 1 ? "" : "s"}`}
    >
      {user.authorAvatar ? (
        <img src={user.authorAvatar} alt="" className="chat-stats-user-avatar" />
      ) : (
        platformIcon(user.platform)
      )}
      <span className="chat-stats-user-name">
        {user.author.replace(/^@+/, "")}
      </span>
      {user.count > 1 && (
        <span className="chat-stats-user-count">{user.count}×</span>
      )}
    </span>
  );
}

export default function ChatStatsOverlay({
  stats,
  loading = false,
  onClose,
  onResetEntry,
  onResetEntries,
}: ChatStatsOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [repeatedOpen, setRepeatedOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const confirmResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      if (confirmResetRef.current) clearTimeout(confirmResetRef.current);
    };
  }, []);

  const handleResetEntries = useCallback(() => {
    if (!confirmReset) {
      setConfirmReset(true);
      if (confirmResetRef.current) clearTimeout(confirmResetRef.current);
      confirmResetRef.current = setTimeout(() => setConfirmReset(false), 3000);
      return;
    }
    if (confirmResetRef.current) clearTimeout(confirmResetRef.current);
    setConfirmReset(false);
    onResetEntries?.();
  }, [confirmReset, onResetEntries]);

  const handleCopyUsers = useCallback((key: string, users: ChatStatUser[]) => {
    const text = users
      .map((user) => user.author.replace(/^@+/, ""))
      .join("\n");
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedKey(key);
        if (copyResetRef.current) clearTimeout(copyResetRef.current);
        copyResetRef.current = setTimeout(() => setCopiedKey(null), 2000);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-chat-stats-trigger]")) return;
      if (overlayRef.current && !overlayRef.current.contains(target)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const { entries, repeatedTotal, totalMessages, chatters, mods } = stats;

  return (
    <div
      ref={overlayRef}
      className="chat-stats-overlay"
      role="dialog"
      aria-label="Chat statistics"
    >
      <div className="chat-stats-header">
        <div className="chat-stats-header-info">
          <MdBarChart size={20} className="chat-stats-header-icon" />
          <div>
            <h2 className="chat-stats-title">Chat Stats</h2>
            <span className="chat-stats-subtitle">Channel activity</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="overlay-btn-icon"
          aria-label="Close chat stats"
        >
          <MdClose size={24} />
        </button>
      </div>

      <div className="chat-stats-summary">
        <div className="chat-stats-summary-card">
          <span className="chat-stats-summary-value">
            {chatters.toLocaleString()}
          </span>
          <span className="chat-stats-summary-label">Chatters</span>
        </div>
        <div className="chat-stats-summary-card">
          <span className="chat-stats-summary-value">
            {totalMessages.toLocaleString()}
          </span>
          <span className="chat-stats-summary-label">Messages</span>
        </div>
      </div>

      <div className="chat-stats-body custom-scrollbar">
        {loading && (
          <div className="chat-stats-loading">Loading full history…</div>
        )}

        <div className="chat-stats-mods">
          <div className="chat-stats-mods-header">
            <span className="chat-stats-section-title">Mods</span>
            <span className="chat-stats-section-count">{mods.length}</span>
            {mods.length > 0 && (
              <button
                type="button"
                className="chat-stats-copy"
                onClick={() => handleCopyUsers("mods", mods)}
                title="Copy moderators"
              >
                {copiedKey === "mods" ? (
                  <MdCheck size={12} />
                ) : (
                  <MdContentCopy size={12} />
                )}
                <span>{copiedKey === "mods" ? "Copied" : "Copy names"}</span>
              </button>
            )}
          </div>
          {mods.length === 0 ? (
            <div className="chat-stats-empty chat-stats-empty--inline">
              {loading ? "Analyzing…" : "No moderators seen yet."}
            </div>
          ) : (
            <div className="chat-stats-users">
              {mods.map((user) => (
                <UserChip key={user.author.toLowerCase()} user={user} />
              ))}
            </div>
          )}
        </div>

        <div className="chat-stats-section-header">
          <button
            type="button"
            className="chat-stats-section-toggle"
            onClick={() => setRepeatedOpen((v) => !v)}
            aria-expanded={repeatedOpen}
          >
            {repeatedOpen ? (
              <MdExpandLess size={16} />
            ) : (
              <MdExpandMore size={16} />
            )}
            <span className="chat-stats-section-title">
              Most repeated messages
            </span>
            <span className="chat-stats-section-count">{repeatedTotal}</span>
          </button>
          {onResetEntries && repeatedTotal > 0 && (
            <button
              type="button"
              className={`chat-stats-reset${confirmReset ? " chat-stats-reset--confirm" : ""}`}
              onClick={handleResetEntries}
              title={
                confirmReset ? "Click again to confirm" : "Reset all counters"
              }
              aria-label={
                confirmReset
                  ? "Confirm reset all repeated message counters"
                  : "Reset all repeated message counters"
              }
            >
              <MdRefresh size={13} />
              {confirmReset && <span>Confirm</span>}
            </button>
          )}
        </div>

        {repeatedOpen &&
          (entries.length === 0 ? (
            <div className="chat-stats-empty chat-stats-empty--inline">
              {loading ? "Analyzing…" : "No repeated messages yet."}
            </div>
          ) : (
            <div className="chat-stats-list">
              {entries.map((entry, idx) => (
                <div key={entry.key} className="chat-stats-item">
                  <div className="chat-stats-item-main">
                    <span className="chat-stats-rank">#{idx + 1}</span>
                    <span className="chat-stats-content" title={entry.content}>
                      {entry.content}
                    </span>
                    <span className="chat-stats-count">{entry.count}×</span>
                    {onResetEntry && (
                      <button
                        type="button"
                        className="chat-stats-reset"
                        onClick={() => onResetEntry(entry.key)}
                        title="Reset counter"
                        aria-label={`Reset counter for ${entry.content}`}
                      >
                        <MdRefresh size={13} />
                      </button>
                    )}
                  </div>
                  <div className="chat-stats-users">
                    {entry.users.map((user) => (
                      <UserChip key={user.author.toLowerCase()} user={user} />
                    ))}
                    <button
                      type="button"
                      className="chat-stats-copy"
                      onClick={() => handleCopyUsers(entry.key, entry.users)}
                      title="Copy usernames"
                    >
                      {copiedKey === entry.key ? (
                        <MdCheck size={12} />
                      ) : (
                        <MdContentCopy size={12} />
                      )}
                      <span>
                        {copiedKey === entry.key ? "Copied" : "Copy names"}
                      </span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
      </div>

      <div className="chat-stats-footer">
        <span>{repeatedTotal} repeated messages</span>
        <span>Full retained history</span>
      </div>
    </div>
  );
}
