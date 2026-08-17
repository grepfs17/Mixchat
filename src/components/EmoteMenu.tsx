import { useState, useRef, useEffect, useMemo, memo } from "react";
import { FaSearch } from "react-icons/fa";
import type { EmotesBySource } from "../lib/emotes";
import {
  toggleDisableEmote,
  getDisabledEmotes,
  getDisabledEmoteChannels,
  toggleDisableEmoteChannel,
  getEmoteAliases,
  addEmoteAlias,
  removeEmoteAlias,
} from "../lib/emotes";

interface EmoteMenuProps {
  emotes: EmotesBySource;
  onSelectEmote: (emoteName: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

const TWITCH_GLOBAL_KEY = "__global";

const THIRD_PARTY_SOURCES = [
  { key: "7tv" as const, label: "7TV", color: "#00d4ff" },
  { key: "bttv" as const, label: "BTTV", color: "#34ae7b" },
  { key: "ffz" as const, label: "FFZ", color: "#faa61a" },
] as const;

const TWITCH_COLOR = "#9146ff";

function EmoteMenu({ emotes, onSelectEmote, isOpen, onClose }: EmoteMenuProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"twitch" | "7tv" | "bttv" | "ffz">(
    "twitch",
  );
  // selected channel within the Twitch tab (TWITCH_GLOBAL_KEY or channelId)
  const [activeTwitchChannel, setActiveTwitchChannel] =
    useState<string>(TWITCH_GLOBAL_KEY);
  const [disabledSet, setDisabledSet] = useState<Set<string>>(new Set());
  const [disabledChannels, setDisabledChannels] = useState<Set<string>>(
    new Set(),
  );
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [aliasTarget, setAliasTarget] = useState<string | null>(null);
  const [aliasInput, setAliasInput] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const prevIsOpenRef = useRef(false);
  const onCloseRef = useRef(onClose);
  // Sync the latest onClose into the ref so event-listener callbacks
  // captured at mount don't see a stale closure. Updating in an effect
  // (rather than during render) keeps component body pure per React semantics.
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Derive filtered emotes during render instead of storing in state
  const filteredEmotes = useMemo(() => {
    if (!searchQuery.trim()) return emotes;
    const lowerQuery = searchQuery.toLowerCase();
    return {
      twitchGlobal: emotes.twitchGlobal.filter((e) =>
        e.name.toLowerCase().includes(lowerQuery),
      ),
      twitchChannels: emotes.twitchChannels.map((ch) => ({
        ...ch,
        emotes: ch.emotes.filter((e) =>
          e.name.toLowerCase().includes(lowerQuery),
        ),
      })),
      "7tv": emotes["7tv"].filter((e) =>
        e.name.toLowerCase().includes(lowerQuery),
      ),
      bttv: emotes.bttv.filter((e) =>
        e.name.toLowerCase().includes(lowerQuery),
      ),
      ffz: emotes.ffz.filter((e) => e.name.toLowerCase().includes(lowerQuery)),
    };
  }, [searchQuery, emotes]);

  // Reset navigation state only when the menu transitions from closed to open.
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setSearchQuery("");
      setActiveTab("twitch");
      setActiveTwitchChannel(TWITCH_GLOBAL_KEY);
      setDisabledSet(getDisabledEmotes());
      setDisabledChannels(getDisabledEmoteChannels());
      setAliases(getEmoteAliases());
      if (searchInputRef.current) searchInputRef.current.focus();
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    const handler = () => {
      setDisabledSet(getDisabledEmotes());
      setDisabledChannels(getDisabledEmoteChannels());
      setAliases(getEmoteAliases());
    };
    window.addEventListener("emotes-reloaded", handler);
    return () => window.removeEventListener("emotes-reloaded", handler);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node))
        onCloseRef.current();
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) onCloseRef.current();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const isSearching = searchQuery.trim().length > 0;

  const submitAlias = () => {
    if (!aliasTarget) return;
    const alias = aliasInput.trim();
    if (!alias) return;
    addEmoteAlias(aliasTarget, alias);
    setAliases(getEmoteAliases());
    setAliasInput("");
  };

  const handleRemoveAlias = () => {
    if (!aliasTarget) return;
    removeEmoteAlias(aliasTarget);
    setAliases(getEmoteAliases());
  };

  const renderEmoteItem = (
    emote: { name: string; url: string },
    channelDisabled = false,
  ) => {
    const isDisabled = channelDisabled || disabledSet.has(emote.name);
    return (
      <div
        key={emote.name}
        className={`emote-item ${isDisabled ? "emote-disabled" : ""}`}
      >
        {!channelDisabled && (
          <div className="emote-item-actions emote-item-actions--top">
            <button type="button"
              className="emote-disable-btn"
              onClick={(e) => {
                e.stopPropagation();
                toggleDisableEmote(emote.name);
                setDisabledSet(getDisabledEmotes());
              }}
              title={isDisabled ? "Enable emote" : "Disable emote"}
            >
              {isDisabled ? "Enable" : "Disable"}
            </button>
          </div>
        )}
        <button
          type="button"
          className="emote-select-btn"
          onClick={() => {
            if (!isDisabled) {
              onSelectEmote(emote.name);
              setSearchQuery("");
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (!isDisabled) onSelectEmote(emote.name);
            }
          }}
          tabIndex={isDisabled ? -1 : 0}
          title={emote.name}
        >
          <img src={emote.url} alt={emote.name} className="emote-image" />
          <span className="emote-name">{emote.name}</span>
        </button>
        {aliases[emote.name] && aliasTarget !== emote.name && (
          <div
            className="emote-alias-display"
            title={`Alias: ${aliases[emote.name]}`}
          >
            {aliases[emote.name]}
          </div>
        )}
        {aliasTarget === emote.name && (
          <div className="emote-alias-editor">
            <div className="emote-alias-input-row">
              <input
                className="emote-alias-input"
                value={aliasInput}
                onChange={(e) => setAliasInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitAlias();
                  }
                }}
                placeholder={aliases[emote.name] ? "Replace alias" : "Add alias"}
                autoFocus
              />
              <button type="button"
                className="emote-alias-add-btn"
                onClick={submitAlias}
                title={aliases[emote.name] ? "Replace alias" : "Add alias"}
              >
                {aliases[emote.name] ? "Save" : "Add"}
              </button>
            </div>
            {aliases[emote.name] && (
              <div className="emote-alias-list">
                <span className="emote-alias-chip">
                  {aliases[emote.name]}
                  <button type="button"
                    onClick={handleRemoveAlias}
                    title={`Remove alias "${aliases[emote.name]}"`}
                  >
                    ×
                  </button>
                </span>
              </div>
            )}
          </div>
        )}
        <div className="emote-item-actions emote-item-actions--bottom">
          <button type="button"
            className="emote-alias-btn"
            onClick={(e) => {
              e.stopPropagation();
              setAliasTarget(aliasTarget === emote.name ? null : emote.name);
              setAliasInput("");
            }}
            title="Manage aliases"
          >
            Alias
          </button>
        </div>
      </div>
    );
  };

  // Twitch panel conten

  const twitchSidebar = (
    <div className="emote-channel-sidebar">
      {/* Global */}
      <button type="button"
        className={`emote-channel-avatar-btn ${activeTwitchChannel === TWITCH_GLOBAL_KEY ? "active" : ""}`}
        onClick={() => setActiveTwitchChannel(TWITCH_GLOBAL_KEY)}
        title="Global"
      >
        <div className="emote-channel-avatar emote-channel-avatar--global">
          <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20">
            <path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm0 1.5a6.5 6.5 0 110 13 6.5 6.5 0 010-13zm0 1a5.5 5.5 0 00-4.47 8.72l.28-.72h1.44l-.5 2H8.5l.5-2h2l.5 2h1.75l-.5-2h1.44l.28.72A5.5 5.5 0 0010 4.5z" />
          </svg>
        </div>
        <span className="emote-channel-label">Global</span>
      </button>

      {/* Per-channel */}
      {emotes.twitchChannels.map((ch) => (
        <button type="button"
          key={ch.channelId}
          className={`emote-channel-avatar-btn ${activeTwitchChannel === ch.channelId ? "active" : ""}`}
          onClick={() => setActiveTwitchChannel(ch.channelId)}
          title={ch.channelName}
        >
          {ch.profileImageUrl ? (
            <img
              src={ch.profileImageUrl}
              alt={ch.channelName}
              className="emote-channel-avatar emote-channel-avatar--img"
            />
          ) : (
            <div className="emote-channel-avatar emote-channel-avatar--fallback">
              {ch.channelName.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="emote-channel-label">{ch.channelName}</span>
        </button>
      ))}
    </div>
  );

  const currentTwitchEmotes =
    activeTwitchChannel === TWITCH_GLOBAL_KEY
      ? filteredEmotes.twitchGlobal
      : (filteredEmotes.twitchChannels.find(
          (ch) => ch.channelId === activeTwitchChannel,
        )?.emotes ?? []);

  const currentTwitchChannelName =
    activeTwitchChannel === TWITCH_GLOBAL_KEY
      ? "Global"
      : (emotes.twitchChannels.find(
          (ch) => ch.channelId === activeTwitchChannel,
        )?.channelName ?? "");

  const isCurrentChannelGlobal = activeTwitchChannel === TWITCH_GLOBAL_KEY;
  const currentChannelDisabled =
    !isCurrentChannelGlobal && disabledChannels.has(activeTwitchChannel);

  const twitchPanel = (
    <div className="emote-tab-panel emote-tab-panel--twitch">
      {twitchSidebar}
      <div className="emote-channel-content">
        {isSearching ? (
          // Search: show all channels that have results
          <>
            {filteredEmotes.twitchGlobal.length > 0 && (
              <div className="emote-search-group">
                <div className="emote-search-group-label">
                  Global ({filteredEmotes.twitchGlobal.length})
                </div>
                <div className="emote-grid">
                  {filteredEmotes.twitchGlobal.map((e) => renderEmoteItem(e))}
                </div>
              </div>
            )}
            {filteredEmotes.twitchChannels.reduce<React.ReactNode[]>((acc, ch) => {
              if (ch.emotes.length === 0) return acc;
              acc.push(
                <div key={ch.channelId} className="emote-search-group">
                  <div className="emote-search-group-label">
                    {ch.channelName} ({ch.emotes.length})
                  </div>
                  <div className="emote-grid">
                    {ch.emotes.map((e) =>
                      renderEmoteItem(e, disabledChannels.has(ch.channelId)),
                    )}
                  </div>
                </div>,
              );
              return acc;
            }, [])}
            {filteredEmotes.twitchGlobal.length === 0 &&
              filteredEmotes.twitchChannels.every(
                (ch) => ch.emotes.length === 0,
              ) && (
                <div className="emote-no-results">
                  No Twitch emotes match "{searchQuery}"
                </div>
              )}
          </>
        ) : (
          // Normal: show only selected channel
          <>
            <div className="emote-channel-panel-header">
              <span className="emote-channel-panel-name">
                {currentTwitchChannelName}
              </span>
              <span className="emote-source-count">
                ({currentTwitchEmotes.length})
              </span>
              {!isCurrentChannelGlobal && (
                <button type="button"
                  className="emote-channel-disable-btn"
                  onClick={() => {
                    toggleDisableEmoteChannel(activeTwitchChannel);
                    setDisabledChannels(getDisabledEmoteChannels());
                  }}
                  title={
                    currentChannelDisabled
                      ? "Enable all emotes from this channel"
                      : "Disable all emotes from this channel"
                  }
                >
                  {currentChannelDisabled ? "Enable channel" : "Disable channel"}
                </button>
              )}
            </div>
            {currentTwitchEmotes.length > 0 ? (
              <div className="emote-grid">
                {currentTwitchEmotes.map((e) =>
                  renderEmoteItem(e, currentChannelDisabled),
                )}
              </div>
            ) : (
              <div className="emote-no-results">
                {activeTwitchChannel === TWITCH_GLOBAL_KEY
                  ? "No global Twitch emotes loaded"
                  : "No emotes for this channel"}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  const renderThirdPartyPanel = (
    key: "7tv" | "bttv" | "ffz",
    label: string,
    color: string,
  ) => {
    const sourceEmotes = filteredEmotes[key];
    return (
      <div className="emote-tab-panel">
        <div className="emote-channel-content">
          <div className="emote-channel-panel-header">
            <span className="emote-channel-panel-name" style={{ color }}>
              {label}
            </span>
            <span className="emote-source-count">({sourceEmotes.length})</span>
          </div>
          {sourceEmotes.length > 0 ? (
            <div className="emote-grid">
              {sourceEmotes.map((e) => renderEmoteItem(e))}
            </div>
          ) : (
            <div className="emote-no-results">
              {isSearching
                ? `No ${label} emotes match "${searchQuery}"`
                : `No ${label} emotes available`}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="emote-menu-overlay">
      <div ref={menuRef} className="emote-menu-modal">
        <div className="emote-menu-header">
          <h2>Emotes</h2>
          <button type="button" className="emote-menu-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="emote-menu-search">
          <FaSearch size={16} style={{ color: "#94a3b8" }} />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search all emotes..."
            aria-label="Search all emotes"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="emote-search-input"
          />
        </div>

        <div className="emote-menu-tabs">
          <button type="button"
            className={`emote-tab ${activeTab === "twitch" ? "active" : ""}`}
            onClick={() => setActiveTab("twitch")}
            style={{
              color: activeTab === "twitch" ? TWITCH_COLOR : "#cbd5e1",
              borderBottomColor:
                activeTab === "twitch" ? TWITCH_COLOR : "transparent",
            }}
          >
            Twitch
          </button>
          {THIRD_PARTY_SOURCES.map(({ key, label, color }) => (
            <button type="button"
              key={key}
              className={`emote-tab ${activeTab === key ? "active" : ""}`}
              onClick={() => setActiveTab(key)}
              style={{
                color: activeTab === key ? color : "#cbd5e1",
                borderBottomColor: activeTab === key ? color : "transparent",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="emote-menu-content">
          {activeTab === "twitch" && twitchPanel}
          {activeTab === "7tv" &&
            renderThirdPartyPanel("7tv", "7TV", "#00d4ff")}
          {activeTab === "bttv" &&
            renderThirdPartyPanel("bttv", "BTTV", "#34ae7b")}
          {activeTab === "ffz" &&
            renderThirdPartyPanel("ffz", "FFZ", "#faa61a")}
        </div>
      </div>
    </div>
  );
}

export default memo(EmoteMenu);
