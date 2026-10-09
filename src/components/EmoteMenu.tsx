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

type EmoteSourceTab = "twitch" | "7tv" | "bttv" | "ffz";

type EmoteNameUrl = { name: string; url: string };

interface EmoteItemProps {
  emote: EmoteNameUrl;
  channelDisabled: boolean;
  disabledSet: Set<string>;
  aliases: Record<string, string>;
  aliasTarget: string | null;
  aliasInput: string;
  onSelectEmote: (emoteName: string) => void;
  onClearSearch: () => void;
  onToggleDisable: (name: string) => void;
  onAliasInputChange: (value: string) => void;
  onSubmitAlias: () => void;
  onRemoveAlias: () => void;
  onToggleAlias: (name: string) => void;
}

function EmoteItem({
  emote,
  channelDisabled,
  disabledSet,
  aliases,
  aliasTarget,
  aliasInput,
  onSelectEmote,
  onClearSearch,
  onToggleDisable,
  onAliasInputChange,
  onSubmitAlias,
  onRemoveAlias,
  onToggleAlias,
}: EmoteItemProps) {
  const isDisabled = channelDisabled || disabledSet.has(emote.name);
  const alias = aliases[emote.name];
  const isEditingAlias = aliasTarget === emote.name;

  return (
    <div className={`emote-item ${isDisabled ? "emote-disabled" : ""}`}>
      {!channelDisabled && (
        <div className="emote-item-actions emote-item-actions--top">
          <button type="button"
            className="emote-disable-btn"
            onClick={(e) => {
              e.stopPropagation();
              onToggleDisable(emote.name);
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
            onClearSearch();
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
      {alias && !isEditingAlias && (
        <div className="emote-alias-display" title={`Alias: ${alias}`}>
          {alias}
        </div>
      )}
      {isEditingAlias && (
        <div className="emote-alias-editor">
          <div className="emote-alias-input-row">
            <input
              className="emote-alias-input"
              value={aliasInput}
              onChange={(e) => onAliasInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onSubmitAlias();
                }
              }}
              placeholder={alias ? "Replace alias" : "Add alias"}
              autoFocus
            />
            <button type="button"
              className="emote-alias-add-btn"
              onClick={onSubmitAlias}
              title={alias ? "Replace alias" : "Add alias"}
            >
              {alias ? "Save" : "Add"}
            </button>
          </div>
          {alias && (
            <div className="emote-alias-list">
              <span className="emote-alias-chip">
                {alias}
                <button type="button"
                  onClick={onRemoveAlias}
                  title={`Remove alias "${alias}"`}
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
            onToggleAlias(emote.name);
          }}
          title="Manage aliases"
        >
          Alias
        </button>
      </div>
    </div>
  );
}

interface EmoteChannelSidebarProps {
  channels: EmotesBySource["twitchChannels"];
  activeTwitchChannel: string;
  onSelectChannel: (channelId: string) => void;
}

function EmoteChannelSidebar({
  channels,
  activeTwitchChannel,
  onSelectChannel,
}: EmoteChannelSidebarProps) {
  return (
    <div className="emote-channel-sidebar">
      {/* Global */}
      <button type="button"
        className={`emote-channel-avatar-btn ${activeTwitchChannel === TWITCH_GLOBAL_KEY ? "active" : ""}`}
        onClick={() => onSelectChannel(TWITCH_GLOBAL_KEY)}
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
      {channels.map((ch) => (
        <button type="button"
          key={ch.channelId}
          className={`emote-channel-avatar-btn ${activeTwitchChannel === ch.channelId ? "active" : ""}`}
          onClick={() => onSelectChannel(ch.channelId)}
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
}

interface TwitchSearchResultsProps {
  filteredEmotes: EmotesBySource;
  searchQuery: string;
  disabledChannels: Set<string>;
  renderEmoteItem: (
    emote: EmoteNameUrl,
    channelDisabled?: boolean,
  ) => React.ReactNode;
}

function TwitchSearchResults({
  filteredEmotes,
  searchQuery,
  disabledChannels,
  renderEmoteItem,
}: TwitchSearchResultsProps) {
  return (
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
  );
}

interface TwitchChannelViewProps {
  activeTwitchChannel: string;
  currentTwitchChannelName: string;
  currentTwitchEmotes: EmoteNameUrl[];
  isCurrentChannelGlobal: boolean;
  currentChannelDisabled: boolean;
  onToggleChannel: (channelId: string) => void;
  renderEmoteItem: (
    emote: EmoteNameUrl,
    channelDisabled?: boolean,
  ) => React.ReactNode;
}

function TwitchChannelView({
  activeTwitchChannel,
  currentTwitchChannelName,
  currentTwitchEmotes,
  isCurrentChannelGlobal,
  currentChannelDisabled,
  onToggleChannel,
  renderEmoteItem,
}: TwitchChannelViewProps) {
  return (
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
            onClick={() => onToggleChannel(activeTwitchChannel)}
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
  );
}

interface ThirdPartyPanelProps {
  sourceEmotes: EmoteNameUrl[];
  label: string;
  color: string;
  isSearching: boolean;
  searchQuery: string;
  renderEmoteItem: (emote: EmoteNameUrl) => React.ReactNode;
}

function ThirdPartyPanel({
  sourceEmotes,
  label,
  color,
  isSearching,
  searchQuery,
  renderEmoteItem,
}: ThirdPartyPanelProps) {
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
}

interface EmoteMenuTabsProps {
  activeTab: EmoteSourceTab;
  onSelectTab: (tab: EmoteSourceTab) => void;
}

function EmoteMenuTabs({ activeTab, onSelectTab }: EmoteMenuTabsProps) {
  return (
    <div className="emote-menu-tabs">
      <button type="button"
        className={`emote-tab ${activeTab === "twitch" ? "active" : ""}`}
        onClick={() => onSelectTab("twitch")}
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
          onClick={() => onSelectTab(key)}
          style={{
            color: activeTab === key ? color : "#cbd5e1",
            borderBottomColor: activeTab === key ? color : "transparent",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function EmoteMenu({ emotes, onSelectEmote, isOpen, onClose }: EmoteMenuProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<EmoteSourceTab>("twitch");
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

  const handleToggleDisable = (name: string) => {
    toggleDisableEmote(name);
    setDisabledSet(getDisabledEmotes());
  };

  const handleToggleChannel = (channelId: string) => {
    toggleDisableEmoteChannel(channelId);
    setDisabledChannels(getDisabledEmoteChannels());
  };

  const handleToggleAlias = (name: string) => {
    setAliasTarget(aliasTarget === name ? null : name);
    setAliasInput("");
  };

  const renderEmoteItem = (
    emote: EmoteNameUrl,
    channelDisabled = false,
  ) => (
    <EmoteItem
      key={emote.name}
      emote={emote}
      channelDisabled={channelDisabled}
      disabledSet={disabledSet}
      aliases={aliases}
      aliasTarget={aliasTarget}
      aliasInput={aliasInput}
      onSelectEmote={onSelectEmote}
      onClearSearch={() => setSearchQuery("")}
      onToggleDisable={handleToggleDisable}
      onAliasInputChange={setAliasInput}
      onSubmitAlias={submitAlias}
      onRemoveAlias={handleRemoveAlias}
      onToggleAlias={handleToggleAlias}
    />
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

  return (
    <div className="emote-menu-overlay">
      <div ref={menuRef} className="emote-menu-modal">
        <div className="emote-menu-header">
          <h2>Emotes</h2>
          <button
            type="button"
            className="emote-menu-close"
            onClick={onClose}
            aria-label="Close emote menu"
          >
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

        <EmoteMenuTabs activeTab={activeTab} onSelectTab={setActiveTab} />

        <div className="emote-menu-content">
          {activeTab === "twitch" && (
            <div className="emote-tab-panel emote-tab-panel--twitch">
              <EmoteChannelSidebar
                channels={emotes.twitchChannels}
                activeTwitchChannel={activeTwitchChannel}
                onSelectChannel={setActiveTwitchChannel}
              />
              <div className="emote-channel-content">
                {isSearching ? (
                  <TwitchSearchResults
                    filteredEmotes={filteredEmotes}
                    searchQuery={searchQuery}
                    disabledChannels={disabledChannels}
                    renderEmoteItem={renderEmoteItem}
                  />
                ) : (
                  <TwitchChannelView
                    activeTwitchChannel={activeTwitchChannel}
                    currentTwitchChannelName={currentTwitchChannelName}
                    currentTwitchEmotes={currentTwitchEmotes}
                    isCurrentChannelGlobal={isCurrentChannelGlobal}
                    currentChannelDisabled={currentChannelDisabled}
                    onToggleChannel={handleToggleChannel}
                    renderEmoteItem={renderEmoteItem}
                  />
                )}
              </div>
            </div>
          )}
          {activeTab === "7tv" && (
            <ThirdPartyPanel
              sourceEmotes={filteredEmotes["7tv"]}
              label="7TV"
              color="#00d4ff"
              isSearching={isSearching}
              searchQuery={searchQuery}
              renderEmoteItem={renderEmoteItem}
            />
          )}
          {activeTab === "bttv" && (
            <ThirdPartyPanel
              sourceEmotes={filteredEmotes.bttv}
              label="BTTV"
              color="#34ae7b"
              isSearching={isSearching}
              searchQuery={searchQuery}
              renderEmoteItem={renderEmoteItem}
            />
          )}
          {activeTab === "ffz" && (
            <ThirdPartyPanel
              sourceEmotes={filteredEmotes.ffz}
              label="FFZ"
              color="#faa61a"
              isSearching={isSearching}
              searchQuery={searchQuery}
              renderEmoteItem={renderEmoteItem}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(EmoteMenu);
