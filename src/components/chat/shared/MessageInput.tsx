import React, { useState, useRef, useEffect, memo } from "react";
import { createPortal } from "react-dom";
import { FaTimes, FaSmile, FaTwitch } from "react-icons/fa";
import type { Platform, ChatMessage } from "../../../lib/types";
import {
  searchEmotes,
  getAllEmotesOrganized,
  type EmotesBySource,
} from "../../../lib/emotes";
import { isMobileDevice } from "../../../lib/device";
import EmoteMenu from "../../EmoteMenu";
import PresetMessages from "./PresetMessages";

interface MessageInputProps {
  onSendMessage: (
    message: string,
    platforms: Platform[],
    replyToId?: string,
  ) => Promise<void>;
  isLoading: boolean;
  isConnected: { twitch: boolean };
  replyingTo?: ChatMessage;
  onCancelReply?: () => void;
  chatMessages?: ChatMessage[];
  currentUsername?: string;
  onInputFocus?: () => void;
  slowModeWaitTime?: number | null;
  followerModeMinutes?: number | null;
  isFollowing?: boolean | null;
  isModerator?: boolean;
  channelName?: string;
}

const COMMANDS = [
  {
    name: "/announce",
    description: "Highlight a message with color",
    usage: "/announce <message>",
  },
  {
    name: "/shoutout",
    description: "Promote another channel",
    usage: "/shoutout <username>",
  },
  { name: "/clear", description: "Clear the chat history", usage: "/clear" },
  {
    name: "/ban",
    description: "Permanently ban a user",
    usage: "/ban <username> [reason]",
  },
  {
    name: "/timeout",
    description: "Temporarily ban a user",
    usage: "/timeout <username> [duration] [reason]",
  },
  { name: "/unban", description: "Unban a user", usage: "/unban <username>" },
  {
    name: "/untimeout",
    description: "Remove a timeout from a user",
    usage: "/untimeout <username>",
  },
  {
    name: "/warn",
    description: "Send a formal warning to a user",
    usage: "/warn <username> <reason>",
  },
  {
    name: "/raid",
    description: "Start a raid to another channel",
    usage: "/raid <username>",
  },
  { name: "/unraid", description: "Cancel the current raid", usage: "/unraid" },
];

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
  isModerator = false,
  channelName = "",
}: MessageInputProps) {
  const [message, setMessage] = useState("");
  const [placeholder, _setPlaceholder] = useState("Type your message");
  const [selectedPlatforms, _setSelectedPlatforms] = useState<Platform[]>([
    "twitch",
  ]);
  const [_emoteQuery, setEmoteQuery] = useState("");
  const [emoteResults, setEmoteResults] = useState<
    Array<{ name: string; url: string; source: string }>
  >([]);
  const [selectedEmoteIndex, setSelectedEmoteIndex] = useState(-1);
  const [hasEmoteSelection, setHasEmoteSelection] = useState(false);
  const [showEmoteMenu, setShowEmoteMenu] = useState(false);
  const [showEmotePickerMenu, setShowEmotePickerMenu] = useState(false);
  const [emotesOrganized, setEmotesOrganized] = useState<EmotesBySource>({
    twitchGlobal: [],
    twitchChannels: [],
    "7tv": [],
    bttv: [],
    ffz: [],
  });
  const [_usernameQuery, setUsernameQuery] = useState("");
  const [usernameResults, setUsernameResults] = useState<string[]>([]);
  const [selectedUsernameIndex, setSelectedUsernameIndex] = useState(-1);
  const [showUsernameMenu, setShowUsernameMenu] = useState(false);
  const [hasUsernameSelection, setHasUsernameSelection] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emoteMenuRef = useRef<HTMLDivElement>(null);
  const shouldRefocusRef = useRef(false);
  const [slowModeCooldown, setSlowModeCooldown] = useState(0);
  const slowModeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [commandResults, setCommandResults] = useState(COMMANDS);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(-1);

  // Load organized emotes on component mount
  useEffect(() => {
    const organized = getAllEmotesOrganized();
    setEmotesOrganized(organized);

    function handleEmotesReloaded() {
      const updated = getAllEmotesOrganized();
      setEmotesOrganized(updated);
    }
    window.addEventListener("emotes-reloaded", handleEmotesReloaded);
    return () => {
      window.removeEventListener("emotes-reloaded", handleEmotesReloaded);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (slowModeTimerRef.current) clearInterval(slowModeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (showEmotePickerMenu) {
      const organized = getAllEmotesOrganized();
      setEmotesOrganized(organized);
    }
  }, [showEmotePickerMenu]);

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newMessage = e.target.value;
    setMessage(newMessage);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = newMessage.substring(0, cursorPos);
    const lastSpaceIndex = textBeforeCursor.lastIndexOf(" ");
    const currentWord = textBeforeCursor.substring(lastSpaceIndex + 1);

    // Check for @ mentions
    if (currentWord.startsWith("@") && currentWord.length > 1) {
      const query = currentWord.substring(1).toLowerCase();
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
      const matching = Array.from(authorMap.values())
        .filter(
          (name) =>
            name.toLowerCase().includes(query) &&
            name.toLowerCase() !== currentUsername.toLowerCase(),
        )
        .sort();

      if (matching.length > 0) {
        setUsernameQuery(query);
        setUsernameResults(matching);
        setSelectedUsernameIndex(-1);
        setHasUsernameSelection(false);
        setShowUsernameMenu(true);
        setShowEmoteMenu(false);
        setShowCommandMenu(false);
      } else {
        setShowUsernameMenu(false);
      }
    }
    // Check for / commands (only show for moderators / broadcaster)
    else if (currentWord.startsWith("/") && lastSpaceIndex === -1) {
      if (!isModerator) {
        setShowCommandMenu(false);
      } else {
        const query = currentWord.toLowerCase();
        const matching = COMMANDS.filter((cmd) => cmd.name.startsWith(query));
        if (matching.length > 0) {
          setCommandResults(matching);
          setShowCommandMenu(true);
          setSelectedCommandIndex(0);
          setShowEmoteMenu(false);
          setShowUsernameMenu(false);
        } else {
          setShowCommandMenu(false);
        }
      }
    }
    // Show emote autocomplete if typing a word
    else if (currentWord.length > 0 && !currentWord.startsWith("@")) {
      const results = searchEmotes(currentWord);
      if (results.length > 0) {
        setEmoteQuery(currentWord);
        setEmoteResults(results);
        setSelectedEmoteIndex(-1);
        setHasEmoteSelection(false);
        setShowEmoteMenu(true);
        setShowUsernameMenu(false);
        setShowCommandMenu(false);
      } else {
        setShowEmoteMenu(false);
        setShowUsernameMenu(false);
        setShowCommandMenu(false);
      }
    } else {
      setShowEmoteMenu(false);
      setShowUsernameMenu(false);
      setShowCommandMenu(false);
    }
  };

  const insertEmote = (emoteName: string) => {
    if (!textareaRef.current) return;
    const cursorPos = textareaRef.current.selectionStart;
    const textBeforeCursor = message.substring(0, cursorPos);
    const textAfterCursor = message.substring(cursorPos);

    if (!textBeforeCursor.trim()) {
      const newMessage = emoteName + " " + textAfterCursor;
      setMessage(newMessage);
      setShowEmoteMenu(false);
      setShowEmotePickerMenu(false);
      setHasEmoteSelection(false);
      setTimeout(() => {
        if (textareaRef.current) {
          const newCursorPos = (emoteName + " ").length;
          textareaRef.current.selectionStart = newCursorPos;
          textareaRef.current.selectionEnd = newCursorPos;
          textareaRef.current.focus();
        }
      }, 0);
      return;
    }

    const lastSpaceIndex = textBeforeCursor.lastIndexOf(" ");
    const beforeWord = textBeforeCursor.substring(0, lastSpaceIndex + 1);
    const newMessage = beforeWord + emoteName + " " + textAfterCursor;
    setMessage(newMessage);
    setShowEmoteMenu(false);
    setShowEmotePickerMenu(false);
    setHasEmoteSelection(false);
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = (beforeWord + emoteName + " ").length;
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
    const lastSpaceIndex = textBeforeCursor.lastIndexOf(" ");
    const beforeMention = textBeforeCursor.substring(0, lastSpaceIndex + 1);
    const newMessage = beforeMention + "@" + username + " " + textAfterCursor;
    setMessage(newMessage);
    setShowUsernameMenu(false);
    setHasUsernameSelection(false);
    setSelectedUsernameIndex(-1);
    setTimeout(() => {
      if (textareaRef.current) {
        const newCursorPos = (beforeMention + "@" + username + " ").length;
        textareaRef.current.selectionStart = newCursorPos;
        textareaRef.current.selectionEnd = newCursorPos;
        textareaRef.current.focus();
      }
    }, 0);
  };

  const insertCommand = (command: string) => {
    if (!textareaRef.current) return;
    const cursorPos = textareaRef.current.selectionStart;
    const textAfterCursor = message.substring(cursorPos);
    const newMessage = command + " " + textAfterCursor;
    setMessage(newMessage);
    setShowCommandMenu(false);
    setTimeout(() => {
      if (textareaRef.current) {
        const newPos = (command + " ").length;
        textareaRef.current.selectionStart = newPos;
        textareaRef.current.selectionEnd = newPos;
        textareaRef.current.focus();
      }
    }, 0);
  };

  const handleSend = async () => {
    if (!message.trim() || selectedPlatforms.length === 0) return;
    try {
      shouldRefocusRef.current = true;
      await onSendMessage(message, selectedPlatforms, replyingTo?.id);
      setMessage("");
      setShowEmoteMenu(false);
      setShowEmotePickerMenu(false);
      if (onCancelReply) onCancelReply();

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
      console.error("Failed to send message:", error);
    }
  };

  const handleToggleEmotePicker = () => {
    setShowEmotePickerMenu(!showEmotePickerMenu);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (showUsernameMenu) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedUsernameIndex((prev) =>
          prev < usernameResults.length - 1 ? prev + 1 : prev,
        );
        setHasUsernameSelection(true);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedUsernameIndex((prev) => (prev > 0 ? prev - 1 : 0));
        setHasUsernameSelection(true);
      } else if (e.key === "Enter") {
        if (
          hasUsernameSelection &&
          selectedUsernameIndex >= 0 &&
          usernameResults[selectedUsernameIndex]
        ) {
          e.preventDefault();
          insertUsername(usernameResults[selectedUsernameIndex]);
        } else {
          e.preventDefault();
          setShowUsernameMenu(false);
          handleSend();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setShowUsernameMenu(false);
        setSelectedUsernameIndex(-1);
        setHasUsernameSelection(false);
      } else if (e.key === "Tab") {
        if (
          hasUsernameSelection &&
          selectedUsernameIndex >= 0 &&
          usernameResults[selectedUsernameIndex]
        ) {
          e.preventDefault();
          insertUsername(usernameResults[selectedUsernameIndex]);
        }
      }
      return;
    }

    if (showCommandMenu) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedCommandIndex((prev) =>
          prev < commandResults.length - 1 ? prev + 1 : prev,
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedCommandIndex((prev) => (prev > 0 ? prev - 1 : 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (commandResults[selectedCommandIndex]) {
          e.preventDefault();
          insertCommand(commandResults[selectedCommandIndex].name);
        } else if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          setShowCommandMenu(false);
          handleSend();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setShowCommandMenu(false);
      }
      return;
    }

    if (showEmoteMenu) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedEmoteIndex((prev) =>
          prev < emoteResults.length - 1 ? prev + 1 : prev,
        );
        setHasEmoteSelection(true);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedEmoteIndex((prev) => (prev > 0 ? prev - 1 : 0));
        setHasEmoteSelection(true);
      } else if (e.key === "Enter") {
        if (
          !e.shiftKey &&
          hasEmoteSelection &&
          emoteResults[selectedEmoteIndex]
        ) {
          e.preventDefault();
          insertEmote(emoteResults[selectedEmoteIndex].name);
        } else if (!e.shiftKey) {
          e.preventDefault();
          setShowEmoteMenu(false);
          handleSend();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        setShowEmoteMenu(false);
        setHasEmoteSelection(false);
      } else if (e.key === "Tab") {
        if (hasEmoteSelection && emoteResults[selectedEmoteIndex]) {
          e.preventDefault();
          insertEmote(emoteResults[selectedEmoteIndex].name);
        }
      }
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    if (!isModerator) setShowCommandMenu(false);
    const handleClickOutside = (event: MouseEvent) => {
      if (
        emoteMenuRef.current &&
        !emoteMenuRef.current.contains(event.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(event.target as Node)
      ) {
        setShowEmoteMenu(false);
        setShowUsernameMenu(false);
        setShowCommandMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isLoading && shouldRefocusRef.current) {
      shouldRefocusRef.current = false;
      const timer = setTimeout(() => textareaRef.current?.focus(), 0);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  useEffect(() => {
    if (showEmoteMenu && emoteMenuRef.current) {
      const selectedElement = emoteMenuRef.current.children[
        selectedEmoteIndex
      ] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView(
          isMobileDevice()
            ? { inline: "nearest", block: "nearest" }
            : { block: "nearest" },
        );
      }
    }
  }, [selectedEmoteIndex, showEmoteMenu]);

  useEffect(() => {
    const menuOpen = showEmoteMenu || showUsernameMenu || showCommandMenu;
    if (!menuOpen || !textareaRef.current) {
      setMenuRect(null);
      return;
    }
    setMenuRect(textareaRef.current.getBoundingClientRect());
  }, [showEmoteMenu, showUsernameMenu, showCommandMenu]);

  useEffect(() => {
    if (replyingTo && textareaRef.current) {
      textareaRef.current.focus();
    }
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
      <div className="input-group" style={{ position: "relative" }}>
        <button
          onClick={handleToggleEmotePicker}
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
          placeholder={placeholder}
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

        {showEmoteMenu &&
          emoteResults.length > 0 &&
          menuRect &&
          createPortal(
            isMobileDevice() ? (
              <div
                ref={emoteMenuRef}
                className="emote-autocomplete-mobile-strip"
                style={{
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
                  borderBottom: "1px solid var(--color-autocomplete-border)",
                  zIndex: 99999,
                  boxShadow: "var(--shadow-lg)",
                  scrollbarWidth: "none",
                }}
              >
                {emoteResults.map((emote, index) => (
                  <div
                    key={`${emote.source}-${emote.name}`}
                    onClick={() => insertEmote(emote.name)}
                    className={`autocomplete-item${index === selectedEmoteIndex ? " selected" : ""}`}
                    style={{
                      flexShrink: 0,
                      borderRadius: "6px",
                      border:
                        index === selectedEmoteIndex
                          ? "1px solid var(--color-accent)"
                          : "1px solid transparent",
                      padding: "4px",
                    }}
                    title={emote.name}
                    onTouchStart={() => setSelectedEmoteIndex(index)}
                  >
                    <img
                      src={emote.url}
                      alt={emote.name}
                      style={{ width: "40px", height: "40px" }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div
                ref={emoteMenuRef}
                className="autocomplete-menu"
                style={{
                  position: "fixed",
                  bottom: window.innerHeight - menuRect.top + 6,
                  left: menuRect.left,
                  width: menuRect.width,
                  maxHeight: "40vh",
                }}
              >
                {emoteResults.map((emote, index) => (
                  <div
                    key={`${emote.source}-${emote.name}`}
                    onClick={() => insertEmote(emote.name)}
                    className={`autocomplete-item${index === selectedEmoteIndex ? " selected" : ""}`}
                    onMouseEnter={() => setSelectedEmoteIndex(index)}
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
                ))}
              </div>
            ),
            document.body,
          )}

        {showUsernameMenu &&
          usernameResults.length > 0 &&
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
              {usernameResults.map((username, index) => (
                <div
                  key={username}
                  onClick={() => insertUsername(username)}
                  className={`autocomplete-item${hasUsernameSelection && index === selectedUsernameIndex ? " selected" : ""}`}
                  style={{ fontSize: "0.95rem" }}
                  onMouseEnter={() => {
                    setSelectedUsernameIndex(index);
                    setHasUsernameSelection(true);
                  }}
                >
                  @{username}
                </div>
              ))}
            </div>,
            document.body,
          )}

        {showCommandMenu &&
          commandResults.length > 0 &&
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
              {commandResults.map((cmd, index) => (
                <div
                  key={cmd.name}
                  onClick={() => insertCommand(cmd.name)}
                  className={`autocomplete-command-item${index === selectedCommandIndex ? " selected" : ""}`}
                  onMouseEnter={() => setSelectedCommandIndex(index)}
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
        isOpen={showEmotePickerMenu}
        onClose={() => setShowEmotePickerMenu(false)}
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
