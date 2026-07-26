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
import { useModerationContext } from "../../../contexts/ModerationContext";
import { MOD_COMMANDS } from "../../../lib/constants";
import EmoteMenu from "../../EmoteMenu";
import PresetMessages from "./PresetMessages";
import AutocompleteMenu, { MenuItem } from "./AutocompleteMenu";
import { useAutocomplete } from "../../../hooks/chat/useAutocomplete";
import { useAutocompleteMenu } from "../../../hooks/chat/useAutocompleteMenu";
import { useInsertAtCursor } from "../../../hooks/chat/useInsertAtCursor";
import { useSlowMode } from "../../../hooks/chat/useSlowMode";
import { useEmotes } from "../../../hooks/chat/useEmotes";
import { isMobileDevice } from "../../../lib/device";

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

const EMPTY_YT_MSG_ARRAY: YTMessage[] = [];

export default function UnifiedInput({
  onSendMessage,
  isLoading,
  replyingTo,
  onCancelReply,
  chatMessages = EMPTY_YT_MSG_ARRAY as any,
  currentUsername = "",
  onInputFocus,
  slowModeWaitTime = null,
  followerModeMinutes = null,
  isFollowing = null,
  channelName = "",
  youtubeVideoId = null,
  ytChatMessages = EMPTY_YT_MSG_ARRAY,
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
        if (!isMobileDevice()) shouldRefocusRef.current = true;
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
  const { insertWithPrefix, insertAtPosition, replaceCurrentWord } =
    useInsertAtCursor({ message, setMessage, inputRef });

  // --- Autocomplete instances ---
  const emoteAutocomplete = useAutocomplete<{
    name: string;
    url: string;
    source: string;
  }>({
    onSelect: (emote) => {
      insertWithPrefix(emote.name);
      setShowEmotePicker(false);
    },
    onSend: doSend,
  });

  const emojiAutocomplete = useAutocomplete<EmojiEntry>({
    onSelect: (entry) => {
      if (colonPosRef.current === -1) return;
      const before = message.substring(0, colonPosRef.current);
      const cursor = inputRef.current?.selectionStart ?? message.length;
      const after = message.substring(cursor);
      insertAtPosition(before, entry.char);
      colonPosRef.current = -1;
    },
    onSend: doSend,
  });

  const usernameAutocomplete = useAutocomplete<string>({
    onSelect: (username) => {
      insertWithPrefix(username, "@");
    },
    onSend: doSend,
  });

  const commandAutocomplete = useAutocomplete<{
    name: string;
    usage: string;
    description: string;
  }>({
    onSelect: (cmd) => {
      replaceCurrentWord(cmd.name);
    },
    onSend: doSend,
  });

  // --- Autocomplete menu management ---
  const { menuRect, menuRef, closeAll } = useAutocompleteMenu({
    inputRef,
    autocompleteInstances: [
      emoteAutocomplete,
      emojiAutocomplete,
      usernameAutocomplete,
      commandAutocomplete,
    ],
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
      closeAll,
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
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showYtPicker]);

  // --- YouTube emoji insert from picker ---
  const insertEmojiFromPicker = useCallback(
    (char: string) => {
      const cursor = inputRef.current?.selectionStart ?? message.length;
      const before = message.substring(0, cursor);
      const after = message.substring(cursor);
      insertAtPosition(before, char, after);
    },
    [message, insertAtPosition],
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
            <button type="button"
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
        <button type="button"
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
          <button type="button"
            onClick={() => setSendTarget("twitch")}
            className={`unified-toggle-btn ${sendTarget === "twitch" ? "active twitch" : ""}`}
            title="Send to Twitch"
          >
            <FaTwitch size={14} />
          </button>
          {youtubeAvailable && (
            <button type="button"
              onClick={() => setSendTarget("youtube")}
              className={`unified-toggle-btn ${sendTarget === "youtube" ? "active youtube" : ""}`}
              title="Send to YouTube"
            >
              <FaYoutube size={14} />
            </button>
          )}
          {youtubeAvailable && (
            <button type="button"
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

      <AutocompleteMenu
        isOpen={emoteAutocomplete.isOpen}
        results={emoteAutocomplete.results}
        selectedIndex={emoteAutocomplete.selectedIndex}
        menuRect={menuRect}
        menuRef={menuRef}
        onSelect={(i) => emoteAutocomplete.select(i)}
        renderItem={(emote, index, isSelected) => (
          <MenuItem
            key={`${emote.source}-${emote.name}`}
            index={index}
            isSelected={isSelected}
            onSelect={(i) => emoteAutocomplete.select(i)}
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
        isOpen={emojiAutocomplete.isOpen}
        results={emojiAutocomplete.results}
        selectedIndex={emojiAutocomplete.selectedIndex}
        menuRect={menuRect}
        menuRef={menuRef}
        maxHeight="260px"
        onSelect={(i) => emojiAutocomplete.select(i)}
        renderItem={(entry, idx, isSelected) => (
          <MenuItem
            key={entry.shortcode}
            index={idx}
            isSelected={isSelected}
            onSelect={(i) => emojiAutocomplete.select(i)}
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
            <div className="autocomplete-item-info">
              <span className="autocomplete-item-name">
                :{entry.shortcode}:
              </span>
              <span className="autocomplete-item-type">emoji</span>
            </div>
          </MenuItem>
        )}
      />

      <AutocompleteMenu
        isOpen={usernameAutocomplete.isOpen}
        results={usernameAutocomplete.results}
        selectedIndex={usernameAutocomplete.selectedIndex}
        menuRect={menuRect}
        onSelect={(i) => usernameAutocomplete.select(i)}
        renderItem={(username, index, isSelected) => (
          <MenuItem
            key={username}
            index={index}
            isSelected={isSelected}
            onSelect={(i) => usernameAutocomplete.select(i)}
            style={{ fontSize: "0.95rem" }}
          >
            @{username}
          </MenuItem>
        )}
      />

      <AutocompleteMenu
        isOpen={commandAutocomplete.isOpen}
        results={commandAutocomplete.results}
        selectedIndex={commandAutocomplete.selectedIndex}
        menuRect={menuRect}
        onSelect={(i) => commandAutocomplete.select(i)}
        renderItem={(cmd, index, isSelected) => (
          <MenuItem
            key={cmd.name}
            index={index}
            isSelected={isSelected}
            onSelect={(i) => commandAutocomplete.select(i)}
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

      <EmoteMenu
        emotes={emotesOrganized}
        onSelectEmote={(name) => {
          insertWithPrefix(name);
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
