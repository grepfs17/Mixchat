import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { createPortal } from "react-dom";
import {
  FaTimes,
  FaSmile,
  FaRegSmile,
  FaTwitch,
  FaYoutube,
} from "react-icons/fa";
import { BsFillPeopleFill } from "react-icons/bs";
import type { Platform, TwitchMessage } from "../../../lib/types";
import { searchEmotes } from "../../../lib/emotes";
import {
  searchEmojis,
  EMOJI_LIST,
  type EmojiEntry,
} from "../../../lib/emojiShortcodes";
import { isMobileDevice } from "../../../lib/device";
import { useModerationContext } from "../../../contexts/ModerationContext";
import { MOD_COMMANDS } from "../../../lib/constants";
import EmoteMenu from "../../EmoteMenu";
import PresetMessages from "./PresetMessages";
import { useAutocomplete } from "../../../hooks/chat/useAutocomplete";
import { useSlowMode } from "../../../hooks/chat/useSlowMode";
import { useEmotes } from "../../../hooks/chat/useEmotes";
import "../../../styles/chat/MessageInput.css";

interface YTMessage {
  id: string;
  author: string;
  parts: any[];
  timestamp: Date;
  authorChannelId?: string;
  optimistic?: boolean;
}

type SendTarget = "twitch" | "youtube" | "both";

interface UnifiedInputProps {
  onSendMessage: (
    message: string,
    platforms: Platform[],
    replyToId?: string,
  ) => Promise<void>;
  isLoading: boolean;
  replyingTo?: TwitchMessage;
  onCancelReply?: () => void;
  chatMessages?: TwitchMessage[];
  currentUsername?: string;
  onInputFocus?: () => void;
  slowModeWaitTime?: number | null;
  followerModeMinutes?: number | null;
  isFollowing?: boolean | null;
  channelName?: string;
  youtubeVideoId?: string | null;
  ytChatMessages?: YTMessage[];
  onSendYoutube?: (message: string) => Promise<void>;
  onOptimisticYoutube?: (id: string, text: string) => void;
  onOptimisticYoutubeFailed?: (id: string) => void;
  youtubeAvailable?: boolean;
}

export default function UnifiedInput({
  onSendMessage,
  isLoading,
  replyingTo,
  onCancelReply,
  chatMessages = [],
  currentUsername = "",
  onInputFocus,
  slowModeWaitTime = null,
  followerModeMinutes = null,
  isFollowing = null,
  channelName = "",
  youtubeVideoId = null,
  ytChatMessages = [],
  onSendYoutube,
  onOptimisticYoutube,
  onOptimisticYoutubeFailed,
  youtubeAvailable = false,
}: UnifiedInputProps) {
  const { isModerator } = useModerationContext();
  const [sendTarget, setSendTarget] = useState<SendTarget>("twitch");
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const shouldRefocusRef = useRef(false);
  const emotesOrganized = useEmotes();
  const { cooldown: slowModeCooldown, startCooldown } = useSlowMode();

  // Colon position for YouTube emoji autocomplete
  const colonPosRef = useRef(-1);

  // Emote picker (Twitch full grid)
  const [showEmotePicker, setShowEmotePicker] = useState(false);

  // YouTube emoji picker (full grid)
  const [showYtPicker, setShowYtPicker] = useState(false);
  const [ytPickerSearch, setYtPickerSearch] = useState("");
  const [ytPickerRect, setYtPickerRect] = useState<DOMRect | null>(null);
  const ytPickerRef = useRef<HTMLDivElement>(null);
  const ytPickerBtnRef = useRef<HTMLButtonElement>(null);
  const ytPickerSearchRef = useRef<HTMLInputElement>(null);

  // Menu rect for portal positioning
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
  const emoteMenuRef = useRef<HTMLDivElement>(null);
  const emojiMenuRef = useRef<HTMLDivElement>(null);

  // --- Authors for @mention ---
  const allAuthors = useMemo(() => {
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
    ytChatMessages.forEach((m) => {
      if (m.author) {
        const lower = m.author.toLowerCase();
        if (!authorMap.has(lower)) authorMap.set(lower, m.author);
      }
    });
    return Array.from(authorMap.values());
  }, [chatMessages, ytChatMessages]);

  // --- Shared send ---
  const doSend = useCallback(async () => {
    const text = message.trim();
    if (!text) return;
    if (
      (sendTarget === "twitch" || sendTarget === "both") &&
      slowModeCooldown <= 0
    ) {
      try {
        shouldRefocusRef.current = true;
        await onSendMessage(text, ["twitch"], replyingTo?.id);
      } catch (err) {
        console.error("Twitch send failed:", err);
      }
    }
    if (
      (sendTarget === "youtube" || sendTarget === "both") &&
      youtubeAvailable &&
      onSendYoutube &&
      youtubeVideoId
    ) {
      const optimisticId = `optimistic_yt_${Date.now()}_${Math.random()}`;
      onOptimisticYoutube?.(optimisticId, text);
      try {
        const res = await fetch("/api/youtube-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoId: youtubeVideoId, message: text }),
        });
        if (!res.ok) {
          const data = await res.json();
          onOptimisticYoutubeFailed?.(optimisticId);
          throw new Error(data.error || "Failed");
        }
      } catch (err) {
        onOptimisticYoutubeFailed?.(optimisticId);
        console.error("YouTube send failed:", err);
      }
    }
    setMessage("");
    emoteAutocomplete.hide();
    emojiAutocomplete.hide();
    setShowEmotePicker(false);
    setShowYtPicker(false);
    if (onCancelReply) onCancelReply();
    if (
      (sendTarget === "twitch" || sendTarget === "both") &&
      slowModeWaitTime &&
      slowModeWaitTime > 0
    ) {
      startCooldown(slowModeWaitTime);
    }
  }, [
    message,
    sendTarget,
    slowModeCooldown,
    slowModeWaitTime,
    youtubeAvailable,
    onSendYoutube,
    youtubeVideoId,
    onOptimisticYoutube,
    onOptimisticYoutubeFailed,
    onCancelReply,
    replyingTo,
    startCooldown,
    onSendMessage,
  ]);

  // --- Insert at cursor helper ---
  const insertAtCursor = useCallback(
    (before: string, after: string = " ") => {
      if (!inputRef.current) return;
      const cursor = inputRef.current.selectionStart ?? message.length;
      const textBefore = message.substring(0, cursor);
      const textAfter = message.substring(cursor);
      const newVal = textBefore + before + after + textAfter;
      setMessage(newVal);
      const newPos = (textBefore + before + after).length;
      setTimeout(() => {
        inputRef.current?.setSelectionRange(newPos, newPos);
        inputRef.current?.focus();
      }, 0);
    },
    [message],
  );

  // --- Autocomplete instances ---
  const emoteAutocomplete = useAutocomplete<{
    name: string;
    url: string;
    source: string;
  }>({
    onSelect: (emote) => {
      insertAtCursor(emote.name);
      setShowEmotePicker(false);
    },
    onSend: doSend,
  });

  const emojiAutocomplete = useAutocomplete<EmojiEntry>({
    onSelect: (entry) => {
      if (!inputRef.current || colonPosRef.current === -1) return;
      const before = message.substring(0, colonPosRef.current);
      const cursor = inputRef.current.selectionStart ?? message.length;
      const after = message.substring(cursor);
      const newVal = before + entry.char + " " + after;
      setMessage(newVal);
      colonPosRef.current = -1;
      const pos = (before + entry.char + " ").length;
      setTimeout(() => {
        inputRef.current?.setSelectionRange(pos, pos);
        inputRef.current?.focus();
      }, 0);
    },
    onSend: doSend,
  });

  const usernameAutocomplete = useAutocomplete<string>({
    onSelect: (username) => {
      if (!inputRef.current) return;
      const cursor = inputRef.current.selectionStart ?? message.length;
      const before = message.substring(0, cursor);
      const after = message.substring(cursor);
      const lastSpace = before.lastIndexOf(" ");
      const prefix = before.substring(0, lastSpace + 1);
      const newVal = prefix + "@" + username + " " + after;
      setMessage(newVal);
      const pos = (prefix + "@" + username + " ").length;
      setTimeout(() => {
        inputRef.current?.setSelectionRange(pos, pos);
        inputRef.current?.focus();
      }, 0);
    },
    onSend: doSend,
  });

  const commandAutocomplete = useAutocomplete<{
    name: string;
    usage: string;
    description: string;
  }>({
    onSelect: (cmd) => {
      if (!inputRef.current) return;
      const cursor = inputRef.current.selectionStart ?? message.length;
      const after = message.substring(cursor);
      const newVal = cmd.name + " " + after;
      setMessage(newVal);
      const pos = (cmd.name + " ").length;
      setTimeout(() => {
        inputRef.current?.setSelectionRange(pos, pos);
        inputRef.current?.focus();
      }, 0);
    },
    onSend: doSend,
  });

  // --- Text change handler ---
  const handleMessageChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newMessage = e.target.value;
      setMessage(newMessage);
      const cursorPos = e.target.selectionStart ?? newMessage.length;
      const textBeforeCursor = newMessage.substring(0, cursorPos);
      const lastSpaceIndex = textBeforeCursor.lastIndexOf(" ");
      const currentWord = textBeforeCursor.substring(lastSpaceIndex + 1);

      // Close all menus first
      const closeAll = () => {
        emoteAutocomplete.hide();
        emojiAutocomplete.hide();
        usernameAutocomplete.hide();
        commandAutocomplete.hide();
      };

      // YouTube emoji :shortcode:
      if (sendTarget === "youtube" || sendTarget === "both") {
        const lastColon = textBeforeCursor.lastIndexOf(":");
        if (lastColon !== -1) {
          const query = textBeforeCursor.substring(lastColon + 1);
          if (query.length >= 2 && !query.includes(" ")) {
            const matches = searchEmojis(query);
            if (matches.length > 0) {
              colonPosRef.current = lastColon;
              closeAll();
              emojiAutocomplete.show(matches);
              return;
            }
          }
        }
      }

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
          usernameAutocomplete.show(matching);
          return;
        }
      }

      // Slash commands
      if (
        (sendTarget === "twitch" || sendTarget === "both") &&
        isModerator &&
        currentWord.startsWith("/") &&
        lastSpaceIndex === -1
      ) {
        const matching = MOD_COMMANDS.filter((cmd) =>
          cmd.name.startsWith(currentWord.toLowerCase()),
        );
        if (matching.length > 0) {
          closeAll();
          commandAutocomplete.show(matching);
          return;
        }
      }

      // Twitch emotes
      if (
        (sendTarget === "twitch" || sendTarget === "both") &&
        currentWord.length > 0 &&
        !currentWord.startsWith("@") &&
        !currentWord.startsWith("/")
      ) {
        const results = searchEmotes(currentWord);
        if (results.length > 0) {
          closeAll();
          emoteAutocomplete.show(results);
          return;
        }
      }

      closeAll();
    },
    [
      sendTarget,
      allAuthors,
      currentUsername,
      isModerator,
      emoteAutocomplete,
      emojiAutocomplete,
      usernameAutocomplete,
      commandAutocomplete,
    ],
  );

  // --- Keyboard handler ---
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Try each autocomplete in priority order
      if (usernameAutocomplete.isOpen) {
        usernameAutocomplete.handleKeyDown(e);
        return;
      }
      if (commandAutocomplete.isOpen) {
        commandAutocomplete.handleKeyDown(e);
        return;
      }
      if (emoteAutocomplete.isOpen) {
        emoteAutocomplete.handleKeyDown(e);
        return;
      }
      if (emojiAutocomplete.isOpen) {
        emojiAutocomplete.handleKeyDown(e);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        doSend();
      }
    },
    [
      usernameAutocomplete,
      commandAutocomplete,
      emoteAutocomplete,
      emojiAutocomplete,
      doSend,
    ],
  );

  // --- Effects ---
  useEffect(() => {
    return () => {
      if (shouldRefocusRef.current) inputRef.current?.focus();
    };
  }, [isLoading]);

  useEffect(() => {
    if (!isLoading && shouldRefocusRef.current) {
      shouldRefocusRef.current = false;
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [isLoading]);

  useEffect(() => {
    if (replyingTo && inputRef.current) inputRef.current.focus();
  }, [replyingTo]);

  // Reset send target when YouTube becomes unavailable
  useEffect(() => {
    if (!youtubeAvailable && sendTarget !== "twitch") setSendTarget("twitch");
  }, [youtubeAvailable, sendTarget]);

  // Menu rect tracking
  useEffect(() => {
    const anyOpen =
      emoteAutocomplete.isOpen ||
      emojiAutocomplete.isOpen ||
      usernameAutocomplete.isOpen ||
      commandAutocomplete.isOpen;
    if (!anyOpen || !inputRef.current) {
      setMenuRect(null);
      return;
    }
    setMenuRect(inputRef.current.getBoundingClientRect());
  }, [
    emoteAutocomplete.isOpen,
    emojiAutocomplete.isOpen,
    usernameAutocomplete.isOpen,
    commandAutocomplete.isOpen,
  ]);

  // Scroll selected item into view
  useEffect(() => {
    if (
      emoteAutocomplete.isOpen &&
      emoteMenuRef.current &&
      emoteAutocomplete.selectedIndex >= 0
    ) {
      const el = emoteMenuRef.current.children[
        emoteAutocomplete.selectedIndex
      ] as HTMLElement;
      el?.scrollIntoView(
        isMobileDevice()
          ? { inline: "nearest", block: "nearest" }
          : { block: "nearest" },
      );
    }
  }, [emoteAutocomplete.selectedIndex, emoteAutocomplete.isOpen]);

  useEffect(() => {
    if (
      emojiAutocomplete.isOpen &&
      emojiMenuRef.current &&
      emojiAutocomplete.selectedIndex >= 0
    ) {
      const el = emojiMenuRef.current.children[
        emojiAutocomplete.selectedIndex
      ] as HTMLElement;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [emojiAutocomplete.selectedIndex, emojiAutocomplete.isOpen]);

  // YouTube picker
  useEffect(() => {
    if (showYtPicker) {
      setYtPickerRect(ytPickerBtnRef.current?.getBoundingClientRect() ?? null);
      setYtPickerSearch("");
      const t = setTimeout(() => ytPickerSearchRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [showYtPicker]);

  // Close pickers on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        showYtPicker &&
        ytPickerRef.current &&
        !ytPickerRef.current.contains(target) &&
        ytPickerBtnRef.current &&
        !ytPickerBtnRef.current.contains(target)
      )
        setShowYtPicker(false);
      if (
        showEmotePicker &&
        emoteMenuRef.current &&
        !emoteMenuRef.current.contains(target) &&
        inputRef.current &&
        !inputRef.current.contains(target)
      )
        setShowEmotePicker(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showYtPicker, showEmotePicker]);

  // Close autocomplete on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        emoteMenuRef.current &&
        !emoteMenuRef.current.contains(target) &&
        inputRef.current &&
        !inputRef.current.contains(target)
      ) {
        emoteAutocomplete.hide();
        emojiAutocomplete.hide();
        usernameAutocomplete.hide();
        commandAutocomplete.hide();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [
    emoteAutocomplete,
    emojiAutocomplete,
    usernameAutocomplete,
    commandAutocomplete,
  ]);

  // --- YouTube emoji insert from picker ---
  const insertEmojiFromPicker = useCallback(
    (char: string) => {
      if (!inputRef.current) return;
      const cursor = inputRef.current.selectionStart ?? message.length;
      const before = message.substring(0, cursor);
      const after = message.substring(cursor);
      setMessage(before + char + after);
      const pos = cursor + char.length;
      setTimeout(() => {
        inputRef.current?.setSelectionRange(pos, pos);
        inputRef.current?.focus();
      }, 0);
    },
    [message],
  );

  // --- Render ---
  const showTwitchFeatures = sendTarget === "twitch" || sendTarget === "both";
  const showYoutubeFeatures =
    (sendTarget === "youtube" || sendTarget === "both") && youtubeAvailable;
  const borderColor =
    sendTarget === "twitch"
      ? "#9146ff"
      : sendTarget === "youtube"
        ? "#ff0000"
        : "#9e4073";
  const placeholder =
    sendTarget === "twitch"
      ? "Send to Twitch..."
      : sendTarget === "youtube"
        ? "Send to YouTube..."
        : "Send to both...";

  return (
    <div className="unified-input">
      {replyingTo && (
        <div className="unified-reply-indicator">
          <div className="unified-reply-text">
            <span style={{ fontWeight: "bold" }}>
              Replying to @{replyingTo.author}
            </span>
            <span style={{ marginLeft: 8, fontStyle: "italic", opacity: 0.7 }}>
              {replyingTo.content.substring(0, 50)}
              {replyingTo.content.length > 50 ? "..." : ""}
            </span>
          </div>
          {onCancelReply && (
            <button
              onClick={onCancelReply}
              className="unified-reply-cancel"
              title="Cancel reply"
            >
              <FaTimes size={14} />
            </button>
          )}
        </div>
      )}

      <div className="unified-input-row" style={{ borderColor }}>
        <PresetMessages
          onSendMessage={onSendMessage}
          isLoading={isLoading}
          selectedPlatforms={
            sendTarget === "both" ? ["twitch", "youtube"] : [sendTarget]
          }
          replyingTo={replyingTo}
          onCancelReply={onCancelReply}
        />

        {/* Emote/Emoji picker button */}
        <button
          ref={
            showYoutubeFeatures && !showTwitchFeatures
              ? ytPickerBtnRef
              : undefined
          }
          onClick={() =>
            showYoutubeFeatures && !showTwitchFeatures
              ? setShowYtPicker(!showYtPicker)
              : setShowEmotePicker(!showEmotePicker)
          }
          className="unified-icon-btn"
          title={showTwitchFeatures ? "Browse emotes" : "Browse emoji"}
        >
          {showTwitchFeatures ? (
            <FaSmile size={16} />
          ) : (
            <FaRegSmile size={16} />
          )}
        </button>

        <input
          ref={inputRef}
          type="text"
          value={message}
          onChange={handleMessageChange}
          onKeyDown={handleKeyDown}
          onFocus={onInputFocus}
          placeholder={placeholder}
          disabled={isLoading}
          className="unified-textarea"
          autoComplete="off"
          autoCapitalize="off"
        />

        <div className="unified-toggle">
          <button
            onClick={() => setSendTarget("twitch")}
            className={`unified-toggle-btn ${sendTarget === "twitch" ? "active twitch" : ""}`}
            title="Send to Twitch"
          >
            <FaTwitch size={14} />
          </button>
          {youtubeAvailable && (
            <button
              onClick={() => setSendTarget("youtube")}
              className={`unified-toggle-btn ${sendTarget === "youtube" ? "active youtube" : ""}`}
              title="Send to YouTube"
            >
              <FaYoutube size={14} />
            </button>
          )}
          {youtubeAvailable && (
            <button
              onClick={() => setSendTarget("both")}
              className={`unified-toggle-btn ${sendTarget === "both" ? "active both" : ""}`}
              title="Send to both"
            >
              <BsFillPeopleFill size={14} />
            </button>
          )}
        </div>
      </div>

      {slowModeCooldown > 0 && (
        <div className="unified-warning" style={{ color: "#f59e0b" }}>
          Slow mode: wait {slowModeCooldown}s
        </div>
      )}
      {followerModeMinutes !== null &&
        isFollowing === false &&
        !(
          channelName &&
          currentUsername.toLowerCase() === channelName.toLowerCase()
        ) && (
          <div className="unified-warning">
            {followerModeMinutes === 0
              ? "Follower-only chat — follow this channel to send messages"
              : `Follower-only chat — follow for at least ${followerModeMinutes < 60 ? `${followerModeMinutes}m` : followerModeMinutes < 1440 ? `${Math.round(followerModeMinutes / 60)}h` : `${Math.round(followerModeMinutes / 1440)}d`}`}
          </div>
        )}

      {/* === PORTAL MENUS === */}

      {emoteAutocomplete.isOpen &&
        emoteAutocomplete.results.length > 0 &&
        menuRect &&
        createPortal(
          <div
            ref={emoteMenuRef}
            className="autocomplete-menu"
            style={{
              position: "fixed",
              bottom: window.innerHeight - menuRect.top + 6,
              left: menuRect.left,
              width: menuRect.width,
              maxHeight: isMobileDevice() ? "60px" : "40vh",
              ...(isMobileDevice()
                ? {
                    left: 0,
                    right: 0,
                    display: "flex",
                    flexDirection: "row",
                    overflowX: "auto",
                    overflowY: "hidden",
                    scrollbarWidth: "none",
                    gap: 4,
                    padding: "4px 8px",
                    background: "var(--color-autocomplete-bg)",
                    borderTop: "1px solid var(--color-autocomplete-border)",
                    borderBottom: "1px solid var(--color-autocomplete-border)",
                  }
                : {}),
            }}
          >
            {emoteAutocomplete.results.map((emote, index) =>
              isMobileDevice() ? (
                <div
                  key={`${emote.source}-${emote.name}`}
                  onClick={() => emoteAutocomplete.select(index)}
                  className={`autocomplete-item${index === emoteAutocomplete.selectedIndex ? " selected" : ""}`}
                  style={{
                    flexShrink: 0,
                    borderRadius: 6,
                    border:
                      index === emoteAutocomplete.selectedIndex
                        ? "1px solid var(--color-accent)"
                        : "1px solid transparent",
                    padding: 4,
                  }}
                  title={emote.name}
                >
                  <img
                    src={emote.url}
                    alt={emote.name}
                    style={{ width: 40, height: 40 }}
                  />
                </div>
              ) : (
                <div
                  key={`${emote.source}-${emote.name}`}
                  onClick={() => emoteAutocomplete.select(index)}
                  className={`autocomplete-item${index === emoteAutocomplete.selectedIndex ? " selected" : ""}`}
                  onMouseEnter={() => emoteAutocomplete.setSelectedIndex(index)}
                >
                  <img
                    src={emote.url}
                    alt={emote.name}
                    style={{ width: 32, height: 32 }}
                  />
                  <div className="autocomplete-item-info">
                    <span className="autocomplete-item-name">{emote.name}</span>
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

      {emojiAutocomplete.isOpen &&
        emojiAutocomplete.results.length > 0 &&
        menuRect &&
        createPortal(
          <div
            ref={emojiMenuRef}
            className="autocomplete-menu"
            style={{
              position: "fixed",
              bottom: window.innerHeight - menuRect.top + 6,
              left: menuRect.left,
              width: menuRect.width,
              maxHeight: "260px",
            }}
          >
            {emojiAutocomplete.results.map((entry, idx) => (
              <div
                key={entry.shortcode}
                onMouseDown={(e) => {
                  e.preventDefault();
                  emojiAutocomplete.select(idx);
                }}
                onMouseEnter={() => emojiAutocomplete.setSelectedIndex(idx)}
                className={`emote-autocomplete-item${idx === emojiAutocomplete.selectedIndex ? " selected" : ""}`}
              >
                <span
                  style={{
                    fontSize: 22,
                    lineHeight: 1,
                    minWidth: 28,
                    textAlign: "center",
                  }}
                >
                  {entry.char}
                </span>
                <div className="emote-autocomplete-info">
                  <span className="emote-autocomplete-name">
                    :{entry.shortcode}:
                  </span>
                  <span className="emote-autocomplete-type">emoji</span>
                </div>
              </div>
            ))}
          </div>,
          document.body,
        )}

      {usernameAutocomplete.isOpen &&
        usernameAutocomplete.results.length > 0 &&
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
            {usernameAutocomplete.results.map((username, index) => (
              <div
                key={username}
                onClick={() => usernameAutocomplete.select(index)}
                className={`autocomplete-item${index === usernameAutocomplete.selectedIndex ? " selected" : ""}`}
                style={{ fontSize: "0.95rem" }}
                onMouseEnter={() =>
                  usernameAutocomplete.setSelectedIndex(index)
                }
              >
                @{username}
              </div>
            ))}
          </div>,
          document.body,
        )}

      {commandAutocomplete.isOpen &&
        commandAutocomplete.results.length > 0 &&
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
            {commandAutocomplete.results.map((cmd, index) => (
              <div
                key={cmd.name}
                onClick={() => commandAutocomplete.select(index)}
                className={`autocomplete-command-item${index === commandAutocomplete.selectedIndex ? " selected" : ""}`}
                onMouseEnter={() => commandAutocomplete.setSelectedIndex(index)}
              >
                <div className="autocomplete-command-header">
                  <span className="autocomplete-command-name">{cmd.name}</span>
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

      <EmoteMenu
        emotes={emotesOrganized}
        onSelectEmote={(name) => {
          insertAtCursor(name);
          setShowEmotePicker(false);
        }}
        isOpen={showEmotePicker}
        onClose={() => setShowEmotePicker(false)}
      />

      {showYtPicker &&
        ytPickerRect &&
        createPortal(
          <div
            ref={ytPickerRef}
            className="yt-emoji-picker"
            style={{
              position: "fixed",
              bottom: window.innerHeight - ytPickerRect.top + 8,
              left: ytPickerRect.left,
            }}
          >
            <div className="yt-emoji-picker-search">
              <input
                ref={ytPickerSearchRef}
                type="text"
                placeholder="Search emoji..."
                value={ytPickerSearch}
                onChange={(e) => setYtPickerSearch(e.target.value)}
                className="yt-emoji-picker-search-input"
              />
            </div>
            <div className="yt-emoji-picker-grid">
              {(ytPickerSearch
                ? EMOJI_LIST.filter((e) =>
                    e.shortcode.includes(ytPickerSearch.toLowerCase()),
                  )
                : EMOJI_LIST
              ).map((entry) => (
                <button
                  key={entry.shortcode}
                  type="button"
                  className="yt-emoji-picker-item"
                  title={`:${entry.shortcode}:`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    insertEmojiFromPicker(entry.char);
                  }}
                >
                  {entry.char}
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
