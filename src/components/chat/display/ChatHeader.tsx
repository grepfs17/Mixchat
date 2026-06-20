import { useState, useRef, useEffect, useCallback } from "react";
import {
  MdRefresh,
  MdEdit,
  MdCheck,
  MdClose,
  MdVisibilityOff,
} from "react-icons/md";
import { FaUsers, FaChevronLeft, FaChevronRight } from "react-icons/fa";
import { GiCrossedSwords } from "react-icons/gi";
import { useModerationContext } from "../../../contexts/ModerationContext";
import CategoryDropdown from "./CategoryDropdown";
import type { CategoryResult } from "./types";
import type { Platform } from "../../../lib/types";

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
}: ChatHeaderProps) {
  const {
    isModerator,
    modModeActive,
    isYouTubeModerator,
    youtubeModModeActive,
    onToggleModMode,
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

  return (
    <>
      <div className="chat-header">
        <div className="chat-header-content">
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className={`sidebar-toggle-button${showStreamEmbed ? " sidebar-toggle-button--embed-active" : ""}`}
              title={sidebarVisible ? "Fold sidebar" : "Unfold sidebar"}
            >
              {sidebarVisible ? <FaChevronLeft /> : <FaChevronRight />}
            </button>
          )}
          {!showStreamEmbed && onToggleStreamEmbed && (
            <button
              onClick={onToggleStreamEmbed}
              className="show-stream-button"
              title="Show stream embed"
            >
              Show Stream
            </button>
          )}
          <h2>
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
                  <FaUsers size={14} /> {viewerCount.toLocaleString()}
                </span>
              )}
            {streamUptime && isStreamLive && (
              <span className="uptime-display">({streamUptime})</span>
            )}
          </h2>
        </div>
        <div className="chat-header-actions">
          {Array.from(ignoredUserCounts.entries()).map(
            ([key, { count, displayName, authorAvatar, platform }]) => (
              <button
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
            <button
              onClick={onRefreshEmotes}
              disabled={isRefreshingEmotes}
              className="header-button"
              title={
                isRefreshingEmotes
                  ? "Reloading emotes..."
                  : "Reload all emotes (clears cache)"
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
            <button
              onClick={onToggleModMode}
              className={`header-button ${modModeActive || youtubeModModeActive ? "mod-active" : ""}`}
              title={
                modModeActive || youtubeModModeActive
                  ? "Disable Mod Mode"
                  : "Enable Mod Mode"
              }
            >
              <GiCrossedSwords
                size={16}
                className="mod-icon"
                style={{
                  color:
                    modModeActive || youtubeModModeActive
                      ? "var(--color-green)"
                      : "var(--color-text-muted)",
                }}
              />
              <span className="mod-label">Mod Mode</span>
            </button>
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
                autoFocus
                disabled={savingTitle}
              />
              <button
                className="stream-info-edit-btn stream-info-edit-btn--confirm"
                onClick={handleSaveTitle}
                disabled={savingTitle}
                title="Save title"
              >
                <MdCheck size={14} />
              </button>
              <button
                className="stream-info-edit-btn stream-info-edit-btn--cancel"
                onClick={() => setEditingTitle(false)}
                disabled={savingTitle}
                title="Cancel"
              >
                <MdClose size={14} />
              </button>
            </div>
          ) : (
            <span
              className="stream-info-title"
              onClick={() => {
                setTitleInput(streamTitle || "");
                setEditingTitle(true);
              }}
              title="Click to edit title"
            >
              {streamTitle || "No title set"}
              <MdEdit size={11} className="stream-info-edit-icon" />
            </span>
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
                autoFocus
                disabled={savingCategory}
              />
              <button
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
            <span
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
            </span>
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
