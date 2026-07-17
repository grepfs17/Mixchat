import React, { useState, useRef, useEffect, memo, useCallback } from "react";
import { createPortal } from "react-dom";
import { FaTimes, FaSmile } from "react-icons/fa";
import type { Platform, TwitchMessage } from "../../../lib/types";
import { searchEmotes } from "../../../lib/emotes";
import { useModerationContext } from "../../../contexts/ModerationContext";
import { isMobileDevice } from "../../../lib/device";
import { MOD_COMMANDS } from "../../../lib/constants";
import EmoteMenu from "../../EmoteMenu";
import PresetMessages from "./PresetMessages";
import AutocompleteMenu, { MenuItem } from "./AutocompleteMenu";
import { useAutocomplete } from "../../../hooks/chat/useAutocomplete";
import { useAutocompleteMenu } from "../../../hooks/chat/useAutocompleteMenu";
import { useInsertAtCursor } from "../../../hooks/chat/useInsertAtCursor";
import { useSlowMode } from "../../../hooks/chat/useSlowMode";
import { useEmotes } from "../../../hooks/chat/useEmotes";

interface MessageInputProps {
  onSendMessage: (
    message: string,
    platforms: Platform[],
    replyToId?: string,
  ) => Promise<void>;
  isLoading: boolean;
  isConnected: { twitch: boolean };
  replyingTo?: TwitchMessage;
  onCancelReply?: () => void;
  chatMessages?: TwitchMessage[];
  currentUsername?: string;
  onInputFocus?: () => void;
  slowModeWaitTime?: number | null;
  followerModeMinutes?: number | null;
  isFollowing?: boolean | null;
  channelName?: string;
}

function MessageInput({
  onSendMessage,
  isLoading,
  isConnected: _isConnected,
  replyingTo,
  onCancelReply,
  chatMessages = [],
  currentUsername = "",
  onInputFocus,
  slowModeWaitTime = null,
  followerModeMinutes = null,
  isFollowing = null,
  channelName = "",
}: MessageInputProps) {
  const { isModerator } = useModerationContext();
  const [message, setMessage] = useState("");
  const selectedPlatforms: Platform[] = ["twitch"];
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const shouldRefocusRef = useRef(false);
  const [showEmotePicker, setShowEmotePicker] = useState(false);

  const emotesOrganized = useEmotes();
  const { cooldown: slowModeCooldown, startCooldown } = useSlowMode();

  // --- Insert at cursor helper ---
  const { insertWithPrefix, replaceCurrentWord } = useInsertAtCursor({
    message,
    setMessage,
    inputRef: textareaRef,
  });

  // --- Authors for @mention ---
  const allAuthors = (() => {
    const authorMap = new Map<string, string>();
    chatMessages.forEach((msg) => {
      const lower = msg.author.toLowerCase();
      const existing = authorMap.get(lower);
      if (
        !existing ||
        (existing === existing.toLowerCase() &&
          msg.author !== msg.author.toLowerCase())
      ) {
        authorMap.set(lower, msg.author);
      }
    });
    return Array.from(authorMap.values());
  })();

  // --- Shared send ---
  const handleSend = useCallback(async () => {
    if (!message.trim() || selectedPlatforms.length === 0) return;
    try {
      if (!isMobileDevice()) shouldRefocusRef.current = true;
      await onSendMessage(message, selectedPlatforms, replyingTo?.id);
      setMessage("");
      emoteAC.hide();
      usernameAC.hide();
      commandAC.hide();
      setShowEmotePicker(false);
      if (onCancelReply) onCancelReply();
      if (slowModeWaitTime && slowModeWaitTime > 0)
        startCooldown(slowModeWaitTime);
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  }, [
    message,
    slowModeWaitTime,
    onSendMessage,
    replyingTo,
    onCancelReply,
    startCooldown,
  ]);

  // --- Autocomplete instances ---
  const emoteAC = useAutocomplete<{
    name: string;
    url: string;
    source: string;
  }>({
    onSelect: (emote) => {
      insertWithPrefix(emote.name);
      setShowEmotePicker(false);
    },
    onSend: handleSend,
  });

  const usernameAC = useAutocomplete<string>({
    onSelect: (username) => {
      insertWithPrefix(username, "@");
    },
    onSend: handleSend,
  });

  const commandAC = useAutocomplete<{
    name: string;
    usage: string;
    description: string;
  }>({
    onSelect: (cmd) => {
      replaceCurrentWord(cmd.name);
    },
    onSend: handleSend,
  });

  // --- Autocomplete menu management ---
  const { menuRect, menuRef, closeAll } = useAutocompleteMenu({
    inputRef: textareaRef,
    autocompleteInstances: [emoteAC, usernameAC, commandAC],
  });

  // --- Text change handler ---
  const handleMessageChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newMessage = e.target.value;
      setMessage(newMessage);
      const cursorPos = e.target.selectionStart;
      const textBeforeCursor = newMessage.substring(0, cursorPos);
      const lastSpaceIndex = textBeforeCursor.lastIndexOf(" ");
      const currentWord = textBeforeCursor.substring(lastSpaceIndex + 1);

      // @mention
      if (currentWord.startsWith("@") && currentWord.length > 1) {
        const query = currentWord.substring(1).toLowerCase();
        const matching = allAuthors
          .filter(
            (name) =>
              name.toLowerCase().includes(query) &&
              name.toLowerCase() !== currentUsername.toLowerCase(),
          )
          .sort();
        if (matching.length > 0) {
          closeAll();
          usernameAC.show(matching);
          return;
        }
      }

      // Slash commands
      if (isModerator && currentWord.startsWith("/") && lastSpaceIndex === -1) {
        const matching = MOD_COMMANDS.filter((cmd) =>
          cmd.name.startsWith(currentWord.toLowerCase()),
        );
        if (matching.length > 0) {
          closeAll();
          commandAC.show(matching);
          return;
        }
      }

      // Twitch emotes
      if (
        currentWord.length > 0 &&
        !currentWord.startsWith("@") &&
        !currentWord.startsWith("/")
      ) {
        const results = searchEmotes(currentWord);
        if (results.length > 0) {
          closeAll();
          emoteAC.show(results);
          return;
        }
      }

      closeAll();
    },
    [
      allAuthors,
      currentUsername,
      isModerator,
      emoteAC,
      usernameAC,
      commandAC,
      closeAll,
    ],
  );

  // --- Keyboard handler ---
  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (usernameAC.isOpen) {
        usernameAC.handleKeyDown(e);
        return;
      }
      if (commandAC.isOpen) {
        commandAC.handleKeyDown(e);
        return;
      }
      if (emoteAC.isOpen) {
        emoteAC.handleKeyDown(e);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [usernameAC, commandAC, emoteAC, handleSend],
  );

  // --- Effects ---
  useEffect(() => {
    return () => {
      if (shouldRefocusRef.current) textareaRef.current?.focus();
    };
  }, [isLoading]);

  useEffect(() => {
    if (!isLoading && shouldRefocusRef.current) {
      shouldRefocusRef.current = false;
      const timer = setTimeout(() => textareaRef.current?.focus(), 0);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  useEffect(() => {
    if (replyingTo && textareaRef.current) textareaRef.current.focus();
  }, [replyingTo]);

  return (
    <div className="message-input">
      {replyingTo && (
        <div
          className="reply-indicator"
          style={{
            padding: "8px 12px",
            background: "#0f172a",
            borderRadius: "4px",
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div style={{ fontSize: "0.9rem", color: "#94a3b8" }}>
            <span style={{ fontWeight: "bold" }}>
              Replying to @{replyingTo.author}
            </span>
            <span style={{ marginLeft: "8px", fontStyle: "italic" }}>
              {replyingTo.content.substring(0, 50)}
              {replyingTo.content.length > 50 ? "..." : ""}
            </span>
          </div>
          {onCancelReply && (
            <button
              onClick={onCancelReply}
              style={{
                background: "transparent",
                border: "none",
                color: "#94a3b8",
                cursor: "pointer",
                padding: "0 8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              title="Cancel reply"
            >
              <FaTimes size={16} />
            </button>
          )}
        </div>
      )}
      <div className="input-group twitch" style={{ position: "relative" }}>
        <PresetMessages
          onSendMessage={onSendMessage}
          isLoading={isLoading}
          selectedPlatforms={selectedPlatforms}
          replyingTo={replyingTo}
          onCancelReply={onCancelReply}
        />
        <button
          onClick={() => setShowEmotePicker(!showEmotePicker)}
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
          placeholder="Send to Twitch..."
          disabled={selectedPlatforms.length === 0 || isLoading}
          className="message-textarea"
          autoComplete="off"
          autoCapitalize="off"
        />

        <AutocompleteMenu
          isOpen={emoteAC.isOpen}
          results={emoteAC.results}
          selectedIndex={emoteAC.selectedIndex}
          menuRect={menuRect}
          menuRef={menuRef}
          onSelect={(i) => emoteAC.select(i)}
          onMouseEnter={(i) => emoteAC.setSelectedIndex(i)}
          renderItem={(emote, index, isSelected) => (
            <MenuItem
              key={`${emote.source}-${emote.name}`}
              index={index}
              isSelected={isSelected}
              onSelect={(i) => emoteAC.select(i)}
              onMouseEnter={(i) => emoteAC.setSelectedIndex(i)}
              title={emote.name}
            >
              <img
                src={emote.url}
                alt={emote.name}
                style={{ width: 32, height: 32 }}
              />
              <div className="autocomplete-item-info">
                <span className="autocomplete-item-name">{emote.name}</span>
                <span className="autocomplete-item-type">{emote.source}</span>
              </div>
            </MenuItem>
          )}
        />

        <AutocompleteMenu
          isOpen={usernameAC.isOpen}
          results={usernameAC.results}
          selectedIndex={usernameAC.selectedIndex}
          menuRect={menuRect}
          onSelect={(i) => usernameAC.select(i)}
          onMouseEnter={(i) => usernameAC.setSelectedIndex(i)}
          renderItem={(username, index, isSelected) => (
            <MenuItem
              key={username}
              index={index}
              isSelected={isSelected}
              onSelect={(i) => usernameAC.select(i)}
              onMouseEnter={(i) => usernameAC.setSelectedIndex(i)}
              style={{ fontSize: "0.95rem" }}
            >
              @{username}
            </MenuItem>
          )}
        />

        <AutocompleteMenu
          isOpen={commandAC.isOpen}
          results={commandAC.results}
          selectedIndex={commandAC.selectedIndex}
          menuRect={menuRect}
          onSelect={(i) => commandAC.select(i)}
          onMouseEnter={(i) => commandAC.setSelectedIndex(i)}
          renderItem={(cmd, index, isSelected) => (
            <MenuItem
              key={cmd.name}
              index={index}
              isSelected={isSelected}
              onSelect={(i) => commandAC.select(i)}
              onMouseEnter={(i) => commandAC.setSelectedIndex(i)}
              className="autocomplete-command-item"
            >
              <div className="autocomplete-command-header">
                <span className="autocomplete-command-name">{cmd.name}</span>
                <span className="autocomplete-command-usage">{cmd.usage}</span>
              </div>
              <div className="autocomplete-command-desc">{cmd.description}</div>
            </MenuItem>
          )}
        />
      </div>

      <EmoteMenu
        emotes={emotesOrganized}
        onSelectEmote={(name) => {
          insertWithPrefix(name);
          setShowEmotePicker(false);
        }}
        isOpen={showEmotePicker}
        onClose={() => setShowEmotePicker(false)}
      />

      {followerModeMinutes !== null &&
        isFollowing === false &&
        !(
          channelName &&
          currentUsername.toLowerCase() === channelName.toLowerCase()
        ) && (
          <div
            className="warning"
            style={{
              color: "#9ca3af",
              fontSize: "0.8rem",
              padding: "4px 12px",
              borderTop: "1px solid #1e293b",
            }}
          >
            {followerModeMinutes === 0
              ? "⚠ Follower-only chat — follow this channel to send messages"
              : followerModeMinutes < 60
                ? `⚠ Follower-only chat — you must have followed for at least ${followerModeMinutes} minute${followerModeMinutes === 1 ? "" : "s"}`
                : followerModeMinutes < 1440
                  ? `⚠ Follower-only chat — you must have followed for at least ${Math.round(followerModeMinutes / 60)} hour${Math.round(followerModeMinutes / 60) === 1 ? "" : "s"}`
                  : `⚠ Follower-only chat — you must have followed for at least ${Math.round(followerModeMinutes / 1440)} day${Math.round(followerModeMinutes / 1440) === 1 ? "" : "s"}`}
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
