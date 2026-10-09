import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type RefObject,
  type ReactNode,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
import {
  MdRefresh,
  MdEdit,
  MdCheck,
  MdClose,
  MdVisibilityOff,
  MdMoreVert,
  MdBuild,
  MdTv,
  MdBarChart,
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
import type { ModModeTarget } from "../../../contexts/ModerationContext";

function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  handler: () => void,
  enabled = true,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    const listener = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) handlerRef.current();
    };
    document.addEventListener("mousedown", listener);
    return () => document.removeEventListener("mousedown", listener);
  }, [enabled, ref]);
}

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
  redemptionPubSubStatus?: SubscriptionStatus | "disconnected";
  isOnOwnChannel?: boolean;
  onOpenChatStats?: () => void;
}

const FRIENDLY_NAMES: Record<string, string> = {
  "automod.message.hold": "Message Held",
  "automod.message.update": "Message Resolved",
  "channel.raid": "Incoming Raid",
  "channel.raid:to_broadcaster": "Incoming Raid",
  "channel.raid:from_broadcaster": "Outgoing Raid",
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

function ModModeIcon({
  modActive,
  ytActive,
}: {
  modActive: boolean;
  ytActive?: boolean;
}) {
  if (modActive && ytActive)
    return <GiCrossedSwords size={16} className="mod-icon" style={{ color: "var(--color-green)" }} />;
  if (modActive)
    return <FaTwitch size={16} className="mod-icon" style={{ color: "var(--color-twitch, #9146ff)" }} />;
  if (ytActive)
    return <FaYoutube size={16} className="mod-icon" style={{ color: "var(--color-youtube, #ff2222)" }} />;
  return <GiCrossedSwords size={16} className="mod-icon" style={{ color: "var(--color-text-muted)" }} />;
}

function getModModeOptionState(
  target: ModModeTarget,
  modModeActive: boolean,
  youtubeModModeActive?: boolean,
): { active: boolean; activeVariant: string; checked: boolean } {
  const yt = !!youtubeModModeActive;
  switch (target) {
    case "off":
      return {
        active: !modModeActive && !yt,
        activeVariant: "",
        checked: modModeActive === false && youtubeModModeActive === false,
      };
    case "twitch":
      return {
        active: modModeActive && !yt,
        activeVariant: " twitch",
        checked: modModeActive === true && youtubeModModeActive === false,
      };
    case "youtube":
      return {
        active: !modModeActive && yt,
        activeVariant: " youtube",
        checked: modModeActive === false && youtubeModModeActive === true,
      };
    case "both":
      return {
        active: modModeActive && yt,
        activeVariant: " both",
        checked: modModeActive === true && youtubeModModeActive === true,
      };
  }
}

function ModModeOption({
  target,
  modModeActive,
  youtubeModModeActive,
  onSelect,
  title,
  icon,
  label,
}: {
  target: ModModeTarget;
  modModeActive: boolean;
  youtubeModModeActive?: boolean;
  onSelect: (mode: ModModeTarget) => void;
  title: string;
  icon: ReactNode;
  label: string;
}) {
  const { active, activeVariant, checked } = getModModeOptionState(
    target,
    modModeActive,
    youtubeModModeActive,
  );
  return (
    <button type="button"
      className={`mod-mode-item${active ? ` active${activeVariant}` : ""}`}
      onClick={() => onSelect(target)}
      title={title}
    >
      {icon}
      <span>{label}</span>
      {checked ? <span className="mod-mode-check">✓</span> : null}
    </button>
  );
}

function ModModeDropdownMenu({
  isModerator,
  isYouTubeModerator,
  modModeActive,
  youtubeModModeActive,
  onSelectMode,
  onClose,
}: {
  isModerator: boolean;
  isYouTubeModerator?: boolean;
  modModeActive: boolean;
  youtubeModModeActive?: boolean;
  onSelectMode?: (mode: ModModeTarget) => void;
  onClose: () => void;
}) {
  const select = (mode: ModModeTarget) => {
    onSelectMode?.(mode);
    onClose();
  };
  return (
    <div className="mod-mode-dropdown">
      {(isModerator || isYouTubeModerator) && (
        <ModModeOption
          target="off"
          modModeActive={modModeActive}
          youtubeModModeActive={youtubeModModeActive}
          onSelect={select}
          title="Disable Mod Mode"
          icon={<GiCrossedSwords size={14} />}
          label="Off"
        />
      )}
      {isModerator && (
        <ModModeOption
          target="twitch"
          modModeActive={modModeActive}
          youtubeModModeActive={youtubeModModeActive}
          onSelect={select}
          title="Twitch Mod Mode"
          icon={<FaTwitch size={14} />}
          label="Twitch"
        />
      )}
      {isYouTubeModerator && (
        <ModModeOption
          target="youtube"
          modModeActive={modModeActive}
          youtubeModModeActive={youtubeModModeActive}
          onSelect={select}
          title="YouTube Mod Mode"
          icon={<FaYoutube size={14} />}
          label="YouTube"
        />
      )}
      {isModerator && isYouTubeModerator && (
        <ModModeOption
          target="both"
          modModeActive={modModeActive}
          youtubeModModeActive={youtubeModModeActive}
          onSelect={select}
          title="Both Platforms Mod Mode"
          icon={<GiCrossedSwords size={14} />}
          label="Both"
        />
      )}
    </div>
  );
}

function ModModeDropdown({
  isModerator,
  isYouTubeModerator,
  modModeActive,
  youtubeModModeActive,
  onSetMode,
  containerRef,
  isOpen,
  onToggle,
}: {
  isModerator: boolean;
  isYouTubeModerator?: boolean;
  modModeActive: boolean;
  youtubeModModeActive?: boolean;
  onSetMode?: (mode: ModModeTarget) => void;
  containerRef: RefObject<HTMLDivElement | null>;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="mod-mode-container" ref={containerRef}>
      <button type="button"
        onClick={onToggle}
        className={`header-button mod-mode-trigger ${
          modModeActive || youtubeModModeActive ? "mod-active" : ""
        }`}
        title="Mod Mode"
      >
        <ModModeIcon modActive={modModeActive} ytActive={youtubeModModeActive} />
        <span className="mod-label">Mod Mode</span>
      </button>
      {isOpen && (
        <ModModeDropdownMenu
          isModerator={isModerator}
          isYouTubeModerator={isYouTubeModerator}
          modModeActive={modModeActive}
          youtubeModModeActive={youtubeModModeActive}
          onSelectMode={onSetMode}
          onClose={onToggle}
        />
      )}
    </div>
  );
}

function StreamTitleSection({
  canEdit,
  editingTitle,
  titleInput,
  savingTitle,
  streamTitle,
  onTitleChange,
  onTitleKeyDown,
  onSaveTitle,
  onCancelTitleEdit,
  onStartTitleEdit,
}: {
  canEdit?: boolean;
  editingTitle: boolean;
  titleInput: string;
  savingTitle: boolean;
  streamTitle?: string;
  onTitleChange: (value: string) => void;
  onTitleKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onSaveTitle: () => void;
  onCancelTitleEdit: () => void;
  onStartTitleEdit: () => void;
}) {
  if (canEdit && editingTitle) {
    return (
      <div className="stream-info-edit-group">
        <input
          className="stream-info-input"
          type="text"
          value={titleInput}
          onChange={(e) => onTitleChange(e.target.value)}
          onKeyDown={onTitleKeyDown}
          placeholder="Stream title"
          aria-label="Stream title"
          autoFocus
          disabled={savingTitle}
        />
        <button type="button"
          className="stream-info-edit-btn stream-info-edit-btn--confirm"
          onClick={onSaveTitle}
          disabled={savingTitle}
          title="Save title"
        >
          <MdCheck size={14} />
        </button>
        <button type="button"
          className="stream-info-edit-btn stream-info-edit-btn--cancel"
          onClick={onCancelTitleEdit}
          disabled={savingTitle}
          title="Cancel"
        >
          <MdClose size={14} />
        </button>
      </div>
    );
  }
  if (canEdit) {
    return (
      <button
        type="button"
        className="stream-info-title"
        onClick={onStartTitleEdit}
        title="Click to edit title"
      >
        {streamTitle || "No title set"}
        <MdEdit size={11} className="stream-info-edit-icon" />
      </button>
    );
  }
  return (
    <span className="stream-info-title stream-info-title--readonly">
      {streamTitle || "No title set"}
    </span>
  );
}

function StreamCategorySection({
  canEdit,
  editingCategory,
  categoryInput,
  savingCategory,
  streamGameName,
  categoryDropdownRef,
  categoryInputRef,
  onCategoryChange,
  onCategoryKeyDown,
  onCategoryFocus,
  onCancelCategoryEdit,
  onStartCategoryEdit,
}: {
  canEdit?: boolean;
  editingCategory: boolean;
  categoryInput: string;
  savingCategory: boolean;
  streamGameName?: string;
  categoryDropdownRef: RefObject<HTMLDivElement | null>;
  categoryInputRef: RefObject<HTMLInputElement | null>;
  onCategoryChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onCategoryKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onCategoryFocus: () => void;
  onCancelCategoryEdit: () => void;
  onStartCategoryEdit: () => void;
}) {
  if (canEdit && editingCategory) {
    return (
      <div
        className="stream-info-edit-group stream-info-category-edit"
        ref={categoryDropdownRef}
      >
        <input
          ref={categoryInputRef}
          className="stream-info-input stream-info-input--category"
          type="text"
          value={categoryInput}
          onChange={onCategoryChange}
          onKeyDown={onCategoryKeyDown}
          onFocus={onCategoryFocus}
          placeholder="Search category..."
          aria-label="Search category"
          autoFocus
          disabled={savingCategory}
        />
        <button type="button"
          className="stream-info-edit-btn stream-info-edit-btn--cancel"
          onClick={onCancelCategoryEdit}
          disabled={savingCategory}
          title="Cancel"
        >
          <MdClose size={14} />
        </button>
      </div>
    );
  }
  if (canEdit) {
    return (
      <button
        type="button"
        className="stream-info-category"
        onClick={onStartCategoryEdit}
        title="Click to change category"
      >
        {streamGameName || "No category"}
        <MdEdit size={11} className="stream-info-edit-icon" />
      </button>
    );
  }
  return (
    <span className="stream-info-category stream-info-category--readonly">
      {streamGameName || "No category"}
    </span>
  );
}

function StreamInfoActions({
  youtubeVideoId,
  showTwitchModButton,
  channelName,
  onOpenChatStats,
}: {
  youtubeVideoId?: string | null;
  showTwitchModButton?: boolean;
  channelName?: string;
  onOpenChatStats?: () => void;
}) {
  return (
    <div className="stream-info-actions">
      {youtubeVideoId && (
        <button
          type="button"
          className="stream-info-action-btn"
          title="Open YouTube chat popout"
          onClick={() => {
            window.open(
              `https://www.youtube.com/live_chat?is_popout=1&v=${encodeURIComponent(youtubeVideoId)}`,
              "yt-chat-popout",
              "width=400,height=600,noopener,noreferrer",
            );
          }}
        >
          <FaYoutube size={14} />
        </button>
      )}
      {showTwitchModButton && channelName && (
        <>
          <button
            type="button"
            className="stream-info-action-btn"
            title="Open Twitch stream popout"
            onClick={() => {
              window.open(
                `https://www.twitch.tv/popout/moderator/${encodeURIComponent(channelName)}/player?id=1`,
                "twitch-stream-popout",
                "width=1280,height=720,noopener,noreferrer",
              );
            }}
          >
            <MdTv size={14} />
          </button>
          <a
            href={`https://www.twitch.tv/moderator/${encodeURIComponent(channelName)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="stream-info-action-btn"
            title="Open Twitch moderator page"
          >
            <FaTwitch size={14} />
          </a>
        </>
      )}
      {onOpenChatStats && (
        <button
          type="button"
          className="stream-info-action-btn"
          title="Chat stats"
          data-chat-stats-trigger
          onClick={onOpenChatStats}
        >
          <MdBarChart size={14} />
        </button>
      )}
    </div>
  );
}

function StreamInfoBar({
  streamTitle,
  streamGameName,
  canEdit,
  youtubeVideoId,
  channelName,
  showTwitchModButton,
  onOpenChatStats,
  onUpdateTitle,
  onUpdateCategory,
  onSearchCategories,
}: {
  streamTitle?: string;
  streamGameName?: string;
  canEdit?: boolean;
  youtubeVideoId?: string | null;
  channelName?: string;
  showTwitchModButton?: boolean;
  onOpenChatStats?: () => void;
  onUpdateTitle?: (title: string) => Promise<void>;
  onUpdateCategory?: (gameId: string, gameName: string) => Promise<void>;
  onSearchCategories?: (query: string) => Promise<CategoryResult[]>;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [editingCategory, setEditingCategory] = useState(false);
  const [categoryInput, setCategoryInput] = useState("");
  const [categoryResults, setCategoryResults] = useState<CategoryResult[]>([]);
  const [savingCategory, setSavingCategory] = useState(false);
  const [categoryDropdownPos, setCategoryDropdownPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const categorySearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const categoryInputRef = useRef<HTMLInputElement>(null);

  const resetCategoryEdit = useCallback(() => {
    setEditingCategory(false);
    setCategoryResults([]);
    setCategoryDropdownPos(null);
  }, []);

  const closeCategoryDropdown = useCallback(() => {
    const portalDropdown = document.getElementById("category-dropdown-portal");
    const target = document.activeElement;
    if (categoryInputRef.current === target || portalDropdown?.contains(target)) return;
    setEditingCategory(false);
    setCategoryResults([]);
    setCategoryDropdownPos(null);
  }, []);

  useClickOutside(categoryDropdownRef, closeCategoryDropdown, editingCategory);

  const handleSaveTitle = useCallback(() => {
    setSavingTitle(true);
    onUpdateTitle?.(titleInput).finally(() => {
      setSavingTitle(false);
      setEditingTitle(false);
    });
  }, [onUpdateTitle, titleInput]);

  const handleTitleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSaveTitle();
    else if (e.key === "Escape") setEditingTitle(false);
  };

  const startTitleEdit = () => {
    setTitleInput(streamTitle || "");
    setEditingTitle(true);
  };

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

  const handleCategoryInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setCategoryInput(value);
    if (categorySearchRef.current) clearTimeout(categorySearchRef.current);
    if (value.trim()) {
      categorySearchRef.current = setTimeout(() => {
        onSearchCategories?.(value).then((results) => {
          setCategoryResults(results);
          const rect = categoryInputRef.current?.getBoundingClientRect();
          if (rect) setCategoryDropdownPos({ x: rect.left, y: rect.bottom + 4 });
        });
      }, 300);
    } else {
      setCategoryResults([]);
      setCategoryDropdownPos(null);
    }
  };

  const handleCategoryKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setEditingCategory(false);
      setCategoryResults([]);
      setCategoryDropdownPos(null);
    }
  };

  const handleCategoryFocus = () => {
    const rect = categoryInputRef.current?.getBoundingClientRect();
    if (rect) setCategoryDropdownPos({ x: rect.left, y: rect.bottom + 4 });
  };

  const startCategoryEdit = () => {
    setCategoryInput(streamGameName || "");
    setEditingCategory(true);
    onSearchCategories?.(streamGameName || "")
      .then((results) => setCategoryResults(results))
      .catch(() => {});
  };

  return (
    <>
      <div className="stream-info-bar">
        <StreamTitleSection
          canEdit={canEdit}
          editingTitle={editingTitle}
          titleInput={titleInput}
          savingTitle={savingTitle}
          streamTitle={streamTitle}
          onTitleChange={setTitleInput}
          onTitleKeyDown={handleTitleKeyDown}
          onSaveTitle={handleSaveTitle}
          onCancelTitleEdit={() => setEditingTitle(false)}
          onStartTitleEdit={startTitleEdit}
        />

        <StreamCategorySection
          canEdit={canEdit}
          editingCategory={editingCategory}
          categoryInput={categoryInput}
          savingCategory={savingCategory}
          streamGameName={streamGameName}
          categoryDropdownRef={categoryDropdownRef}
          categoryInputRef={categoryInputRef}
          onCategoryChange={handleCategoryInputChange}
          onCategoryKeyDown={handleCategoryKeyDown}
          onCategoryFocus={handleCategoryFocus}
          onCancelCategoryEdit={resetCategoryEdit}
          onStartCategoryEdit={startCategoryEdit}
        />

        <StreamInfoActions
          youtubeVideoId={youtubeVideoId}
          showTwitchModButton={showTwitchModButton}
          channelName={channelName}
          onOpenChatStats={onOpenChatStats}
        />
      </div>

      {canEdit && (
        <CategoryDropdown
          results={categoryResults}
          pos={categoryDropdownPos}
          saving={savingCategory}
          inputRef={categoryInputRef}
          onSelect={handleSaveCategory}
          onCancel={resetCategoryEdit}
        />
      )}
    </>
  );
}

function renderSimpleStatusSection(
  label: string,
  status: SubscriptionStatus | "disconnected",
) {
  return (
    <div className="eventsub-status-section">
      <div className={`eventsub-status-row eventsub-status--${status}`}>
        <span className="eventsub-status-dot" />
        <span className="eventsub-status-label">{label}</span>
        <span className="eventsub-status-value">{statusLabel(status)}</span>
      </div>
    </div>
  );
}

function renderStatusSection(
  label: string,
  statuses: Map<string, SubscriptionStatus>,
  keys: string[] | null,
  conditionFilter?: string,
) {
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
          const friendlyLabel = FRIENDLY_NAMES[nameKey] || FRIENDLY_NAMES[typePrefix] || typePrefix.split(".").pop() || typePrefix;
          return (
            <div
              key={typePrefix}
              className={`eventsub-status-item eventsub-status--${status ?? "disconnected"}`}
            >
              <span className="eventsub-status-dot" />
              <span className="eventsub-status-item-label">{friendlyLabel}</span>
              <span className="eventsub-status-value">
                {status ? statusLabel(status) : "disabled"}
              </span>
            </div>
          );
        })}
    </div>
  );
}

function getMobileModActive(
  target: ModModeTarget,
  modModeActive: boolean,
  youtubeModModeActive?: boolean,
): boolean {
  const yt = !!youtubeModModeActive;
  switch (target) {
    case "twitch":
      return modModeActive && !yt;
    case "youtube":
      return !modModeActive && yt;
    case "both":
      return modModeActive && yt;
    case "off":
      return false;
  }
}

function MobileModModeButton({
  target,
  modModeActive,
  youtubeModModeActive,
  onSelect,
  label,
  icon,
}: {
  target: ModModeTarget;
  modModeActive: boolean;
  youtubeModModeActive?: boolean;
  onSelect: (mode: ModModeTarget) => void;
  label: string;
  icon: ReactNode;
}) {
  const active = getMobileModActive(target, modModeActive, youtubeModModeActive);
  return (
    <button type="button"
      className={`mobile-menu-item${active ? " active" : ""}`}
      onClick={() => onSelect(target)}
    >
      {icon}
      <span>
        {label} {active ? "✓" : ""}
      </span>
    </button>
  );
}

function MobileModModeSection({
  isModerator,
  isYouTubeModerator,
  modModeActive,
  youtubeModModeActive,
  onSetModMode,
  onClose,
}: {
  isModerator: boolean;
  isYouTubeModerator?: boolean;
  modModeActive: boolean;
  youtubeModModeActive?: boolean;
  onSetModMode?: (mode: ModModeTarget) => void;
  onClose: () => void;
}) {
  const select = (mode: ModModeTarget) => {
    onSetModMode?.(mode);
    onClose();
  };
  return (
    <>
      <div className="mobile-menu-separator" />
      {isModerator && (
        <MobileModModeButton
          target="twitch"
          modModeActive={modModeActive}
          youtubeModModeActive={youtubeModModeActive}
          onSelect={select}
          label="Twitch Mod"
          icon={<FaTwitch size={14} />}
        />
      )}
      {isYouTubeModerator && (
        <MobileModModeButton
          target="youtube"
          modModeActive={modModeActive}
          youtubeModModeActive={youtubeModModeActive}
          onSelect={select}
          label="YouTube Mod"
          icon={<FaYoutube size={14} />}
        />
      )}
      {isModerator && isYouTubeModerator && (
        <MobileModModeButton
          target="both"
          modModeActive={modModeActive}
          youtubeModModeActive={youtubeModModeActive}
          onSelect={select}
          label="Both Platforms"
          icon={<GiCrossedSwords size={14} />}
        />
      )}
      {(modModeActive || youtubeModModeActive) && (
        <button type="button"
          className="mobile-menu-item"
          onClick={() => select("off")}
        >
          <GiCrossedSwords size={14} />
          <span>Mod Mode Off</span>
        </button>
      )}
    </>
  );
}

function StreamStatusBadge({
  isStreamLive,
  isOpen,
  onToggle,
  containerRef,
  subscriptionStatuses,
  redemptionPubSubStatus,
}: {
  isStreamLive?: boolean;
  isOpen: boolean;
  onToggle: () => void;
  containerRef: RefObject<HTMLDivElement | null>;
  subscriptionStatuses?: Map<string, SubscriptionStatus>;
  redemptionPubSubStatus?: SubscriptionStatus | "disconnected";
}) {
  return (
    <span className="status-badge-container" ref={containerRef}>
      <button
        type="button"
        className="status-badge-button"
        onClick={onToggle}
        title="Event connection status"
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
      {isOpen && subscriptionStatuses && (
        <div className="eventsub-status-dropdown">
          <div className="eventsub-status-header">Event Connections</div>
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
          {redemptionPubSubStatus !== undefined &&
            renderSimpleStatusSection(
              "Channel Points (PubSub)",
              redemptionPubSubStatus,
            )}
        </div>
      )}
    </span>
  );
}

function ChannelTitleSummary({
  channelName,
  channelDisplayName,
  hideViewerCount,
  viewerCount,
  streamUptime,
  isStreamLive,
}: {
  channelName?: string;
  channelDisplayName?: string;
  hideViewerCount?: boolean;
  viewerCount?: number | null;
  streamUptime?: string;
  isStreamLive?: boolean;
}) {
  return (
    <>
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
    </>
  );
}

function DesktopHeaderActions({
  ignoredUserCounts,
  onOpenIgnoredUserOverlay,
  onRefreshEmotes,
  isRefreshingEmotes,
  showModToggle,
  isModerator,
  isYouTubeModerator,
  modModeActive,
  youtubeModModeActive,
  onSetModMode,
  modModeDropdownRef,
  modModeDropdownOpen,
  onToggleModModeDropdown,
  showModTools,
  onOpenModTools,
}: {
  ignoredUserCounts: Map<
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
  onRefreshEmotes?: () => void;
  isRefreshingEmotes?: boolean;
  showModToggle: boolean;
  isModerator: boolean;
  isYouTubeModerator?: boolean;
  modModeActive: boolean;
  youtubeModModeActive?: boolean;
  onSetModMode?: (mode: ModModeTarget) => void;
  modModeDropdownRef: RefObject<HTMLDivElement | null>;
  modModeDropdownOpen: boolean;
  onToggleModModeDropdown: () => void;
  showModTools: boolean;
  onOpenModTools?: () => void;
}) {
  return (
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
        <ModModeDropdown
          isModerator={isModerator}
          isYouTubeModerator={isYouTubeModerator}
          modModeActive={modModeActive}
          youtubeModModeActive={youtubeModModeActive}
          onSetMode={onSetModMode}
          containerRef={modModeDropdownRef}
          isOpen={modModeDropdownOpen}
          onToggle={onToggleModModeDropdown}
        />
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
  );
}

function MobileHeaderMenu({
  isOpen,
  onToggle,
  containerRef,
  ignoredUserCounts,
  onOpenIgnoredUserOverlay,
  onRefreshEmotes,
  isRefreshingEmotes,
  showModToggle,
  isModerator,
  isYouTubeModerator,
  modModeActive,
  youtubeModModeActive,
  onSetModMode,
  showModTools,
  onOpenModTools,
  onClose,
}: {
  isOpen: boolean;
  onToggle: () => void;
  containerRef: RefObject<HTMLDivElement | null>;
  ignoredUserCounts: Map<
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
  onRefreshEmotes?: () => void;
  isRefreshingEmotes?: boolean;
  showModToggle: boolean;
  isModerator: boolean;
  isYouTubeModerator?: boolean;
  modModeActive: boolean;
  youtubeModModeActive?: boolean;
  onSetModMode?: (mode: ModModeTarget) => void;
  showModTools: boolean;
  onOpenModTools?: () => void;
  onClose: () => void;
}) {
  if (
    !(
      onRefreshEmotes ||
      showModToggle ||
      ignoredUserCounts.size > 0 ||
      showModTools
    )
  ) {
    return null;
  }
  return (
    <div className="mobile-header-menu" ref={containerRef}>
      <button type="button"
        className="header-button mobile-menu-trigger"
        onClick={onToggle}
        title="Menu"
      >
        <MdMoreVert />
      </button>
      {isOpen && (
        <div className="mobile-menu-dropdown">
          {onRefreshEmotes && (
            <button type="button"
              className="mobile-menu-item"
              onClick={() => {
                onRefreshEmotes();
                onClose();
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
                  onClose();
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
            <MobileModModeSection
              isModerator={isModerator}
              isYouTubeModerator={isYouTubeModerator}
              modModeActive={modModeActive}
              youtubeModModeActive={youtubeModModeActive}
              onSetModMode={onSetModMode}
              onClose={onClose}
            />
          )}
          {showModTools && onOpenModTools && (
            <>
              <div className="mobile-menu-separator" />
              <button type="button"
                className="mobile-menu-item"
                onClick={() => {
                  onOpenModTools();
                  onClose();
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
  );
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
  redemptionPubSubStatus,
  isOnOwnChannel = false,
  onOpenChatStats,
}: ChatHeaderProps) {
  const {
    isModerator,
    modModeActive,
    isYouTubeModerator,
    youtubeModModeActive,
    youtubeVideoId,
    onSetModMode,
  } = useModerationContext();
  const showModToggle = Boolean(isModerator || isYouTubeModerator);
  const modModeDropdownRef = useRef<HTMLDivElement>(null);
  const [modModeDropdownOpen, setModModeDropdownOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);

  useClickOutside(modModeDropdownRef, () => setModModeDropdownOpen(false), modModeDropdownOpen);
  useClickOutside(mobileMenuRef, () => setMobileMenuOpen(false), mobileMenuOpen);
  useClickOutside(statusDropdownRef, () => setStatusDropdownOpen(false), statusDropdownOpen);

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
            <StreamStatusBadge
              isStreamLive={isStreamLive}
              isOpen={statusDropdownOpen}
              onToggle={() => setStatusDropdownOpen((v) => !v)}
              containerRef={statusDropdownRef}
              subscriptionStatuses={subscriptionStatuses}
              redemptionPubSubStatus={redemptionPubSubStatus}
            />
            <ChannelTitleSummary
              channelName={channelName}
              channelDisplayName={channelDisplayName}
              hideViewerCount={hideViewerCount}
              viewerCount={viewerCount}
              streamUptime={streamUptime}
              isStreamLive={isStreamLive}
            />
          </h2>
        </div>
        <div className="chat-header-actions">
          <DesktopHeaderActions
            ignoredUserCounts={ignoredUserCounts}
            onOpenIgnoredUserOverlay={onOpenIgnoredUserOverlay}
            onRefreshEmotes={onRefreshEmotes}
            isRefreshingEmotes={isRefreshingEmotes}
            showModToggle={showModToggle}
            isModerator={isModerator}
            isYouTubeModerator={isYouTubeModerator}
            modModeActive={modModeActive}
            youtubeModModeActive={youtubeModModeActive}
            onSetModMode={onSetModMode}
            modModeDropdownRef={modModeDropdownRef}
            modModeDropdownOpen={modModeDropdownOpen}
            onToggleModModeDropdown={() => setModModeDropdownOpen((v) => !v)}
            showModTools={showModTools}
            onOpenModTools={onOpenModTools}
          />

          <MobileHeaderMenu
            isOpen={mobileMenuOpen}
            onToggle={() => setMobileMenuOpen((v) => !v)}
            containerRef={mobileMenuRef}
            ignoredUserCounts={ignoredUserCounts}
            onOpenIgnoredUserOverlay={onOpenIgnoredUserOverlay}
            onRefreshEmotes={onRefreshEmotes}
            isRefreshingEmotes={isRefreshingEmotes}
            showModToggle={showModToggle}
            isModerator={isModerator}
            isYouTubeModerator={isYouTubeModerator}
            modModeActive={modModeActive}
            youtubeModModeActive={youtubeModModeActive}
            onSetModMode={onSetModMode}
            showModTools={showModTools}
            onOpenModTools={onOpenModTools}
            onClose={() => setMobileMenuOpen(false)}
          />

          {isLoading && <span className="loading-indicator">●</span>}
        </div>
      </div>

      <StreamInfoBar
        streamTitle={streamTitle}
        streamGameName={streamGameName}
        canEdit={isOnOwnChannel}
        youtubeVideoId={youtubeVideoId}
        channelName={channelName}
        showTwitchModButton={isModerator || isOnOwnChannel}
        onOpenChatStats={onOpenChatStats}
        onUpdateTitle={onUpdateTitle}
        onUpdateCategory={onUpdateCategory}
        onSearchCategories={onSearchCategories}
      />
    </>
  );
}
