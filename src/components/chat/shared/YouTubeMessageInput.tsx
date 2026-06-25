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
import { useAutocomplete } from "../../../hooks/chat/useAutocomplete";

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

export default function YouTubeMessageInput({
  youtubeVideoId,
  chatMessages = [],
  onError,
  onOptimisticMessage,
  onOptimisticFailed,
}: YouTubeMessageInputProps) {
  const [ytMessage, setYtMessage] = useState("");
  const [ytSending, setYtSending] = useState(false);
  const colonPosRef = useRef(-1);
  const mentionPosRef = useRef(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);

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

  // --- Send ---
  const handleSend = useCallback(async () => {
    const text = ytMessage.trim();
    if (!text || !youtubeVideoId) return;
    const optimisticId = `optimistic_yt_${Date.now()}_${Math.random()}`;
    onOptimisticMessage?.(optimisticId, text);
    setYtMessage("");
    setYtSending(true);
    try {
      const res = await fetch("/api/youtube-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: youtubeVideoId, message: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        onOptimisticFailed?.(optimisticId);
        setYtMessage(text);
        onError?.(`YouTube: ${data.error || "Failed to send message"}`);
      }
    } catch (err) {
      console.error("Failed to send YouTube message:", err);
      onOptimisticFailed?.(optimisticId);
      setYtMessage(text);
      onError?.("Failed to send YouTube message");
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
      if (!inputRef.current || colonPosRef.current === -1) return;
      const before = ytMessage.substring(0, colonPosRef.current);
      const cursor = inputRef.current.selectionStart ?? ytMessage.length;
      const after = ytMessage.substring(cursor);
      setYtMessage(before + entry.char + " " + after);
      colonPosRef.current = -1;
      const pos = (before + entry.char + " ").length;
      setTimeout(() => {
        inputRef.current?.setSelectionRange(pos, pos);
        inputRef.current?.focus();
      }, 0);
    },
    [ytMessage],
  );

  const insertMention = useCallback(
    (author: string) => {
      if (!inputRef.current || mentionPosRef.current === -1) return;
      const before = ytMessage.substring(0, mentionPosRef.current);
      const cursor = inputRef.current.selectionStart ?? ytMessage.length;
      const after = ytMessage.substring(cursor);
      const prefix = author.startsWith("@") ? "" : "@";
      setYtMessage(before + prefix + author + " " + after);
      mentionPosRef.current = -1;
      const pos = (before + prefix + author + " ").length;
      setTimeout(() => {
        inputRef.current?.setSelectionRange(pos, pos);
        inputRef.current?.focus();
      }, 0);
    },
    [ytMessage],
  );

  const insertEmojiFromPicker = useCallback(
    (char: string) => {
      if (!inputRef.current) return;
      const cursor = inputRef.current.selectionStart ?? ytMessage.length;
      const before = ytMessage.substring(0, cursor);
      const after = ytMessage.substring(cursor);
      setYtMessage(before + char + after);
      const pos = cursor + char.length;
      setTimeout(() => {
        inputRef.current?.setSelectionRange(pos, pos);
        inputRef.current?.focus();
      }, 0);
    },
    [ytMessage],
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

  // --- Text change ---
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setYtMessage(val);
      const cursor = e.target.selectionStart ?? val.length;
      const beforeCursor = val.substring(0, cursor);

      const closeAll = () => {
        emojiAC.hide();
        mentionAC.hide();
      };

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
    [chatAuthors, emojiAC, mentionAC],
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
    const anyOpen = emojiAC.isOpen || mentionAC.isOpen;
    if (!anyOpen || !inputRef.current) {
      setMenuRect(null);
      return;
    }
    setMenuRect(inputRef.current.getBoundingClientRect());
  }, [emojiAC.isOpen, mentionAC.isOpen]);

  useEffect(() => {
    if (emojiAC.isOpen && emojiAC.selectedIndex >= 0) {
      const menu = document.querySelector(
        `.autocomplete-menu .emote-autocomplete-item:nth-child(${emojiAC.selectedIndex + 1})`,
      );
      menu?.scrollIntoView({ block: "nearest" });
    }
  }, [emojiAC.selectedIndex, emojiAC.isOpen]);

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
        {emojiAC.isOpen &&
          emojiAC.results.length > 0 &&
          menuRect &&
          createPortal(
            <div
              className="autocomplete-menu"
              style={{
                position: "fixed",
                bottom: window.innerHeight - menuRect.top + 6,
                left: menuRect.left,
                width: menuRect.width,
                maxHeight: "260px",
              }}
            >
              {emojiAC.results.map((entry, idx) => (
                <div
                  key={entry.shortcode}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    emojiAC.select(idx);
                  }}
                  onMouseEnter={() => emojiAC.setSelectedIndex(idx)}
                  className={`emote-autocomplete-item${idx === emojiAC.selectedIndex ? " selected" : ""}`}
                >
                  <span
                    style={{
                      fontSize: "22px",
                      lineHeight: 1,
                      minWidth: "28px",
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

        {mentionAC.isOpen &&
          mentionAC.results.length > 0 &&
          menuRect &&
          createPortal(
            <div
              className="autocomplete-menu"
              style={{
                position: "fixed",
                bottom: window.innerHeight - menuRect.top + 6,
                left: menuRect.left,
                width: menuRect.width,
                maxHeight: "260px",
              }}
            >
              {mentionAC.results.map((author, idx) => (
                <div
                  key={author}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    mentionAC.select(idx);
                  }}
                  onMouseEnter={() => mentionAC.setSelectedIndex(idx)}
                  className={`emote-autocomplete-item${idx === mentionAC.selectedIndex ? " selected" : ""}`}
                >
                  <div className="emote-autocomplete-info">
                    <span className="emote-autocomplete-name">
                      {author.startsWith("@") ? author : `@${author}`}
                    </span>
                  </div>
                </div>
              ))}
            </div>,
            document.body,
          )}

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
