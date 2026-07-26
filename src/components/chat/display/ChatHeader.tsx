import { useState, useRef, useEffect, useCallback } from "react";
import {
  MdRefresh,
  MdEdit,
  MdCheck,
  MdClose,
  MdVisibilityOff,
  MdMoreVert,
  MdBuild,
} from "react-icons/md";
import {
  FaUsers,
  FaChevronLeft,
  FaChevronRight,
  FaTwitch,
  FaYoutube,
} from "react-icons/fa";
import { GiCrossedSwords } from "react-icons/gi";
import { useModerationContext } from "../../../contexts/ModerationContext";
import CategoryDropdown from "./CategoryDropdown";
import type { CategoryResult } from "./types";
import type { Platform } from "../../../lib/types";
import type { SubscriptionStatus } from "../../../hooks/chat/useEventSub";

interface ChatHeaderProps {
  channelName?: string;
  channelDisplayName?: string;
  isStreamLive?: boolean;
  streamUptime?: string;
  streamTitle?: string;
  streamGameName?: string;
  viewerCount?: number | null;
  hideViewerCount?: boolean;
  isLoading?: boolean;
  isRefreshingEmotes?: boolean;
  showStreamEmbed?: boolean;
  sidebarVisible?: boolean;
  onToggleSidebar?: () => void;
  onToggleStreamEmbed?: () => void;
  onRefreshEmotes?: () => void;
  onUpdateTitle?: (title: string) => Promise<void>;
  onUpdateCategory?: (gameId: string, gameName: string) => Promise<void>;
  onSearchCategories?: (query: string) => Promise<CategoryResult[]>;
  ignoredUserCounts?: Map<
    string,
    {
      count: number;
      displayName: string;
      authorAvatar?: string;
      platform: Platform;
    }
  >;
  onOpenIgnoredUserOverlay?: (
    author: string,
    authorAvatar?: string,
    platform?: Platform,
  ) => void;
  showModTools?: boolean;
  onOpenModTools?: () => void;
  subscriptionStatuses?: Map<string, SubscriptionStatus>;
  isOnOwnChannel?: boolean;
}

export default function ChatHeader({
  channelName,
  channelDisplayName,
  isStreamLive,
  streamUptime,
  streamTitle,
  streamGameName,
  viewerCount,
  hideViewerCount,
  isLoading,
  isRefreshingEmotes,
  showStreamEmbed,
  sidebarVisible,
  onToggleSidebar,
  onToggleStreamEmbed,
  onRefreshEmotes,
  onUpdateTitle,
  onUpdateCategory,
  onSearchCategories,
  ignoredUserCounts = new Map(),
  onOpenIgnoredUserOverlay,
  showModTools = false,
  onOpenModTools,
  subscriptionStatuses,
  isOnOwnChannel = false,
}: ChatHeaderProps) {
  const {
    isModerator,
    modModeActive,
    isYouTubeModerator,
    youtubeModModeActive,
    onSetModMode,
  } = useModerationContext();
  const showModToggle = isModerator || isYouTubeModerator;
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [editingCategory, setEditingCategory] = useState(false);
  const [categoryInput, setCategoryInput] = useState("");
  const [categoryResults, setCategoryResults] = useState<CategoryResult[]>([]);
  const [searchingCategory, setSearchingCategory] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);
  const [categoryDropdownPos, setCategoryDropdownPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const categorySearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const categoryInputRef = useRef<HTMLInputElement>(null);
  const modModeDropdownRef = useRef<HTMLDivElement>(null);
  const [modModeDropdownOpen, setModModeDropdownOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);

  useEffect(() => {
    if (!editingCategory) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const portalDropdown = document.getElementById(
        "category-dropdown-portal",
      );
      if (
        categoryDropdownRef.current?.contains(target) ||
        portalDropdown?.contains(target) ||
        categoryInputRef.current === target
      ) {
        return;
      }
      setEditingCategory(false);
      setCategoryResults([]);
      setCategoryDropdownPos(null);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [editingCategory]);

  useEffect(() => {
    if (!modModeDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (!modModeDropdownRef.current?.contains(e.target as Node)) {
        setModModeDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [modModeDropdownOpen]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (!mobileMenuRef.current?.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!statusDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (!statusDropdownRef.current?.contains(e.target as Node)) {
        setStatusDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [statusDropdownOpen]);

  const handleSaveTitle = useCallback(() => {
    setSavingTitle(true);
    onUpdateTitle?.(titleInput).finally(() => {
      setSavingTitle(false);
      setEditingTitle(false);
    });
  }, [onUpdateTitle, titleInput]);

  const handleSaveCategory = useCallback(
    (id: string, name: string) => {
      setSavingCategory(true);
      onUpdateCategory?.(id, name).finally(() => {
        setSavingCategory(false);
        setEditingCategory(false);
        setCategoryResults([]);
        setCategoryDropdownPos(null);
      });
    },
    [onUpdateCategory],
  );

function getOverallStatus(
  statuses: Map<string, SubscriptionStatus>,
  keys: string[] | null,
  conditionFilter?: string,
): SubscriptionStatus | "disconnected" {
    if (keys === null) {
      return statuses.size > 0 ? "connected" : "disconnected";
    }
    const relevant = Array.from(statuses.entries()).filter(([k]) => {
      if (!keys.some((prefix) => k.startsWith(prefix + ":"))) return false;
      if (conditionFilter) return k.includes(conditionFilter);
      return true;
    });
    if (relevant.length === 0) return "disconnected";
    if (relevant.every(([, s]) => s === "connected")) return "connected";
    if (relevant.some(([, s]) => s === "error")) return "error";
    if (relevant.some(([, s]) => s === "scope_error")) return "scope_error";
  return "pending";
}

function statusLabel(s: SubscriptionStatus | "disconnected") {
    switch (s) {
      case "connected":
        return "connected";
      case "pending":
        return "connecting";
      case "error":
        return "error";
      case "scope_error":
        return "scope missing";
    case "disconnected":
      return "disabled";
  }
}

const FRIENDLY_NAMES: Record<string, string> = {
    "automod.message.hold": "Message Held",
    "automod.message.update": "Message Resolved",
    "channel.raid": "Incoming Raid",
    "channel.raid:to_broadcaster": "Incoming Raid",
    "channel.raid:from_broadcaster": "Outgoing Raid",
    "channel.channel_points_custom_reward_redemption.add": "Reward Redeemed",
    "channel.hype_train.begin": "Train Started",
    "channel.hype_train.progress": "Train Progress",
    "channel.hype_train.end": "Train Ended",
    "channel.poll.begin": "Poll Started",
    "channel.poll.progress": "Poll Progress",
    "channel.poll.end": "Poll Ended",
    "channel.prediction.begin": "Prediction Started",
    "channel.prediction.progress": "Prediction Progress",
    "channel.prediction.lock": "Prediction Locked",
    "channel.prediction.end": "Prediction Resolved",
  "channel.bits.use": "Bits Used",
};

  const renderStatusSection = (
    label: string,
    statuses: Map<string, SubscriptionStatus>,
    keys: string[] | null,
    conditionFilter?: string,
  ) => {
    const overall = getOverallStatus(statuses, keys, conditionFilter);
    return (
      <div className="eventsub-status-section">
        <div className={`eventsub-status-row eventsub-status--${overall}`}>
          <span className="eventsub-status-dot" />
          <span className="eventsub-status-label">{label}</span>
          <span className="eventsub-status-value">{statusLabel(overall)}</span>
        </div>
        {keys &&
          keys.map((typePrefix) => {
            const entry = Array.from(statuses.entries()).find(([k]) => {
              if (!k.startsWith(typePrefix + ":")) return false;
              if (conditionFilter) return k.includes(conditionFilter);
              return true;
            });
            const status = entry?.[1];
            const nameKey = conditionFilter
              ? `${typePrefix}:${conditionFilter}`
              : typePrefix;
            const label = FRIENDLY_NAMES[nameKey] || FRIENDLY_NAMES[typePrefix] || typePrefix.split(".").pop() || typePrefix;
            return (
              <div
                key={typePrefix}
                className={`eventsub-status-item eventsub-status--${status ?? "disconnected"}`}
              >
                <span className="eventsub-status-dot" />
                <span className="eventsub-status-item-label">{label}</span>
                <span className="eventsub-status-value">
                  {status ? statusLabel(status) : "disabled"}
                </span>
              </div>
            );
          })}
      </div>
    );
  };

  return (
    <>
      <div className="chat-header">
        <div className="chat-header-content">
          {onToggleSidebar && (
            <button type="button"
              onClick={onToggleSidebar}
              className={`sidebar-toggle-button${showStreamEmbed ? " sidebar-toggle-button--embed-active" : ""}`}
              title={sidebarVisible ? "Fold sidebar" : "Unfold sidebar"}
            >
              {sidebarVisible ? <FaChevronLeft /> : <FaChevronRight />}
            </button>
          )}
          {!showStreamEmbed && onToggleStreamEmbed && (
            <button type="button"
              onClick={onToggleStreamEmbed}
              className="show-stream-button"
              title="Show stream embed"
            >
              Show Stream
            </button>
          )}
          <h2>
            <span className="status-badge-container" ref={statusDropdownRef}>
            <button
              type="button"
              className="status-badge-button"
              onClick={() => setStatusDropdownOpen((v) => !v)}
              title="EventSub connection status"
            >
                {isStreamLive ? (
                  <span className="status-badge-live">
                    <span className="status-dot pulse" />
                    <span className="status-badge-live-text">LIVE</span>
                  </span>
                ) : (
                  <span className="status-badge-offline">
                    <span className="status-dot" />
                    <span className="status-badge-offline-text">OFFLINE</span>
                  </span>
                )}
              </button>
              {statusDropdownOpen && subscriptionStatuses && (
                <div className="eventsub-status-dropdown">
                  <div className="eventsub-status-header">EventSub Connections</div>
                  {renderStatusSection("WebSocket", subscriptionStatuses, null)}
                  {renderStatusSection("Automod", subscriptionStatuses, [
                    "automod.message.hold",
                    "automod.message.update",
                  ])}
                  {renderStatusSection("Incoming Raids", subscriptionStatuses, [
                    "channel.raid",
                  ], "to_broadcaster")}
                  {renderStatusSection("Outgoing Raids", subscriptionStatuses, [
                    "channel.raid",
                  ], "from_broadcaster")}
                  {renderStatusSection("Channel Points", subscriptionStatuses, [
                    "channel.channel_points_custom_reward_redemption.add",
                  ])}
                  {renderStatusSection("Hype Train", subscriptionStatuses, [
                    "channel.hype_train.begin",
                    "channel.hype_train.progress",
                    "channel.hype_train.end",
                  ])}
                  {renderStatusSection("Polls", subscriptionStatuses, [
                    "channel.poll.begin",
                    "channel.poll.progress",
                    "channel.poll.end",
                  ])}
                  {renderStatusSection("Predictions", subscriptionStatuses, [
                    "channel.prediction.begin",
                    "channel.prediction.progress",
                    "channel.prediction.lock",
                    "channel.prediction.end",
                  ])}
                  {renderStatusSection("Bits", subscriptionStatuses, [
                    "channel.bits.use",
                  ])}
                </div>
              )}
            </span>
            <a
              href={`https://twitch.tv/${channelName}`}
              target="_blank"
              rel="noopener noreferrer"
              className="channel-link"
            >
              {channelDisplayName || channelName || "Chat"}
            </a>
            {!hideViewerCount &&
              viewerCount !== undefined &&
              viewerCount !== null && (
                <span className="viewer-count-display">
                  <FaUsers size={14} style={{ paddingTop: "4px" }} />{" "}
                  {viewerCount.toLocaleString()}
                </span>
              )}
            {streamUptime && isStreamLive && (
              <span className="uptime-display">({streamUptime})</span>
            )}
          </h2>
        </div>
        <div className="chat-header-actions">
          <div className="desktop-header-items">
            {Array.from(ignoredUserCounts.entries()).map(
              ([key, { count, displayName, authorAvatar, platform }]) => (
                <button type="button"
                  key={key}
                  className="header-button ignored-messages-badge"
                  title={`${count} hidden message(s) from ${displayName}`}
                  onClick={() =>
                    onOpenIgnoredUserOverlay?.(
                      displayName,
                      authorAvatar,
                      platform,
                    )
                  }
                >
                  <MdVisibilityOff size={12} className="ignored-badge-icon" />
                  <span className="ignored-badge-user">{displayName}</span>
                  <span className="ignored-badge-count">{count}</span>
                </button>
              ),
            )}
            {onRefreshEmotes && (
              <button type="button"
                onClick={onRefreshEmotes}
                disabled={isRefreshingEmotes}
                className="header-button"
                title={
                  isRefreshingEmotes
                    ? "Reloading emotes..."
                    : "Reload emotes in background"
                }
              >
                <MdRefresh
                  size={14}
                  style={{
                    animation: isRefreshingEmotes
                      ? "spin 1s linear infinite"
                      : "none",
                  }}
                />
                <span className="header-button-label">
                  {isRefreshingEmotes ? "Reloading..." : "Reload Emotes"}
                </span>
              </button>
            )}
            {showModToggle && (
              <div className="mod-mode-container" ref={modModeDropdownRef}>
                <button type="button"
                  onClick={() => setModModeDropdownOpen((v) => !v)}
                  className={`header-button mod-mode-trigger ${
                    modModeActive || youtubeModModeActive ? "mod-active" : ""
                  }`}
                  title="Mod Mode"
                >
                  {modModeActive && youtubeModModeActive ? (
                    <GiCrossedSwords
                      size={16}
                      className="mod-icon"
                      style={{ color: "var(--color-green)" }}
                    />
                  ) : modModeActive ? (
                    <FaTwitch
                      size={16}
                      className="mod-icon"
                      style={{ color: "var(--color-twitch, #9146ff)" }}
                    />
                  ) : youtubeModModeActive ? (
                    <FaYoutube
                      size={16}
                      className="mod-icon"
                      style={{ color: "var(--color-youtube, #ff2222)" }}
                    />
                  ) : (
                    <GiCrossedSwords
                      size={16}
                      className="mod-icon"
                      style={{ color: "var(--color-text-muted)" }}
                    />
                  )}
                  <span className="mod-label">Mod Mode</span>
                </button>
                {modModeDropdownOpen && (
                  <div className="mod-mode-dropdown">
                    {(isModerator || isYouTubeModerator) && (
                      <button type="button"
                        className={`mod-mode-item${!modModeActive && !youtubeModModeActive ? " active" : ""}`}
                        onClick={() => {
                          onSetModMode?.("off");
                          setModModeDropdownOpen(false);
                        }}
                        title="Disable Mod Mode"
                      >
                        <GiCrossedSwords size={14} />
                        <span>Off</span>
                        {!modModeActive && !youtubeModModeActive && (
                          <span className="mod-mode-check">✓</span>
                        )}
                      </button>
                    )}
                    {isModerator && (
                      <button type="button"
                        className={`mod-mode-item${modModeActive && !youtubeModModeActive ? " active twitch" : ""}`}
                        onClick={() => {
                          onSetModMode?.("twitch");
                          setModModeDropdownOpen(false);
                        }}
                        title="Twitch Mod Mode"
                      >
                        <FaTwitch size={14} />
                        <span>Twitch</span>
                        {modModeActive && !youtubeModModeActive && (
                          <span className="mod-mode-check">✓</span>
                        )}
                      </button>
                    )}
                    {isYouTubeModerator && (
                      <button type="button"
                        className={`mod-mode-item${youtubeModModeActive && !modModeActive ? " active youtube" : ""}`}
                        onClick={() => {
                          onSetModMode?.("youtube");
                          setModModeDropdownOpen(false);
                        }}
                        title="YouTube Mod Mode"
                      >
                        <FaYoutube size={14} />
                        <span>YouTube</span>
                        {youtubeModModeActive && !modModeActive && (
                          <span className="mod-mode-check">✓</span>
                        )}
                      </button>
                    )}
                    {isModerator && isYouTubeModerator && (
                      <button type="button"
                        className={`mod-mode-item${modModeActive && youtubeModModeActive ? " active both" : ""}`}
                        onClick={() => {
                          onSetModMode?.("both");
                          setModModeDropdownOpen(false);
                        }}
                        title="Both Platforms Mod Mode"
                      >
                        <GiCrossedSwords size={14} />
                        <span>Both</span>
                        {modModeActive && youtubeModModeActive && (
                          <span className="mod-mode-check">✓</span>
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            {showModTools && onOpenModTools && (
              <button type="button"
                onClick={onOpenModTools}
                className="header-button mod-tools-trigger"
                title="Streamer tools (giveaway, etc.)"
              >
                <MdBuild size={14} className="mod-icon" />
                <span className="header-button-label">Streamer tools</span>
              </button>
            )}
          </div>

          {(onRefreshEmotes || showModToggle || ignoredUserCounts.size > 0 || showModTools) && (
            <div className="mobile-header-menu" ref={mobileMenuRef}>
              <button type="button"
                className="header-button mobile-menu-trigger"
                onClick={() => setMobileMenuOpen((v) => !v)}
                title="Menu"
              >
                <MdMoreVert />
              </button>
              {mobileMenuOpen && (
                <div className="mobile-menu-dropdown">
                  {onRefreshEmotes && (
                    <button type="button"
                      className="mobile-menu-item"
                      onClick={() => {
                        onRefreshEmotes();
                        setMobileMenuOpen(false);
                      }}
                      disabled={isRefreshingEmotes}
                    >
                      <MdRefresh
                        size={14}
                        style={{
                          animation: isRefreshingEmotes
                            ? "spin 1s linear infinite"
                            : "none",
                        }}
                      />
                      <span>
                        {isRefreshingEmotes ? "Reloading..." : "Reload Emotes"}
                      </span>
                    </button>
                  )}
                  {Array.from(ignoredUserCounts.entries()).map(
                    ([key, { count, displayName, authorAvatar, platform }]) => (
                      <button type="button"
                        key={key}
                        className="mobile-menu-item"
                        onClick={() => {
                          onOpenIgnoredUserOverlay?.(
                            displayName,
                            authorAvatar,
                            platform,
                          );
                          setMobileMenuOpen(false);
                        }}
                      >
                        <MdVisibilityOff size={14} />
                        <span>
                          {displayName} ({count})
                        </span>
                      </button>
                    ),
                  )}
                  {showModToggle && (
                    <>
                      <div className="mobile-menu-separator" />
                      {isModerator && (
                        <button type="button"
                          className={`mobile-menu-item${modModeActive && !youtubeModModeActive ? " active" : ""}`}
                          onClick={() => {
                            onSetModMode?.("twitch");
                            setMobileMenuOpen(false);
                          }}
                        >
                          <FaTwitch size={14} />
                          <span>
                            Twitch Mod{" "}
                            {modModeActive && !youtubeModModeActive ? "✓" : ""}
                          </span>
                        </button>
                      )}
                      {isYouTubeModerator && (
                        <button type="button"
                          className={`mobile-menu-item${youtubeModModeActive && !modModeActive ? " active" : ""}`}
                          onClick={() => {
                            onSetModMode?.("youtube");
                            setMobileMenuOpen(false);
                          }}
                        >
                          <FaYoutube size={14} />
                          <span>
                            YouTube Mod{" "}
                            {youtubeModModeActive && !modModeActive ? "✓" : ""}
                          </span>
                        </button>
                      )}
                      {isModerator && isYouTubeModerator && (
                        <button type="button"
                          className={`mobile-menu-item${modModeActive && youtubeModModeActive ? " active" : ""}`}
                          onClick={() => {
                            onSetModMode?.("both");
                            setMobileMenuOpen(false);
                          }}
                        >
                          <GiCrossedSwords size={14} />
                          <span>
                            Both Platforms{" "}
                            {modModeActive && youtubeModModeActive ? "✓" : ""}
                          </span>
                        </button>
                      )}
                      {(modModeActive || youtubeModModeActive) && (
                        <button type="button"
                          className="mobile-menu-item"
                          onClick={() => {
                            onSetModMode?.("off");
                            setMobileMenuOpen(false);
                          }}
                        >
                          <GiCrossedSwords size={14} />
                          <span>Mod Mode Off</span>
                        </button>
                      )}
                    </>
                  )}
                  {showModTools && onOpenModTools && (
                    <>
                      <div className="mobile-menu-separator" />
                      <button type="button"
                        className="mobile-menu-item"
                        onClick={() => {
                          onOpenModTools();
                          setMobileMenuOpen(false);
                        }}
                      >
                        <MdBuild size={14} />
                        <span>Streamer tools</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {isLoading && <span className="loading-indicator">●</span>}
        </div>
      </div>

      {modModeActive && (streamTitle || streamGameName || true) && (
        <div className="stream-info-bar">
          {editingTitle ? (
            <div className="stream-info-edit-group">
              <input
                className="stream-info-input"
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveTitle();
                  else if (e.key === "Escape") setEditingTitle(false);
                }}
                placeholder="Stream title"
                aria-label="Stream title"
                autoFocus
                disabled={savingTitle}
              />
              <button type="button"
                className="stream-info-edit-btn stream-info-edit-btn--confirm"
                onClick={handleSaveTitle}
                disabled={savingTitle}
                title="Save title"
              >
                <MdCheck size={14} />
              </button>
              <button type="button"
                className="stream-info-edit-btn stream-info-edit-btn--cancel"
                onClick={() => setEditingTitle(false)}
                disabled={savingTitle}
                title="Cancel"
              >
                <MdClose size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="stream-info-title"
              onClick={() => {
                setTitleInput(streamTitle || "");
                setEditingTitle(true);
              }}
              title="Click to edit title"
            >
              {streamTitle || "No title set"}
              <MdEdit size={11} className="stream-info-edit-icon" />
            </button>
          )}

          {editingCategory ? (
            <div
              className="stream-info-edit-group stream-info-category-edit"
              ref={categoryDropdownRef}
            >
              <input
                ref={categoryInputRef}
                className="stream-info-input stream-info-input--category"
                type="text"
                value={categoryInput}
                onChange={(e) => {
                  setCategoryInput(e.target.value);
                  if (categorySearchRef.current)
                    clearTimeout(categorySearchRef.current);
                  if (e.target.value.trim()) {
                    setSearchingCategory(true);
                    categorySearchRef.current = setTimeout(() => {
                      onSearchCategories?.(e.target.value).then((results) => {
                        setCategoryResults(results);
                        setSearchingCategory(false);
                        const rect =
                          categoryInputRef.current?.getBoundingClientRect();
                        if (rect)
                          setCategoryDropdownPos({
                            x: rect.left,
                            y: rect.bottom + 4,
                          });
                      });
                    }, 300);
                  } else {
                    setCategoryResults([]);
                    setSearchingCategory(false);
                    setCategoryDropdownPos(null);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setEditingCategory(false);
                    setCategoryResults([]);
                    setCategoryDropdownPos(null);
                  }
                }}
                onFocus={() => {
                  const rect =
                    categoryInputRef.current?.getBoundingClientRect();
                  if (rect)
                    setCategoryDropdownPos({
                      x: rect.left,
                      y: rect.bottom + 4,
                    });
                }}
                placeholder="Search category..."
                aria-label="Search category"
                autoFocus
                disabled={savingCategory}
              />
              <button type="button"
                className="stream-info-edit-btn stream-info-edit-btn--cancel"
                onClick={() => {
                  setEditingCategory(false);
                  setCategoryResults([]);
                  setCategoryDropdownPos(null);
                }}
                disabled={savingCategory}
                title="Cancel"
              >
                <MdClose size={14} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="stream-info-category"
              onClick={() => {
                setCategoryInput(streamGameName || "");
                setEditingCategory(true);
                onSearchCategories?.(streamGameName || "").then((results) =>
                  setCategoryResults(results),
                );
              }}
              title="Click to change category"
           >
              {streamGameName || "No category"}
              <MdEdit size={11} className="stream-info-edit-icon" />
            </button>
          )}
        </div>
      )}

      <CategoryDropdown
        results={categoryResults}
        pos={categoryDropdownPos}
        saving={savingCategory}
        inputRef={categoryInputRef}
        onSelect={handleSaveCategory}
        onCancel={() => {
          setEditingCategory(false);
          setCategoryResults([]);
          setCategoryDropdownPos(null);
        }}
      />
    </>
  );
}
