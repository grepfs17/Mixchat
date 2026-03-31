import React, { useState, useRef, useEffect, memo, useCallback } from 'react';
import { FaTimes, FaSmile, FaTwitch } from 'react-icons/fa';
import type { Platform, ChatMessage } from '../lib/types';
import { searchEmotes, getAllEmotesOrganized, type EmotesBySource } from '../lib/emotes';
import EmoteMenu from './EmoteMenu';

interface MessageInputProps {
  onSendMessage: (message: string, platforms: Platform[], replyToId?: string) => Promise<void>;
  isLoading: boolean;
  isConnected: { twitch: boolean };
  replyingTo?: ChatMessage;
  onCancelReply?: () => void;
  chatMessages?: ChatMessage[];
  currentUsername?: string;
}

function MessageInput({
  onSendMessage,
  isLoading,
  isConnected,
  replyingTo,
  onCancelReply,
  chatMessages = [],
  currentUsername = '',
}: MessageInputProps) {
  const [message, setMessage] = useState('');
  const [placeholder, setPlaceholder] = useState('Type your message... (Shift+Enter for new line)');
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([
    'twitch',
  ]);
  const [emoteQuery, setEmoteQuery] = useState('');
  const [emoteResults, setEmoteResults] = useState<Array<{ name: string; url: string; source: string }>>([]);
  const [selectedEmoteIndex, setSelectedEmoteIndex] = useState(-1);
  const [hasEmoteSelection, setHasEmoteSelection] = useState(false);
  const [showEmoteMenu, setShowEmoteMenu] = useState(false);
  const [showEmotePickerMenu, setShowEmotePickerMenu] = useState(false);
  const [emotesOrganized, setEmotesOrganized] = useState<EmotesBySource>({
    twitch: [],
    '7tv': [],
    bttv: [],
    ffz: [],
  });
  const [usernameQuery, setUsernameQuery] = useState('');
  const [usernameResults, setUsernameResults] = useState<string[]>([]);
  const [selectedUsernameIndex, setSelectedUsernameIndex] = useState(-1);
  const [showUsernameMenu, setShowUsernameMenu] = useState(false);
  const [hasUsernameSelection, setHasUsernameSelection] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emoteMenuRef = useRef<HTMLDivElement>(null);
  const shouldRefocusRef = useRef(false);


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
      const uniqueUsernames = new Set(chatMessages.map((msg) => msg.author));
      const matching = Array.from(uniqueUsernames)
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
        selectedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedEmoteIndex, showEmoteMenu]);

  // On mobile, position autocomplete menus via a CSS variable so they float
  // above the input using position:fixed (escaping any stacking context/overlay).
  useEffect(() => {
    const menuOpen = showEmoteMenu || showUsernameMenu;
    if (!menuOpen || !textareaRef.current) return;
    if (window.innerWidth > 768) return;
    const rect = textareaRef.current.getBoundingClientRect();
    const fromBottom = window.innerHeight - rect.top + 6;
    document.documentElement.style.setProperty('--emote-menu-bottom', fromBottom + 'px');
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
            isLoading
          }
          className="send-button"
        >
          {isLoading ? '...' : <FaTwitch size={16} />}
        </button>

        {showEmoteMenu && emoteResults.length > 0 && (
          <div
            ref={emoteMenuRef}
            className="emote-autocomplete-menu"
            style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              right: 0,
              maxHeight: '300px',
              overflowY: 'auto',
              background: '#1e293b',
              border: '1px solid #475569',
              borderRadius: '8px',
              marginBottom: '8px',
              zIndex: 1000,
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
                  style={{
                    width: '32px',
                    height: '32px',
                    objectFit: 'contain',
                  }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ color: '#e2e8f0', fontWeight: '500' }}>{emote.name}</span>
                  <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{emote.source}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {showUsernameMenu && usernameResults.length > 0 && (
          <div
            className="emote-autocomplete-menu"
            style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              right: 0,
              maxHeight: '250px',
              overflowY: 'auto',
              background: '#1e293b',
              border: '1px solid #475569',
              borderRadius: '8px',
              marginBottom: '8px',
              zIndex: 1000,
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
                onMouseEnter={() => {
                  setSelectedUsernameIndex(index);
                  setHasUsernameSelection(true);
                }}
              >
                @{username}
              </div>
            ))}
          </div>
        )}
      </div>

      <EmoteMenu
        emotes={emotesOrganized}
        onSelectEmote={insertEmote}
        isOpen={showEmotePickerMenu}
        onClose={() => setShowEmotePickerMenu(false)}
      />

      {selectedPlatforms.length === 0 && (
        <div className="warning">
          Select at least one platform to send messages
        </div>
      )}
    </div>
  );
}

export default memo(MessageInput);
