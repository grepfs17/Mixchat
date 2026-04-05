import { useState, useRef, useEffect, memo } from 'react';
import { FaSearch } from 'react-icons/fa';
import type { EmotesBySource } from '../lib/emotes';
import { toggleDisableEmote, getDisabledEmotes } from '../lib/emotes';


interface EmoteMenuProps {
  emotes: EmotesBySource;
  onSelectEmote: (emoteName: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

const TWITCH_GLOBAL_KEY = '__global';

function EmoteMenu({ emotes, onSelectEmote, isOpen, onClose }: EmoteMenuProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredEmotes, setFilteredEmotes] = useState<EmotesBySource>(emotes);
  const [activeTab, setActiveTab] = useState<'twitch' | '7tv' | 'bttv' | 'ffz'>('twitch');
  // selected channel within the Twitch tab (TWITCH_GLOBAL_KEY or channelId)
  const [activeTwitchChannel, setActiveTwitchChannel] = useState<string>(TWITCH_GLOBAL_KEY);
  const [disabledSet, setDisabledSet] = useState<Set<string>>(new Set());
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const prevIsOpenRef = useRef(false);

  // Filter emotes based on search query — cross-source when searching
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredEmotes(emotes);
      return;
    }
    const lowerQuery = searchQuery.toLowerCase();
    setFilteredEmotes({
      twitchGlobal: emotes.twitchGlobal.filter(e => e.name.toLowerCase().includes(lowerQuery)),
      twitchChannels: emotes.twitchChannels.map(ch => ({
        ...ch,
        emotes: ch.emotes.filter(e => e.name.toLowerCase().includes(lowerQuery)),
      })),
      '7tv': emotes['7tv'].filter(e => e.name.toLowerCase().includes(lowerQuery)),
      bttv: emotes.bttv.filter(e => e.name.toLowerCase().includes(lowerQuery)),
      ffz: emotes.ffz.filter(e => e.name.toLowerCase().includes(lowerQuery)),
    });
  }, [searchQuery, emotes]);

  // Reset navigation state only when the menu transitions from closed to open.
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setSearchQuery('');
      setActiveTab('twitch');
      setActiveTwitchChannel(TWITCH_GLOBAL_KEY);
      setFilteredEmotes(emotes);
      setDisabledSet(getDisabledEmotes());
      if (searchInputRef.current) searchInputRef.current.focus();
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, emotes]);

  useEffect(() => {
    const handler = () => setDisabledSet(getDisabledEmotes());
    window.addEventListener('emotes-reloaded', handler);
    return () => window.removeEventListener('emotes-reloaded', handler);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) onClose();
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape' && isOpen) onClose(); };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const thirdPartySources = [
    { key: '7tv' as const, label: '7TV', color: '#00d4ff' },
    { key: 'bttv' as const, label: 'BTTV', color: '#34ae7b' },
    { key: 'ffz' as const, label: 'FFZ', color: '#faa61a' },
  ] as const;

  const twitchColor = '#9146ff';
  const isSearching = searchQuery.trim().length > 0;

  const renderEmoteItem = (emote: { name: string; url: string }) => {
    const isDisabled = disabledSet.has(emote.name);
    return (
      <div
        key={emote.name}
        className={`emote-item ${isDisabled ? 'emote-disabled' : ''}`}
        onClick={() => {
          if (!isDisabled) { onSelectEmote(emote.name); setSearchQuery(''); }
        }}
        title={emote.name}
      >
        <button
          className="emote-disable-btn"
          onClick={(e) => {
            e.stopPropagation();
            toggleDisableEmote(emote.name);
            setDisabledSet(getDisabledEmotes());
          }}
          title={isDisabled ? 'Enable emote' : 'Disable emote'}
        >
          {isDisabled ? 'Enable' : 'Disable'}
        </button>
        <img src={emote.url} alt={emote.name} className="emote-image" />
        <span className="emote-name">{emote.name}</span>
      </div>
    );
  };

  // ── Twitch panel content ──────────────────────────────────────────────────

  const twitchSidebar = (
    <div className="emote-channel-sidebar">
      {/* Global */}
      <button
        className={`emote-channel-avatar-btn ${activeTwitchChannel === TWITCH_GLOBAL_KEY ? 'active' : ''}`}
        onClick={() => setActiveTwitchChannel(TWITCH_GLOBAL_KEY)}
        title="Global"
      >
        <div className="emote-channel-avatar emote-channel-avatar--global">
          <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20">
            <path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm0 1.5a6.5 6.5 0 110 13 6.5 6.5 0 010-13zm0 1a5.5 5.5 0 00-4.47 8.72l.28-.72h1.44l-.5 2H8.5l.5-2h2l.5 2h1.75l-.5-2h1.44l.28.72A5.5 5.5 0 0010 4.5z"/>
          </svg>
        </div>
        <span className="emote-channel-label">Global</span>
      </button>

      {/* Per-channel */}
      {emotes.twitchChannels.map(ch => (
        <button
          key={ch.channelId}
          className={`emote-channel-avatar-btn ${activeTwitchChannel === ch.channelId ? 'active' : ''}`}
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
      : (filteredEmotes.twitchChannels.find(ch => ch.channelId === activeTwitchChannel)?.emotes ?? []);

  const currentTwitchChannelName =
    activeTwitchChannel === TWITCH_GLOBAL_KEY
      ? 'Global'
      : (emotes.twitchChannels.find(ch => ch.channelId === activeTwitchChannel)?.channelName ?? '');

  const twitchPanel = (
    <div className="emote-tab-panel emote-tab-panel--twitch">
      {twitchSidebar}
      <div className="emote-channel-content">
        {isSearching ? (
          // Search: show all channels that have results
          <>
            {filteredEmotes.twitchGlobal.length > 0 && (
              <div className="emote-search-group">
                <div className="emote-search-group-label">Global ({filteredEmotes.twitchGlobal.length})</div>
                <div className="emote-grid">{filteredEmotes.twitchGlobal.map(renderEmoteItem)}</div>
              </div>
            )}
            {filteredEmotes.twitchChannels.filter(ch => ch.emotes.length > 0).map(ch => (
              <div key={ch.channelId} className="emote-search-group">
                <div className="emote-search-group-label">{ch.channelName} ({ch.emotes.length})</div>
                <div className="emote-grid">{ch.emotes.map(renderEmoteItem)}</div>
              </div>
            ))}
            {filteredEmotes.twitchGlobal.length === 0 &&
              filteredEmotes.twitchChannels.every(ch => ch.emotes.length === 0) && (
                <div className="emote-no-results">No Twitch emotes match "{searchQuery}"</div>
              )}
          </>
        ) : (
          // Normal: show only selected channel
          <>
            <div className="emote-channel-panel-header">
              <span className="emote-channel-panel-name">{currentTwitchChannelName}</span>
              <span className="emote-source-count">({currentTwitchEmotes.length})</span>
            </div>
            {currentTwitchEmotes.length > 0 ? (
              <div className="emote-grid">{currentTwitchEmotes.map(renderEmoteItem)}</div>
            ) : (
              <div className="emote-no-results">
                {activeTwitchChannel === TWITCH_GLOBAL_KEY
                  ? 'No global Twitch emotes loaded'
                  : 'No emotes for this channel'}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  // ── Third-party panel ────────────────────────────────────────────────────

  const renderThirdPartyPanel = (
    key: '7tv' | 'bttv' | 'ffz',
    label: string,
    color: string,
  ) => {
    const sourceEmotes = filteredEmotes[key];
    return (
      <div className="emote-tab-panel">
        <div className="emote-channel-content">
          <div className="emote-channel-panel-header">
            <span className="emote-channel-panel-name" style={{ color }}>{label}</span>
            <span className="emote-source-count">({sourceEmotes.length})</span>
          </div>
          {sourceEmotes.length > 0 ? (
            <div className="emote-grid">{sourceEmotes.map(renderEmoteItem)}</div>
          ) : (
            <div className="emote-no-results">
              {isSearching ? `No ${label} emotes match "${searchQuery}"` : `No ${label} emotes available`}
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
          <button className="emote-menu-close" onClick={onClose}>✕</button>
        </div>

        <div className="emote-menu-search">
          <FaSearch size={16} style={{ color: '#94a3b8' }} />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search all emotes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="emote-search-input"
          />
        </div>

        <div className="emote-menu-tabs">
          <button
            className={`emote-tab ${activeTab === 'twitch' ? 'active' : ''}`}
            onClick={() => setActiveTab('twitch')}
            style={{
              color: activeTab === 'twitch' ? twitchColor : '#cbd5e1',
              borderBottomColor: activeTab === 'twitch' ? twitchColor : 'transparent',
            }}
          >
            Twitch
          </button>
          {thirdPartySources.map(({ key, label, color }) => (
            <button
              key={key}
              className={`emote-tab ${activeTab === key ? 'active' : ''}`}
              onClick={() => setActiveTab(key)}
              style={{
                color: activeTab === key ? color : '#cbd5e1',
                borderBottomColor: activeTab === key ? color : 'transparent',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="emote-menu-content">
          {activeTab === 'twitch' && twitchPanel}
          {activeTab === '7tv' && renderThirdPartyPanel('7tv', '7TV', '#00d4ff')}
          {activeTab === 'bttv' && renderThirdPartyPanel('bttv', 'BTTV', '#34ae7b')}
          {activeTab === 'ffz' && renderThirdPartyPanel('ffz', 'FFZ', '#faa61a')}
        </div>
      </div>
    </div>
  );
}

export default memo(EmoteMenu);
