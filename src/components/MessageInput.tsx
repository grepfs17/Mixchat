import React, { useState, useRef, useEffect, memo } from 'react';
import { createPortal } from 'react-dom';
import { FaTimes, FaSmile, FaTwitch } from 'react-icons/fa';
import type { Platform, ChatMessage } from '../lib/types';
import { searchEmotes, getAllEmotesOrganized, type EmotesBySource } from '../lib/emotes';
import { isMobileDevice } from '../lib/device';
import EmoteMenu from './EmoteMenu';

interface MessageInputProps {
  onSendMessage: (message: string, platforms: Platform[], replyToId?: string) => Promise<void>;
  isLoading: boolean;
  isConnected: { twitch: boolean };
  replyingTo?: ChatMessage;
  onCancelReply?: () => void;
  chatMessages?: ChatMessage[];
  currentUsername?: string;
  onInputFocus?: () => void;
  slowModeWaitTime?: number | null;
  followerModeMinutes?: number | null;
}

function MessageInput({
  onSendMessage,
  isLoading,
  isConnected: _isConnected,
  replyingTo,
  onCancelReply,
  chatMessages = [],
  currentUsername = '',
  onInputFocus,
  slowModeWaitTime = null,
  followerModeMinutes = null,
}: MessageInputProps) {
  const [message, setMessage] = useState('');
  const [placeholder, _setPlaceholder] = useState('Type your message');
  const [selectedPlatforms, _setSelectedPlatforms] = useState<Platform[]>([
    'twitch',
  ]);
  const [_emoteQuery, setEmoteQuery] = useState('');
  const [emoteResults, setEmoteResults] = useState<Array<{ name: string; url: string; source: string }>>([]);
  const [selectedEmoteIndex, setSelectedEmoteIndex] = useState(-1);
  const [hasEmoteSelection, setHasEmoteSelection] = useState(false);
  const [showEmoteMenu, setShowEmoteMenu] = useState(false);
  const [showEmotePickerMenu, setShowEmotePickerMenu] = useState(false);
  const [emotesOrganized, setEmotesOrganized] = useState<EmotesBySource>({
    twitchGlobal: [],
    twitchChannels: [],
    '7tv': [],
    bttv: [],
    ffz: [],
  });
  const [_usernameQuery, setUsernameQuery] = useState('');
  const [usernameResults, setUsernameResults] = useState<string[]>([]);
  const [selectedUsernameIndex, setSelectedUsernameIndex] = useState(-1);
  const [showUsernameMenu, setShowUsernameMenu] = useState(false);
  const [hasUsernameSelection, setHasUsernameSelection] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emoteMenuRef = useRef<HTMLDivElement>(null);
  const shouldRefocusRef = useRef(false);
  const [slowModeCooldown, setSlowModeCooldown] = useState(0);
  const slowModeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Position of the textarea, used to anchor the portal-rendered autocomplete menu
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);


  // Load organized emotes on component mount
  useEffect(() => {
    const organized = getAllEmotesOrganized();
    setEmotesOrganized(organized);

    // Listen for emotes-reloaded event
    function handleEmotesReloaded() {
      const updated = getAllEmotesOrganized();
      setEmotesOrganized(updated);
    }
    window.addEventListener('emotes-reloaded', handleEmotesReloaded);
    return () => {
      window.removeEventListener('emotes-reloaded', handleEmotesReloaded);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (slowModeTimerRef.current) clearInterval(slowModeTimerRef.current);
    };
  }, []);

  // Refresh emotes whenever the emote picker menu opens
  useEffect(() => {
    if (showEmotePickerMenu) {
      const organized = getAllEmotesOrganized();
      setEmotesOrganized(organized);
    }
  }, [showEmotePickerMenu]);

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newMessage = e.target.value;
    setMessage(newMessage);

    // Get cursor position
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = newMessage.substring(0, cursorPos);

    // Find the last word being typed (after space or at start)
    const lastSpaceIndex = textBeforeCursor.lastIndexOf(' ');
    const currentWord = textBeforeCursor.substring(lastSpaceIndex + 1);

    // Check for @ mentions
    if (currentWord.startsWith('@') && currentWord.length > 1) {
      const query = currentWord.substring(1).toLowerCase();
      // Case-insensitive deduplication: prefer mixed-case display names over all-lowercase login names
      const authorMap = new Map<string, string>(); 
      chatMessages.forEach((msg) => {
        const lower = msg.author.toLowerCase();
        const existing = authorMap.get(lower);
        if (!existing || (existing === existing.toLowerCase() && msg.author !== msg.author.toLowerCase())) {
          authorMap.set(lower, msg.author);
        }
      });
      const matching = Array.from(authorMap.values())
        .filter((name) => name.toLowerCase().includes(query) && name.toLowerCase() !== currentUsername.toLowerCase())
        .sort();

      if (matching.length > 0) {
        setUsernameQuery(query);
        setUsernameResults(matching);
        setSelectedUsernameIndex(-1);
        setHasUsernameSelection(false);
        setShowUsernameMenu(true);
        setShowEmoteMenu(false);
      } else {
        setShowUsernameMenu(false);
      }
    }
    // Show emote autocomplete if typing a word
    else if (currentWord.length > 0 && !currentWord.startsWith('@')) {
      const results = searchEmotes(currentWord);
      if (results.length > 0) {
        setEmoteQuery(currentWord);
        setEmoteResults(results);
        setSelectedEmoteIndex(-1);
        setHasEmoteSelection(false);
        setShowEmoteMenu(true);
        setShowUsernameMenu(false);
      } else {
        setShowEmoteMenu(false);
        setShowUsernameMenu(false);
      }
    } else {
      setShowEmoteMenu(false);
      setShowUsernameMenu(false);
    }
  };

  const insertEmote = (emoteName: string) => {
    if (!textareaRef.current) return;

    const cursorPos = textareaRef.current.selectionStart;
    const textBeforeCursor = message.substring(0, cursorPos);
    const textAfterCursor = message.substring(cursorPos);

    // If message is empty, just insert the emote with a space after
    if (!textBeforeCursor.trim()) {
      const newMessage = emoteName + ' ' + textAfterCursor;
      setMessage(newMessage);
      setShowEmoteMenu(false);
      setShowEmotePickerMenu(false);
      setHasEmoteSelection(false);

      // Set cursor after the inserted emote
      setTimeout(() => {
        if (textareaRef.current) {
          const newCursorPos = (emoteName + ' ').length;
          textareaRef.current.selectionStart = newCursorPos;
          textareaRef.current.selectionEnd = newCursorPos;
          textareaRef.current.focus();
        }
      }, 0);
      return;
    }

    // Find the start of the current word
    const lastSpaceIndex = textBeforeCursor.lastIndexOf(' ');
    const beforeWord = textBeforeCursor.substring(0, lastSpaceIndex + 1);

    // Insert emote
    const newMessage = beforeWord + emoteName + ' ' + textAfterCursor;
    setMessage(newMessage);
    setShowEmoteMenu(false);
    setShowEmotePickerMenu(false);
    setHasEmoteSelection(false);

    // Set cursor after the inserted emote
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = (beforeWord + emoteName + ' ').length;
        textareaRef.current.selectionStart = newCursorPos;
        textareaRef.current.selectionEnd = newCursorPos;
        textareaRef.current.focus();
      }
    }, 0);
  };

  const insertUsername = (username: string) => {
    if (!textareaRef.current) return;

    const cursorPos = textareaRef.current.selectionStart;
    const textBeforeCursor = message.substring(0, cursorPos);
    const textAfterCursor = message.substring(cursorPos);

    // Find the start of the @ mention
    const lastSpaceIndex = textBeforeCursor.lastIndexOf(' ');
    const beforeMention = textBeforeCursor.substring(0, lastSpaceIndex + 1);

    // Insert username with @
    const newMessage = beforeMention + '@' + username + ' ' + textAfterCursor;
    setMessage(newMessage);
    setShowUsernameMenu(false);
    setHasUsernameSelection(false);
    setSelectedUsernameIndex(-1);

    // Set cursor after the inserted username
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = (beforeMention + '@' + username + ' ').length;
        textareaRef.current.selectionStart = newCursorPos;
        textareaRef.current.selectionEnd = newCursorPos;
        textareaRef.current.focus();
      }
    }, 0);
  };

  const handleSend = async () => {
    if (!message.trim() || selectedPlatforms.length === 0) return;

    try {
      shouldRefocusRef.current = true;
      await onSendMessage(message, selectedPlatforms, replyingTo?.id);
      setMessage('');
      setShowEmoteMenu(false);
      setShowEmotePickerMenu(false);
      if (onCancelReply) onCancelReply();

      // Start slow mode cooldown if the channel has slow mode enabled
      if (slowModeWaitTime && slowModeWaitTime > 0) {
        if (slowModeTimerRef.current) clearInterval(slowModeTimerRef.current);
        setSlowModeCooldown(slowModeWaitTime);
        slowModeTimerRef.current = setInterval(() => {
          setSlowModeCooldown((prev) => {
            if (prev <= 1) {
              clearInterval(slowModeTimerRef.current!);
              slowModeTimerRef.current = null;
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleToggleEmotePicker = () => {
    setShowEmotePickerMenu(!showEmotePickerMenu);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    // If username menu is open, handle username navigation
    if (showUsernameMenu) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedUsernameIndex((prev) =>
          prev < usernameResults.length - 1 ? prev + 1 : prev
        );
        setHasUsernameSelection(true);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedUsernameIndex((prev) => (prev > 0 ? prev - 1 : 0));
        setHasUsernameSelection(true);
      } else if (e.key === 'Enter') {
        if (hasUsernameSelection && selectedUsernameIndex >= 0 && usernameResults[selectedUsernameIndex]) {
          e.preventDefault();
          insertUsername(usernameResults[selectedUsernameIndex]);
        } else {
          e.preventDefault();
          setShowUsernameMenu(false);
          handleSend();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowUsernameMenu(false);
        setSelectedUsernameIndex(-1);
        setHasUsernameSelection(false);
      } else if (e.key === 'Tab') {
        if (hasUsernameSelection && selectedUsernameIndex >= 0 && usernameResults[selectedUsernameIndex]) {
          e.preventDefault();
          insertUsername(usernameResults[selectedUsernameIndex]);
        }
      }
      return;
    }

    // If emote menu is open, handle emote navigation
    if (showEmoteMenu) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedEmoteIndex((prev) =>
          prev < emoteResults.length - 1 ? prev + 1 : prev
        );
        setHasEmoteSelection(true);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedEmoteIndex((prev) => (prev > 0 ? prev - 1 : 0));
        setHasEmoteSelection(true);
      } else if (e.key === 'Enter') {
        if (!e.shiftKey && hasEmoteSelection && emoteResults[selectedEmoteIndex]) {
          e.preventDefault();
          insertEmote(emoteResults[selectedEmoteIndex].name);
        } else if (!e.shiftKey) {
          e.preventDefault();
          setShowEmoteMenu(false);
          handleSend();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowEmoteMenu(false);
        setHasEmoteSelection(false);
      } else if (e.key === 'Tab') {
        if (hasEmoteSelection && emoteResults[selectedEmoteIndex]) {
          e.preventDefault();
          insertEmote(emoteResults[selectedEmoteIndex].name);
        }
      }
      return;
    }

    // No menus open, just handle regular input
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        emoteMenuRef.current &&
        !emoteMenuRef.current.contains(event.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(event.target as Node)
      ) {
        setShowEmoteMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Refocus input after send completes
  useEffect(() => {
    if (!isLoading && shouldRefocusRef.current) {
      shouldRefocusRef.current = false;
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [isLoading]);
  // Scroll selected emote into view
  useEffect(() => {
    if (showEmoteMenu && emoteMenuRef.current) {
      const selectedElement = emoteMenuRef.current.children[selectedEmoteIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView(isMobileDevice() ? { inline: 'nearest', block: 'nearest' } : { block: 'nearest' });
      }
    }
  }, [selectedEmoteIndex, showEmoteMenu]);

  // On mobile, position autocomplete menus via a CSS variable so they float
  // above the input using position:fixed (escaping any stacking context/overlay).
  useEffect(() => {
    const menuOpen = showEmoteMenu || showUsernameMenu;
    if (!menuOpen || !textareaRef.current) {
      setMenuRect(null);
      return;
    }
    // Capture the textarea's bounding rect so the portal-rendered menu can
    // position itself relative to it. Portals render into document.body,
    // completely outside the iframe's GPU compositing layer.
    setMenuRect(textareaRef.current.getBoundingClientRect());
  }, [showEmoteMenu, showUsernameMenu]);

  // Focus textarea when replying to a message
  useEffect(() => {
    if (replyingTo && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [replyingTo]);

  return (
    <div className="message-input">
      {replyingTo && (
        <div className="reply-indicator" style={{
          padding: '8px 12px',
          background: '#0f172a',
          borderRadius: '4px',
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: '12px',
        }}>
          <div style={{ fontSize: '0.9rem', color: '#94a3b8' }}>
            <span style={{ fontWeight: 'bold' }}>Replying to @{replyingTo.author}</span>
            <span style={{ marginLeft: '8px', fontStyle: 'italic' }}>
              {replyingTo.content.substring(0, 50)}{replyingTo.content.length > 50 ? '...' : ''}
            </span>
          </div>
          {onCancelReply && (
            <button
              onClick={onCancelReply}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '0 8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Cancel reply"
            >
              <FaTimes size={16} />
            </button>
          )}
        </div>
      )}
      <div className="input-group" style={{ position: 'relative' }}>
        <button
          onClick={handleToggleEmotePicker}
          disabled={selectedPlatforms.length === 0 || isLoading}
          className="emote-picker-button"
          title="Browse emotes"
        >
          <FaSmile size={18} />
        </button>
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleMessageChange}
          onKeyDown={handleKeyPress}
          onFocus={onInputFocus}
          placeholder={placeholder}
          disabled={selectedPlatforms.length === 0 || isLoading}
          className="message-textarea twitch"
          autoComplete="off"
        />
        <button
          onClick={handleSend}
          disabled={
            !message.trim() ||
            selectedPlatforms.length === 0 ||
            isLoading ||
            slowModeCooldown > 0
          }
          className="send-button"
          title={slowModeCooldown > 0 ? `Slow mode – wait ${slowModeCooldown}s` : undefined}
        >
          {isLoading ? '...' : slowModeCooldown > 0 ? `${slowModeCooldown}s` : <FaTwitch size={16} />}
        </button>

        {showEmoteMenu && emoteResults.length > 0 && menuRect && createPortal(
          (() => {
            return isMobileDevice() ? (
              // Mobile: horizontal scrollable strip — images only
              <div
                ref={emoteMenuRef}
                className="emote-autocomplete-mobile-strip"
                style={{
                  position: 'fixed',
                  bottom: window.innerHeight - menuRect.top + 6,
                  left: 0,
                  right: 0,
                  height: '60px',
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  overflowX: 'auto',
                  overflowY: 'hidden',
                  background: '#1e293b',
                  borderTop: '1px solid #475569',
                  borderBottom: '1px solid #475569',
                  zIndex: 99999,
                  boxShadow: '0 -4px 20px rgba(0,0,0,0.6)',
                  scrollbarWidth: 'none',
                }}
              >
                {emoteResults.map((emote, index) => (
                  <div
                    key={`${emote.source}-${emote.name}`}
                    onClick={() => insertEmote(emote.name)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      padding: '4px',
                      cursor: 'pointer',
                      borderRadius: '6px',
                      border: index === selectedEmoteIndex
                        ? '1px solid #9146ff'
                        : '1px solid transparent',
                      background: index === selectedEmoteIndex ? '#334155' : 'transparent',
                      transition: 'background 0.15s',
                    }}
                    title={emote.name}
                    onTouchStart={() => setSelectedEmoteIndex(index)}
                  >
                    <img
                      src={emote.url}
                      alt={emote.name}
                      style={{ width: '40px', height: '40px', objectFit: 'contain' }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              // Desktop: vertical list with image + name + source
              <div
                ref={emoteMenuRef}
                style={{
                  position: 'fixed',
                  bottom: window.innerHeight - menuRect.top + 6,
                  left: menuRect.left,
                  width: menuRect.width,
                  maxHeight: '40vh',
                  overflowY: 'auto',
                  background: '#1e293b',
                  border: '1px solid #475569',
                  borderRadius: '8px',
                  zIndex: 99999,
                  boxShadow: '0 -4px 20px rgba(0,0,0,0.6)',
                }}
              >
                {emoteResults.map((emote, index) => (
                  <div
                    key={`${emote.source}-${emote.name}`}
                    onClick={() => insertEmote(emote.name)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      background: index === selectedEmoteIndex ? '#334155' : 'transparent',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={() => setSelectedEmoteIndex(index)}
                  >
                    <img
                      src={emote.url}
                      alt={emote.name}
                      style={{ width: '32px', height: '32px', objectFit: 'contain' }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ color: '#e2e8f0', fontWeight: '500' }}>{emote.name}</span>
                      <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{emote.source}</span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()
          ,
          document.body
        )}

        {showUsernameMenu && usernameResults.length > 0 && menuRect && createPortal(
          <div
            style={{
              position: 'fixed',
              bottom: window.innerHeight - menuRect.top + 6,
              left: menuRect.left,
              width: menuRect.width,
              maxHeight: '40vh',
              overflowY: 'auto',
              background: '#1e293b',
              border: '1px solid #475569',
              borderRadius: '8px',
              zIndex: 99999,
              boxShadow: '0 -4px 20px rgba(0,0,0,0.6)',
            }}
          >
            {usernameResults.map((username, index) => (
              <div
                key={username}
                onClick={() => insertUsername(username)}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  background: hasUsernameSelection && index === selectedUsernameIndex ? '#334155' : 'transparent',
                  transition: 'background 0.15s',
                  color: '#e2e8f0',
                  fontSize: '0.95rem',
                }}
                onMouseEnter={() => { setSelectedUsernameIndex(index); setHasUsernameSelection(true); }}
              >
                @{username}
              </div>
            ))}
          </div>,
          document.body
        )}
      </div>

      <EmoteMenu
        emotes={emotesOrganized}
        onSelectEmote={insertEmote}
        isOpen={showEmotePickerMenu}
        onClose={() => setShowEmotePickerMenu(false)}
      />

      {followerModeMinutes !== null && (
        <div className="warning" style={{ color: '#9ca3af', fontSize: '0.8rem', padding: '4px 12px', borderTop: '1px solid #1e293b' }}>
          {followerModeMinutes === 0
            ? '⚠ Follower-only chat — follow this channel to send messages'
            : followerModeMinutes < 60
            ? `⚠ Follower-only chat — you must have followed for at least ${followerModeMinutes} minute${followerModeMinutes === 1 ? '' : 's'}`
            : followerModeMinutes < 1440
            ? `⚠ Follower-only chat — you must have followed for at least ${Math.round(followerModeMinutes / 60)} hour${Math.round(followerModeMinutes / 60) === 1 ? '' : 's'}`
            : `⚠ Follower-only chat — you must have followed for at least ${Math.round(followerModeMinutes / 1440)} day${Math.round(followerModeMinutes / 1440) === 1 ? '' : 's'}`
          }
        </div>
      )}

      {selectedPlatforms.length === 0 && (
        <div className="warning">
          Select at least one platform to send messages
        </div>
      )}
    </div>
  );
}

export default memo(MessageInput);
