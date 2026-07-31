import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";
import { createPortal } from "react-dom";
import { FaRegSmile } from "react-icons/fa";
import {
  searchEmojis,
  EMOJI_LIST,
  type EmojiEntry,
} from "../../../lib/emojiShortcodes";
import AutocompleteMenu, { MenuItem } from "./AutocompleteMenu";
import { useAutocomplete } from "../../../hooks/chat/useAutocomplete";
import { useAutocompleteMenu } from "../../../hooks/chat/useAutocompleteMenu";
import { useInsertAtCursor } from "../../../hooks/chat/useInsertAtCursor";
import { sendYouTubeChatMessage } from "../../../lib/youtube";

interface YTMessage {
  id: string;
  author: string;
  authorAvatar?: string;
  badges?: Record<string, string>;
  parts: any[];
  timestamp: Date;
  authorChannelId?: string;
  optimistic?: boolean;
}

interface YouTubeMessageInputProps {
  youtubeVideoId: string;
  chatMessages?: YTMessage[];
  onError?: (message: string) => void;
  onOptimisticMessage?: (id: string, text: string) => void;
  onOptimisticFailed?: (id: string) => void;
}

const EMPTY_YT_MESSAGES: YTMessage[] = [];

export default function YouTubeMessageInput({
  youtubeVideoId,
  chatMessages = [] as YTMessage[],
  onError,
  onOptimisticMessage,
  onOptimisticFailed,
}: YouTubeMessageInputProps) {
  const [ytMessage, setYtMessage] = useState("");
  const [ytSending, setYtSending] = useState(false);
  const colonPosRef = useRef(-1);
  const mentionPosRef = useRef(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  // Emoji picker
  const [showPicker, setShowPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerRect, setPickerRect] = useState<DOMRect | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const pickerBtnRef = useRef<HTMLButtonElement>(null);
  const pickerSearchRef = useRef<HTMLInputElement>(null);

  const chatAuthors = useMemo(() => {
    const authors = new Set<string>();
    chatMessages.forEach((m) => {
      if (m.author) authors.add(m.author);
    });
    return Array.from(authors);
  }, [chatMessages]);

  // --- Insert at cursor helper ---
  const { insertAtPosition } = useInsertAtCursor({
    message: ytMessage,
    setMessage: setYtMessage,
    inputRef,
  });

  // --- Send ---
  const handleSend = useCallback(async () => {
    const text = ytMessage.trim();
    if (!text || !youtubeVideoId) return;
    const optimisticId = `optimistic_yt_${Date.now()}_${Math.random()}`;
    onOptimisticMessage?.(optimisticId, text);
    setYtMessage("");
    setYtSending(true);
    try {
      await sendYouTubeChatMessage(youtubeVideoId, text);
    } catch (err) {
      console.error("Failed to send YouTube message:", err);
      onOptimisticFailed?.(optimisticId);
      setYtMessage(text);
      const msg = err instanceof Error ? err.message : "Failed to send YouTube message";
      onError?.(msg);
    } finally {
      setYtSending(false);
    }
  }, [
    ytMessage,
    youtubeVideoId,
    onError,
    onOptimisticMessage,
    onOptimisticFailed,
  ]);

  // --- Insert helpers ---
  const insertEmoji = useCallback(
    (entry: EmojiEntry) => {
      if (colonPosRef.current === -1) return;
      const before = ytMessage.substring(0, colonPosRef.current);
      const cursor = inputRef.current?.selectionStart ?? ytMessage.length;
      const after = ytMessage.substring(cursor);
      insertAtPosition(before, entry.char, after);
      colonPosRef.current = -1;
    },
    [ytMessage, insertAtPosition],
  );

  const insertMention = useCallback(
    (author: string) => {
      if (mentionPosRef.current === -1) return;
      const before = ytMessage.substring(0, mentionPosRef.current);
      const cursor = inputRef.current?.selectionStart ?? ytMessage.length;
      const after = ytMessage.substring(cursor);
      const prefix = author.startsWith("@") ? "" : "@";
      insertAtPosition(before, prefix + author, after);
      mentionPosRef.current = -1;
    },
    [ytMessage, insertAtPosition],
  );

  const insertEmojiFromPicker = useCallback(
    (char: string) => {
      const cursor = inputRef.current?.selectionStart ?? ytMessage.length;
      const before = ytMessage.substring(0, cursor);
      const after = ytMessage.substring(cursor);
      insertAtPosition(before, char, after);
    },
    [ytMessage, insertAtPosition],
  );

  // --- Autocomplete instances ---
  const emojiAC = useAutocomplete<EmojiEntry>({
    onSelect: (entry) => insertEmoji(entry),
    onSend: handleSend,
  });

  const mentionAC = useAutocomplete<string>({
    onSelect: (author) => insertMention(author),
    onSend: handleSend,
  });

  // --- Autocomplete menu management ---
  const { menuRect, menuRef, closeAll } = useAutocompleteMenu({
    inputRef,
    autocompleteInstances: [emojiAC, mentionAC],
  });

  // --- Text change ---
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setYtMessage(val);
      const cursor = e.target.selectionStart ?? val.length;
      const beforeCursor = val.substring(0, cursor);

      // Emoji :shortcode:
      const lastColon = beforeCursor.lastIndexOf(":");
      if (lastColon !== -1) {
        const query = beforeCursor.substring(lastColon + 1);
        if (query.length >= 2 && !query.includes(" ")) {
          const matches = searchEmojis(query);
          if (matches.length > 0) {
            colonPosRef.current = lastColon;
            closeAll();
            emojiAC.show(matches);
            return;
          }
        }
      }

      // @mention
      const lastAt = beforeCursor.lastIndexOf("@");
      if (lastAt !== -1 && (lastAt === 0 || beforeCursor[lastAt - 1] === " ")) {
        const query = beforeCursor.substring(lastAt + 1).toLowerCase();
        if (!query.includes(" ")) {
          const matches = chatAuthors.filter((a) => {
            const normalized = a.toLowerCase().startsWith("@")
              ? a.toLowerCase().slice(1)
              : a.toLowerCase();
            return normalized.startsWith(query);
          });
          if (matches.length > 0) {
            mentionPosRef.current = lastAt;
            closeAll();
            mentionAC.show(matches);
            return;
          }
        }
      }

      closeAll();
    },
    [chatAuthors, emojiAC, mentionAC, closeAll],
  );

  // --- Keyboard ---
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (emojiAC.isOpen) {
        emojiAC.handleKeyDown(e);
        return;
      }
      if (mentionAC.isOpen) {
        mentionAC.handleKeyDown(e);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [emojiAC, mentionAC, handleSend],
  );

  // --- Effects ---
  useEffect(() => {
    if (showPicker) {
      setPickerRect(pickerBtnRef.current?.getBoundingClientRect() ?? null);
      setPickerSearch("");
      const t = setTimeout(() => pickerSearchRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [showPicker]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        showPicker &&
        pickerRef.current &&
        !pickerRef.current.contains(target) &&
        pickerBtnRef.current &&
        !pickerBtnRef.current.contains(target)
      )
        setShowPicker(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPicker]);

  return (
    <div className="message-input">
      <div className="input-group youtube">
        <AutocompleteMenu
          isOpen={emojiAC.isOpen}
          results={emojiAC.results}
          selectedIndex={emojiAC.selectedIndex}
          menuRect={menuRect}
          menuRef={menuRef}
          maxHeight="260px"
          onSelect={(i) => emojiAC.select(i)}
          renderItem={(entry, idx, isSelected) => (
            <MenuItem
              key={entry.shortcode}
              index={idx}
              isSelected={isSelected}
              onSelect={(i) => emojiAC.select(i)}
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
          isOpen={mentionAC.isOpen}
          results={mentionAC.results}
          selectedIndex={mentionAC.selectedIndex}
          menuRect={menuRect}
          menuRef={menuRef}
          maxHeight="260px"
          onSelect={(i) => mentionAC.select(i)}
          renderItem={(author, idx, isSelected) => (
            <MenuItem
              key={author}
              index={idx}
              isSelected={isSelected}
              onSelect={(i) => mentionAC.select(i)}
            >
              <div className="autocomplete-item-info">
                <span className="autocomplete-item-name">
                  {author.startsWith("@") ? author : `@${author}`}
                </span>
              </div>
            </MenuItem>
          )}
        />

        <button
          ref={pickerBtnRef}
          type="button"
          className="emote-picker-button"
          title="Emoji picker"
          onClick={() => setShowPicker((p) => !p)}
          disabled={ytSending}
        >
          <FaRegSmile size={16} />
        </button>

        <input
          ref={inputRef}
          type="text"
          value={ytMessage}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Send to YouTube..."
          aria-label="Send message to YouTube"
          disabled={ytSending}
          className="message-textarea"
        />

        {showPicker &&
          pickerRect &&
          createPortal(
            <div
              ref={pickerRef}
              className="yt-emoji-picker"
              style={{
                position: "fixed",
                bottom: window.innerHeight - pickerRect.top + 8,
                left: pickerRect.left,
              }}
            >
              <div className="yt-emoji-picker-search">
                <input
                  ref={pickerSearchRef}
                  type="text"
                  placeholder="Search emoji..."
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  aria-label="Search emoji"
                  className="yt-emoji-picker-search-input"
                />
              </div>
              <div className="yt-emoji-picker-grid">
                {(pickerSearch
                  ? EMOJI_LIST.filter((e) =>
                      e.shortcode.includes(pickerSearch.toLowerCase()),
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
    </div>
  );
}
