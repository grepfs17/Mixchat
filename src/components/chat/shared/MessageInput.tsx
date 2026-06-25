import React, { useState, useRef, useEffect, memo, useCallback } from "react";
import { createPortal } from "react-dom";
import { FaTimes, FaSmile, FaTwitch } from "react-icons/fa";
import type { Platform, TwitchMessage } from "../../../lib/types";
import { searchEmotes } from "../../../lib/emotes";
import { isMobileDevice } from "../../../lib/device";
import { useModerationContext } from "../../../contexts/ModerationContext";
import { MOD_COMMANDS } from "../../../lib/constants";
import EmoteMenu from "../../EmoteMenu";
import PresetMessages from "./PresetMessages";
import { useAutocomplete } from "../../../hooks/chat/useAutocomplete";
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
  const emoteMenuRef = useRef<HTMLDivElement>(null);
  const shouldRefocusRef = useRef(false);
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
  const [showEmotePicker, setShowEmotePicker] = useState(false);

  const emotesOrganized = useEmotes();
  const { cooldown: slowModeCooldown, startCooldown } = useSlowMode();

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
      shouldRefocusRef.current = true;
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
  const insertEmote = useCallback(
    (name: string) => {
      if (!textareaRef.current) return;
      const cursorPos = textareaRef.current.selectionStart;
      const textBeforeCursor = message.substring(0, cursorPos);
      const textAfterCursor = message.substring(cursorPos);
      const lastSpaceIndex = textBeforeCursor.lastIndexOf(" ");
      const beforeWord = textBeforeCursor.substring(0, lastSpaceIndex + 1);
      const newMessage = beforeWord + name + " " + textAfterCursor;
      setMessage(newMessage);
      setShowEmotePicker(false);
      const newPos = (beforeWord + name + " ").length;
      setTimeout(() => {
        textareaRef.current?.setSelectionRange(newPos, newPos);
        textareaRef.current?.focus();
      }, 0);
    },
    [message],
  );

  const emoteAC = useAutocomplete<{
    name: string;
    url: string;
    source: string;
  }>({
    onSelect: (emote) => insertEmote(emote.name),
    onSend: handleSend,
  });

  const usernameAC = useAutocomplete<string>({
    onSelect: (username) => {
      if (!textareaRef.current) return;
      const cursorPos = textareaRef.current.selectionStart;
      const textBeforeCursor = message.substring(0, cursorPos);
      const textAfterCursor = message.substring(cursorPos);
      const lastSpaceIndex = textBeforeCursor.lastIndexOf(" ");
      const beforeMention = textBeforeCursor.substring(0, lastSpaceIndex + 1);
      const newMessage = beforeMention + "@" + username + " " + textAfterCursor;
      setMessage(newMessage);
      const newPos = (beforeMention + "@" + username + " ").length;
      setTimeout(() => {
        textareaRef.current?.setSelectionRange(newPos, newPos);
        textareaRef.current?.focus();
      }, 0);
    },
    onSend: handleSend,
  });

  const commandAC = useAutocomplete<{
    name: string;
    usage: string;
    description: string;
  }>({
    onSelect: (cmd) => {
      if (!textareaRef.current) return;
      const cursorPos = textareaRef.current.selectionStart;
      const textAfterCursor = message.substring(cursorPos);
      const newMessage = cmd.name + " " + textAfterCursor;
      setMessage(newMessage);
      const newPos = (cmd.name + " ").length;
      setTimeout(() => {
        textareaRef.current?.setSelectionRange(newPos, newPos);
        textareaRef.current?.focus();
      }, 0);
    },
    onSend: handleSend,
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

      const closeAll = () => {
        emoteAC.hide();
        usernameAC.hide();
        commandAC.hide();
      };

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
    [allAuthors, currentUsername, isModerator, emoteAC, usernameAC, commandAC],
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

  useEffect(() => {
    const anyOpen = emoteAC.isOpen || usernameAC.isOpen || commandAC.isOpen;
    if (!anyOpen || !textareaRef.current) {
      setMenuRect(null);
      return;
    }
    setMenuRect(textareaRef.current.getBoundingClientRect());
  }, [emoteAC.isOpen, usernameAC.isOpen, commandAC.isOpen]);

  useEffect(() => {
    if (emoteAC.isOpen && emoteMenuRef.current && emoteAC.selectedIndex >= 0) {
      const el = emoteMenuRef.current.children[
        emoteAC.selectedIndex
      ] as HTMLElement;
      el?.scrollIntoView(
        isMobileDevice()
          ? { inline: "nearest", block: "nearest" }
          : { block: "nearest" },
      );
    }
  }, [emoteAC.selectedIndex, emoteAC.isOpen]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        emoteMenuRef.current &&
        !emoteMenuRef.current.contains(target) &&
        textareaRef.current &&
        !textareaRef.current.contains(target)
      ) {
        emoteAC.hide();
        usernameAC.hide();
        commandAC.hide();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [emoteAC, usernameAC, commandAC]);

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
      <div className="input-group" style={{ position: "relative" }}>
        <button
          onClick={() => setShowEmotePicker(!showEmotePicker)}
          disabled={selectedPlatforms.length === 0 || isLoading}
          className="emote-picker-button"
          title="Browse emotes"
        >
          <FaSmile size={18} />
        </button>
        <PresetMessages
          onSendMessage={onSendMessage}
          isLoading={isLoading}
          selectedPlatforms={selectedPlatforms}
          replyingTo={replyingTo}
          onCancelReply={onCancelReply}
        />
        <textarea
          ref={textareaRef}
          value={message}
          onChange={handleMessageChange}
          onKeyDown={handleKeyPress}
          onFocus={onInputFocus}
          placeholder="Type your message"
          disabled={selectedPlatforms.length === 0 || isLoading}
          className="message-textarea twitch"
          autoComplete="off"
          autoCapitalize="off"
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
          title={
            slowModeCooldown > 0
              ? `Slow mode, wait ${slowModeCooldown}s`
              : undefined
          }
        >
          {isLoading ? (
            "..."
          ) : slowModeCooldown > 0 ? (
            `${slowModeCooldown}s`
          ) : (
            <FaTwitch size={16} />
          )}
        </button>

        {emoteAC.isOpen &&
          emoteAC.results.length > 0 &&
          menuRect &&
          createPortal(
            <div
              ref={emoteMenuRef}
              className={
                isMobileDevice()
                  ? "emote-autocomplete-mobile-strip"
                  : "autocomplete-menu"
              }
              style={
                isMobileDevice()
                  ? {
                      position: "fixed",
                      bottom: window.innerHeight - menuRect.top + 6,
                      left: 0,
                      right: 0,
                      height: "60px",
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      gap: "4px",
                      padding: "4px 8px",
                      overflowX: "auto",
                      overflowY: "hidden",
                      background: "var(--color-autocomplete-bg)",
                      borderTop: "1px solid var(--color-autocomplete-border)",
                      borderBottom:
                        "1px solid var(--color-autocomplete-border)",
                      zIndex: 99999,
                      boxShadow: "var(--shadow-lg)",
                      scrollbarWidth: "none",
                    }
                  : {
                      position: "fixed",
                      bottom: window.innerHeight - menuRect.top + 6,
                      left: menuRect.left,
                      width: menuRect.width,
                      maxHeight: "40vh",
                    }
              }
            >
              {emoteAC.results.map((emote, index) =>
                isMobileDevice() ? (
                  <div
                    key={`${emote.source}-${emote.name}`}
                    onClick={() => emoteAC.select(index)}
                    className={`autocomplete-item${index === emoteAC.selectedIndex ? " selected" : ""}`}
                    style={{
                      flexShrink: 0,
                      borderRadius: "6px",
                      border:
                        index === emoteAC.selectedIndex
                          ? "1px solid var(--color-accent)"
                          : "1px solid transparent",
                      padding: "4px",
                    }}
                    title={emote.name}
                    onTouchStart={() => emoteAC.setSelectedIndex(index)}
                  >
                    <img
                      src={emote.url}
                      alt={emote.name}
                      style={{ width: "40px", height: "40px" }}
                    />
                  </div>
                ) : (
                  <div
                    key={`${emote.source}-${emote.name}`}
                    onClick={() => emoteAC.select(index)}
                    className={`autocomplete-item${index === emoteAC.selectedIndex ? " selected" : ""}`}
                    onMouseEnter={() => emoteAC.setSelectedIndex(index)}
                  >
                    <img
                      src={emote.url}
                      alt={emote.name}
                      style={{ width: "32px", height: "32px" }}
                    />
                    <div className="autocomplete-item-info">
                      <span className="autocomplete-item-name">
                        {emote.name}
                      </span>
                      <span className="autocomplete-item-type">
                        {emote.source}
                      </span>
                    </div>
                  </div>
                ),
              )}
            </div>,
            document.body,
          )}

        {usernameAC.isOpen &&
          usernameAC.results.length > 0 &&
          menuRect &&
          createPortal(
            <div
              className="autocomplete-menu"
              style={{
                position: "fixed",
                bottom: window.innerHeight - menuRect.top + 6,
                left: menuRect.left,
                width: menuRect.width,
                maxHeight: "40vh",
              }}
            >
              {usernameAC.results.map((username, index) => (
                <div
                  key={username}
                  onClick={() => usernameAC.select(index)}
                  className={`autocomplete-item${index === usernameAC.selectedIndex ? " selected" : ""}`}
                  style={{ fontSize: "0.95rem" }}
                  onMouseEnter={() => usernameAC.setSelectedIndex(index)}
                >
                  @{username}
                </div>
              ))}
            </div>,
            document.body,
          )}

        {commandAC.isOpen &&
          commandAC.results.length > 0 &&
          menuRect &&
          createPortal(
            <div
              className="autocomplete-menu"
              style={{
                position: "fixed",
                bottom: window.innerHeight - menuRect.top + 6,
                left: menuRect.left,
                width: menuRect.width,
                maxHeight: "40vh",
              }}
            >
              {commandAC.results.map((cmd, index) => (
                <div
                  key={cmd.name}
                  onClick={() => commandAC.select(index)}
                  className={`autocomplete-command-item${index === commandAC.selectedIndex ? " selected" : ""}`}
                  onMouseEnter={() => commandAC.setSelectedIndex(index)}
                >
                  <div className="autocomplete-command-header">
                    <span className="autocomplete-command-name">
                      {cmd.name}
                    </span>
                    <span className="autocomplete-command-usage">
                      {cmd.usage}
                    </span>
                  </div>
                  <div className="autocomplete-command-desc">
                    {cmd.description}
                  </div>
                </div>
              ))}
            </div>,
            document.body,
          )}
      </div>

      <EmoteMenu
        emotes={emotesOrganized}
        onSelectEmote={insertEmote}
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
