import React, { useState, useRef, useEffect, memo } from 'react';
import { FaSearch } from 'react-icons/fa';
import type { EmotesBySource } from '../lib/emotes';
import { toggleDisableEmote, getDisabledEmotes } from '../lib/emotes';
import '../styles/EmoteMenu.css';

interface EmoteMenuProps {
  emotes: EmotesBySource;
  onSelectEmote: (emoteName: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

function EmoteMenu({ emotes, onSelectEmote, isOpen, onClose }: EmoteMenuProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredEmotes, setFilteredEmotes] = useState<EmotesBySource>(emotes);
  const [activeSection, setActiveSection] = useState<'twitch' | '7tv' | 'bttv' | 'ffz'>('twitch');
  const [disabledSet, setDisabledSet] = useState<Set<string>>(new Set());
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({
    twitch: null,
    '7tv': null,
    bttv: null,
    ffz: null,
  });
  const scrollToSection = (section: string) => {
    setActiveSection(section as any);
    const sectionElement = sectionRefs.current[section];
    if (sectionElement && contentRef.current) {
      const scrollTop = sectionElement.offsetTop - contentRef.current.offsetTop;
      contentRef.current.scrollTo({ top: scrollTop, behavior: 'smooth' });
    }
  };

  // Filter emotes based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredEmotes(emotes);
      return;
    }

    const lowerQuery = searchQuery.toLowerCase();
    setFilteredEmotes({
      twitch: emotes.twitch.filter(e => e.name.toLowerCase().includes(lowerQuery)),
      '7tv': emotes['7tv'].filter(e => e.name.toLowerCase().includes(lowerQuery)),
      bttv: emotes.bttv.filter(e => e.name.toLowerCase().includes(lowerQuery)),
      ffz: emotes.ffz.filter(e => e.name.toLowerCase().includes(lowerQuery)),
    });
  }, [searchQuery, emotes]);

  // Reset search and display all emotes when menu opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setActiveSection('twitch');
      setFilteredEmotes(emotes);
      setDisabledSet(getDisabledEmotes());
      if (searchInputRef.current) {
        searchInputRef.current.focus();
      }
    }
  }, [isOpen, emotes]);

  // Update disabled emotes when global emote state changes
  useEffect(() => {
    const handler = () => setDisabledSet(getDisabledEmotes());
    window.addEventListener('emotes-reloaded', handler);
    return () => window.removeEventListener('emotes-reloaded', handler);
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  // Handle keyboard escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sources = [
    { key: 'twitch', label: 'Twitch', color: '#9146ff' },
    { key: '7tv' as const, label: '7TV', color: '#00d4ff' },
    { key: 'bttv', label: 'BTTV', color: '#34ae7b' },
    { key: 'ffz', label: 'FFZ', color: '#faa61a' },
  ] as const;

  return (
    <div className="emote-menu-overlay">
      <div ref={menuRef} className="emote-menu-modal">
        <div className="emote-menu-header">
          <h2>Emotes</h2>
          <button className="emote-menu-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="emote-menu-search">
          <FaSearch size={16} style={{ color: '#94a3b8' }} />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search emotes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="emote-search-input"
          />
        </div>

        <div className="emote-menu-tabs">
          {sources.map(({ key, label, color }) => (
            <button
              key={key}
              className={`emote-tab ${activeSection === key ? 'active' : ''}`}
              onClick={() => scrollToSection(key)}
              style={{
                color: activeSection === key ? color : '#cbd5e1',
                borderBottomColor: activeSection === key ? color : 'transparent',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="emote-menu-content" ref={contentRef}>
          {sources.map(({ key, label, color }) => {
            const sourceEmotes = filteredEmotes[key];

            return (
              <div
                key={key}
                className="emote-source-section"
                ref={(el) => {
                  if (el) sectionRefs.current[key] = el;
                }}
              >
                <div className="emote-source-header">
                  <div
                    className="emote-source-dot"
                    style={{ backgroundColor: color }}
                  />
                  <h3 style={{ color }}>{label}</h3>
                  <span className="emote-source-count">({sourceEmotes.length})</span>
                </div>
                {sourceEmotes.length > 0 ? (
                  <div className="emote-grid">
                    {sourceEmotes.map((emote) => {
                      const isDisabled = disabledSet.has(emote.name);
                      return (
                        <div
                          key={emote.name}
                          className={`emote-item ${isDisabled ? 'emote-disabled' : ''}`}
                          onClick={() => {
                            if (!isDisabled) {
                              onSelectEmote(emote.name);
                              setSearchQuery('');
                            }
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
                          <img
                            src={emote.url}
                            alt={emote.name}
                            className="emote-image"
                          />
                          <span className="emote-name">{emote.name}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="emote-no-results-section">
                    No {label} emotes available
                  </div>
                )}
              </div>
            );
          })}

          {Object.values(filteredEmotes).every(arr => arr.length === 0) && (
            <div className="emote-no-results">
              No emotes found matching "{searchQuery}"
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(EmoteMenu);
