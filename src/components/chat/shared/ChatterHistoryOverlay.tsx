import React, { useEffect, useState, useRef } from "react";
import {
  MdClose,
  MdHistory,
  MdOpenInNew,
  MdBlock,
  MdWarning,
} from "react-icons/md";
import { FaYoutube, FaTwitch } from "react-icons/fa";
import { resolveBroadcasterId } from "../../../lib/twitch";
import type { TwitchMessage, Platform } from "../../../lib/types";
import { getUserHistory } from "../../../lib/chatHistoryStorage";
import { parseMessageWithEmotes } from "../../../lib/emotes";
import { useModerationContext } from "../../../contexts/ModerationContext";
import MessageBadges from "../../MessageBadges";
import { useMemo } from "react";
import "../../../styles/chat/ChatterHistoryOverlay.css";

interface ChatterHistoryOverlayProps {
  author: string;
  channel: string;
  platform: Platform;
  authorAvatar?: string;
  onClose: () => void;
}

export default function ChatterHistoryOverlay({
  author,
  channel,
  platform,
  authorAvatar,
  onClose,
}: ChatterHistoryOverlayProps) {
  const {
    isModerator,
    isYouTubeModerator,
    onTimeoutUser,
    onBanUser,
    onWarnUser,
    onTimeoutYouTubeUser,
    onBanYouTubeUser,
  } = useModerationContext();
  const [history, setHistory] = useState<TwitchMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        overlayRef.current &&
        !overlayRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    getUserHistory(author, channel, 24, platform)
      .then((data) => {
        if (mounted) {
          setHistory(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to load history:", err);
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [author, channel, platform]);

  useEffect(() => {
    if (!loading && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [loading, history]);

  // Find a valid user ID from history
  const [resolvedUserId, setResolvedUserId] = useState<string | undefined>(
    undefined,
  );

  useEffect(() => {
    if (loading) return;

    // Try to find it in history first (non-empty ID)
    const idFromHistory = history.find(
      (m) => m.userId && m.userId !== "system",
    )?.userId;
    if (idFromHistory) {
      console.log(
        `[ChatterHistory] Found userId in history for ${author}: ${idFromHistory}`,
      );
      setResolvedUserId(idFromHistory);
      return;
    }

    // If not found and we are on Twitch, resolve it via API
    if (platform === "twitch") {
      console.log(`[ChatterHistory] Resolving userId via API for ${author}...`);
      resolveBroadcasterId(author).then((id) => {
        if (id && (id !== author || /^\d+$/.test(id))) {
          console.log(
            `[ChatterHistory] Resolved userId via API for ${author}: ${id}`,
          );
          setResolvedUserId(id);
        } else {
          console.warn(
            `[ChatterHistory] Failed to resolve userId for ${author}`,
          );
        }
      });
    }
  }, [loading, history, author, platform]);

  // For YouTube, prefer the channelId (UC...) from history, since we already
  // have it on every recorded message.
  const youtubeChannelId = useMemo(() => {
    if (platform !== "youtube") return undefined;
    for (let i = history.length - 1; i >= 0; i--) {
      const ch = (history[i] as any).authorChannelId;
      if (ch) return ch as string;
    }
    return undefined;
  }, [history, platform]);

  const isYouTube = platform === "youtube";
  const canModerate = isYouTube ? isYouTubeModerator : isModerator;
  const userId = isYouTube ? youtubeChannelId : resolvedUserId;

  const mostRecentBadges = useMemo(() => {
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].badgeDetails || history[i].badges) {
        return {
          badgeDetails: history[i].badgeDetails,
          badges: history[i].badges,
        };
      }
    }
    return null;
  }, [history]);

  const handleTimeout = (sec: number) => {
    console.log(
      `[ChatterHistory] Internal Timeout click: userId=${userId}, author=${author}, sec=${sec}`,
    );
    if (!userId) {
      console.error("[ChatterHistory] Cannot timeout: userId is missing");
      return;
    }
    if (isYouTube) {
      if (!onTimeoutYouTubeUser) {
        console.error(
          "[ChatterHistory] onTimeoutYouTubeUser handler is missing",
        );
        return;
      }
      onTimeoutYouTubeUser(userId, sec, author);
    } else {
      if (!onTimeoutUser) {
        console.error("[ChatterHistory] onTimeoutUser handler is missing");
        return;
      }
      onTimeoutUser(userId, sec, author);
    }
  };

  const handleBan = () => {
    console.log(
      `[ChatterHistory] Internal Ban click: userId=${userId}, author=${author}`,
    );
    if (!userId) {
      console.error("[ChatterHistory] Cannot ban: userId is missing");
      return;
    }
    if (isYouTube) {
      if (!onBanYouTubeUser) {
        console.error("[ChatterHistory] onBanYouTubeUser handler is missing");
        return;
      }
      onBanYouTubeUser(userId, author);
    } else {
      if (!onBanUser) {
        console.error("[ChatterHistory] onBanUser handler is missing");
        return;
      }
      onBanUser(userId, author);
    }
  };

  const handleWarn = () => {
    console.log(`[ChatterHistory] Internal Warn click: author=${author}`);
    if (isYouTube) return; // YouTube has no warn action
    if (!onWarnUser) {
      console.error("[ChatterHistory] onWarnUser handler is missing");
      return;
    }
    onWarnUser(author);
  };

  return (
    <div ref={overlayRef} className="chatter-history-overlay">
      {/* Header */}
      <div className="history-header">
        <div className="history-header-info">
          {authorAvatar ? (
            <img
              src={authorAvatar}
              alt={author}
              className="history-header-avatar"
            />
          ) : (
            <MdHistory size={20} color="#9146ff" />
          )}
          <div>
            <h2 className="history-header-title">
              <MessageBadges {...mostRecentBadges} />@
              {author.replace(/^@+/, "")}
              {platform === "youtube" && (
                <FaYoutube
                  size={14}
                  className="history-platform-icon history-platform-icon--youtube"
                />
              )}
              {platform === "twitch" && (
                <FaTwitch
                  size={14}
                  className="history-platform-icon history-platform-icon--twitch"
                />
              )}
            </h2>
            <span className="history-header-subtitle">
              {platform === "twitch" ? "Twitch Chatter" : "YouTube Chatter"}
            </span>
          </div>
        </div>
        <div className="history-header-actions">
          {platform === "twitch" && (
            <a
              href={`https://twitch.tv/${author}`}
              target="_blank"
              rel="noopener noreferrer"
              className="overlay-btn-icon"
              title="View Channel"
            >
              <MdOpenInNew size={20} />
            </a>
          )}
          <button type="button" onClick={onClose} className="overlay-btn-icon">
            <MdClose size={24} />
          </button>
        </div>
      </div>

      {/* Moderation Toolbar */}
      {canModerate && (platform === "twitch" || platform === "youtube") && (
        <div className="moderation-toolbar">
          <span className="mod-label">MOD:</span>

          <div className="mod-buttons-group">
            {isYouTube
              ? [
                  { label: "1m", sec: 60 },
                  { label: "5m", sec: 300 },
                  { label: "10m", sec: 600 },
                  { label: "1h", sec: 3600 },
                ].map((t) => (
                  <button type="button"
                    key={t.label}
                    onClick={() => handleTimeout(t.sec)}
                    disabled={!userId}
                    className="mod-btn"
                  >
                    {t.label}
                  </button>
                ))
              : [
                  { label: "10m", sec: 600 },
                  { label: "1h", sec: 3600 },
                  { label: "24h", sec: 86400 },
                ].map((t) => (
                  <button type="button"
                    key={t.label}
                    onClick={() => handleTimeout(t.sec)}
                    disabled={!userId}
                    className="mod-btn"
                  >
                    {t.label}
                  </button>
                ))}
          </div>

          <button type="button"
            onClick={handleBan}
            disabled={!userId}
            className="mod-btn mod-btn-ban"
          >
            <MdBlock size={14} /> Ban
          </button>

          {!isYouTube && (
            <button type="button" onClick={handleWarn} className="mod-btn mod-btn-warn">
              <MdWarning size={14} /> Warn
            </button>
          )}
        </div>
      )}

      {/* History List */}
      <div ref={scrollRef} className="history-list custom-scrollbar">
        {loading ? (
          <div className="history-empty-state">Loading session log...</div>
        ) : history.length === 0 ? (
          <div className="history-empty-state">
            No messages captured in this session.
          </div>
        ) : (
          history.map((msg, idx) => (
            <div
              key={msg.id}
              className={`history-item ${idx % 2 !== 0 ? "history-item-alt" : ""} ${msg.isDeleted ? "history-item-deleted" : ""}`}
            >
              <div className="history-item-content">
                <span className="history-item-timestamp">
                  {msg.timestamp.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <div className="history-item-text-container">
                  {(msg.badgeDetails || msg.badges) && (
                    <div className="history-item-badges">
                      <MessageBadges
                        badgeDetails={msg.badgeDetails}
                        badges={msg.badges}
                      />
                    </div>
                  )}
                  <div
                    className={`history-item-text ${msg.isDeleted ? "deleted" : ""}`}
                    dangerouslySetInnerHTML={{
                      __html: parseMessageWithEmotes(msg.content, msg.emotes, {
                        gigantified: msg.isGigantifiedEmote,
                      }),
                    }}
                  />
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="history-footer">
        <span>Session logs (24h)</span>
        <span>{history.length} messages</span>
      </div>
    </div>
  );
}
