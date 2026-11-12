import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useImperativeHandle,
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
import type { Platform, TwitchMessage, EmoteAutocompleteMode } from "../../../lib/types";
import { EMOJI_LIST } from "../../../lib/emojiShortcodes";
import { useModerationContext } from "../../../contexts/ModerationContext";
import { sendYouTubeChatMessage } from "../../../lib/youtubeChat";
import EmoteMenu from "../../EmoteMenu";
import PresetMessages from "./PresetMessages";
import AutocompleteMenu, { MenuItem } from "./AutocompleteMenu";
import { useChatInputCore } from "../../../hooks/chat/useChatInputCore";

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
  /** Called when an optimistic YouTube message should be shown. */
  onOptimisticYoutube?: (id: string, text: string) => void;
  /** Called when an optimistic YouTube message fails to deliver. */
  onOptimisticYoutubeFailed?: (id: string) => void;
  youtubeAvailable?: boolean;
  emoteAutocompleteMode?: EmoteAutocompleteMode;
  ref?: React.Ref<UnifiedInputHandle>;
}

const EMPTY_YT_MSG_ARRAY: YTMessage[] = [];

export interface UnifiedInputHandle {
  insertMention: (username: string) => void;
}

function getBorderColor(sendTarget: SendTarget): string {
  if (sendTarget === "twitch") return "#9146ff";
  if (sendTarget === "youtube") return "#ff0000";
  return "#9e4073";
}

function getPlaceholder(sendTarget: SendTarget): string {
  if (sendTarget === "twitch") return "Send to Twitch...";
  if (sendTarget === "youtube") return "Send to YouTube...";
  return "Send to both...";
}

interface ReplyIndicatorProps {
  replyingTo?: TwitchMessage;
  onCancelReply?: () => void;
}

function ReplyIndicator({ replyingTo, onCancelReply }: ReplyIndicatorProps) {
  if (!replyingTo) return null;
  return (
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
  );
}

interface PickerButtonProps {
  showYoutubeFeatures: boolean;
  showTwitchFeatures: boolean;
  onToggleYtPicker: () => void;
  onToggleEmotePicker: () => void;
  ytPickerBtnRef: React.RefObject<HTMLButtonElement | null>;
}

function PickerButton({
  showYoutubeFeatures,
  showTwitchFeatures,
  onToggleYtPicker,
  onToggleEmotePicker,
  ytPickerBtnRef,
}: PickerButtonProps) {
  const isYoutubeOnly = showYoutubeFeatures && !showTwitchFeatures;
  return (
    <button type="button"
      ref={isYoutubeOnly ? ytPickerBtnRef : undefined}
      onClick={() =>
        isYoutubeOnly ? onToggleYtPicker() : onToggleEmotePicker()
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
  );
}

interface PlatformToggleProps {
  sendTarget: SendTarget;
  youtubeAvailable: boolean;
  onSelectTarget: (target: SendTarget) => void;
}

function PlatformToggle({
  sendTarget,
  youtubeAvailable,
  onSelectTarget,
}: PlatformToggleProps) {
  return (
    <div className="unified-toggle">
      <button type="button"
        onClick={() => onSelectTarget("twitch")}
        className={`unified-toggle-btn ${sendTarget === "twitch" ? "active twitch" : ""}`}
        title="Send to Twitch"
      >
        <FaTwitch size={14} />
      </button>
      {youtubeAvailable && (
        <button type="button"
          onClick={() => onSelectTarget("youtube")}
          className={`unified-toggle-btn ${sendTarget === "youtube" ? "active youtube" : ""}`}
          title="Send to YouTube"
        >
          <FaYoutube size={14} />
        </button>
      )}
      {youtubeAvailable && (
        <button type="button"
          onClick={() => onSelectTarget("both")}
          className={`unified-toggle-btn ${sendTarget === "both" ? "active both" : ""}`}
          title="Send to both"
        >
          <BsFillPeopleFill size={14} />
        </button>
      )}
    </div>
  );
}

interface InputWarningsProps {
  slowModeCooldown: number;
  followerModeMinutes: number | null;
  isFollowing: boolean | null;
  channelName: string;
  currentUsername: string;
}

function InputWarnings({
  slowModeCooldown,
  followerModeMinutes,
  isFollowing,
  channelName,
  currentUsername,
}: InputWarningsProps) {
  const isBroadcaster =
    !!channelName &&
    currentUsername.toLowerCase() === channelName.toLowerCase();
  return (
    <>
      {slowModeCooldown > 0 && (
        <div className="unified-warning" style={{ color: "#f59e0b" }}>
          Slow mode: wait {slowModeCooldown}s
        </div>
      )}
      {followerModeMinutes !== null &&
        isFollowing === false &&
        !isBroadcaster && (
          <div className="unified-warning">
            {followerModeMinutes === 0
              ? "Follower-only chat: follow this channel to send messages"
              : `Follower-only chat: follow for at least ${followerModeMinutes < 60 ? `${followerModeMinutes}m` : followerModeMinutes < 1440 ? `${Math.round(followerModeMinutes / 60)}h` : `${Math.round(followerModeMinutes / 1440)}d`}`}
          </div>
        )}
    </>
  );
}

interface YoutubeEmojiPickerProps {
  isOpen: boolean;
  rect: DOMRect | null;
  search: string;
  onSearchChange: (value: string) => void;
  onPick: (char: string) => void;
  pickerRef: React.RefObject<HTMLDivElement | null>;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}

function YoutubeEmojiPicker({
  isOpen,
  rect,
  search,
  onSearchChange,
  onPick,
  pickerRef,
  searchInputRef,
}: YoutubeEmojiPickerProps) {
  if (!isOpen || !rect) return null;
  return createPortal(
    <div
      ref={pickerRef}
      className="yt-emoji-picker"
      style={{
        position: "fixed",
        bottom: window.innerHeight - rect.top + 8,
        left: rect.left,
      }}
    >
      <div className="yt-emoji-picker-search">
        <input
          ref={searchInputRef}
          type="text"
          placeholder="Search emoji..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search emoji"
          className="yt-emoji-picker-search-input"
        />
      </div>
      <div className="yt-emoji-picker-grid">
        {(search
          ? EMOJI_LIST.filter((e) => e.shortcode.includes(search.toLowerCase()))
          : EMOJI_LIST
        ).map((entry) => (
          <button
            key={entry.shortcode}
            type="button"
            className="yt-emoji-picker-item"
            title={`:${entry.shortcode}:`}
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(entry.char);
            }}
          >
            {entry.char}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}

const UnifiedInput = ({
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
  onOptimisticYoutube,
  onOptimisticYoutubeFailed,
  youtubeAvailable = false,
  emoteAutocompleteMode = "default",
  ref,
}: UnifiedInputProps) => {
  const { isModerator } = useModerationContext();
  const [sendTarget, setSendTarget] = useState<SendTarget>("twitch");
  const inputRef = useRef<HTMLInputElement>(null);

  const [showEmotePicker, setShowEmotePicker] = useState(false);
  const [showYtPicker, setShowYtPicker] = useState(false);
  const [ytPickerSearch, setYtPickerSearch] = useState("");
  const [ytPickerRect, setYtPickerRect] = useState<DOMRect | null>(null);
  const ytPickerRef = useRef<HTMLDivElement>(null);
  const ytPickerBtnRef = useRef<HTMLButtonElement>(null);
  const ytPickerSearchRef = useRef<HTMLInputElement>(null);

  const showTwitchFeatures = sendTarget === "twitch" || sendTarget === "both";
  const showYoutubeFeatures =
    (sendTarget === "youtube" || sendTarget === "both") && youtubeAvailable;

  const onSend = useCallback(
    async (text: string) => {
      if (sendTarget === "twitch" || sendTarget === "both") {
        try {
          await onSendMessage(text, ["twitch"], replyingTo?.id);
        } catch (err) {
          console.error("Twitch send failed:", err);
        }
      }
      if (showYoutubeFeatures && youtubeVideoId) {
        const optimisticId = `optimistic_yt_${Date.now()}_${Math.random()}`;
        onOptimisticYoutube?.(optimisticId, text);
        try {
          await sendYouTubeChatMessage(youtubeVideoId, text);
        } catch (err) {
          onOptimisticYoutubeFailed?.(optimisticId);
          console.error("YouTube send failed:", err);
        }
      }
      setShowEmotePicker(false);
      setShowYtPicker(false);
      if (onCancelReply) onCancelReply();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      sendTarget,
      showYoutubeFeatures,
      youtubeVideoId,
      onOptimisticYoutube,
      onOptimisticYoutubeFailed,
      onCancelReply,
      replyingTo,
      onSendMessage,
    ],
  );

  const core = useChatInputCore({
    inputRef,
    chatMessages: chatMessages as any,
    ytChatMessages,
    currentUsername,
    isModerator,
    isLoading,
    replyingToId: replyingTo?.id,
    enableTwitchFeatures: showTwitchFeatures,
    enableYoutubeEmoji: showYoutubeFeatures,
    emoteAutocompleteMode,
    mentionSource: sendTarget,
    slowModeWaitTime: (sendTarget === "twitch" || sendTarget === "both") ? slowModeWaitTime : null,
    onSend,
  });

  useImperativeHandle(
    ref,
    () => ({ insertMention: core.insertMention }),
    [core.insertMention],
  );

  useEffect(() => {
    if (!youtubeAvailable && sendTarget !== "twitch") setSendTarget("twitch");
    // eslint-disable-next-line no-adjust-state-on-prop-change
  }, [youtubeAvailable, sendTarget]);

  useEffect(() => {
    if (showYtPicker) {
      setYtPickerRect(ytPickerBtnRef.current?.getBoundingClientRect() ?? null);
      setYtPickerSearch("");
      const t = setTimeout(() => ytPickerSearchRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [showYtPicker]);

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

  const insertEmojiFromPicker = useCallback(
    (char: string) => {
      const cursor = inputRef.current?.selectionStart ?? core.message.length;
      const before = core.message.substring(0, cursor);
      core.insertAtPosition(before, char);
    },
    [core],
  );

  const handleInsertPresetText = useCallback(
    (text: string) => {
      const el = inputRef.current;
      const cursor = el?.selectionStart ?? core.message.length;
      const before = core.message.substring(0, cursor);
      const after = core.message.substring(cursor);
      const needsSpace = before.length > 0 && !/\s$/.test(before);
      const insert = needsSpace ? ` ${text}` : text;
      const newValue = before + insert + after;
      core.setMessage(newValue);
      const pos = (before + insert).length;
      setTimeout(() => {
        el?.setSelectionRange(pos, pos);
        el?.focus();
      }, 0);
    },
    [core.message, core.setMessage, inputRef],
  );

  const borderColor = getBorderColor(sendTarget);
  const placeholder = getPlaceholder(sendTarget);

  return (
    <div className="unified-input">
      <ReplyIndicator replyingTo={replyingTo} onCancelReply={onCancelReply} />

      <div className="unified-input-row" style={{ borderColor }}>
        <PresetMessages
          onInsertText={handleInsertPresetText}
          isLoading={isLoading}
          emoteAutocompleteMode={emoteAutocompleteMode}
        />

        <PickerButton
          showYoutubeFeatures={showYoutubeFeatures}
          showTwitchFeatures={showTwitchFeatures}
          onToggleYtPicker={() => setShowYtPicker(!showYtPicker)}
          onToggleEmotePicker={() => setShowEmotePicker(!showEmotePicker)}
          ytPickerBtnRef={ytPickerBtnRef}
        />

        <input
          ref={inputRef}
          type="text"
          value={core.message}
          onChange={core.handleChange}
          onKeyDown={core.handleKeyDown}
          onFocus={onInputFocus}
          placeholder={placeholder}
          aria-label="Send chat message"
          disabled={isLoading}
          className="unified-textarea"
          autoComplete="off"
          autoCapitalize="off"
        />

        <PlatformToggle
          sendTarget={sendTarget}
          youtubeAvailable={youtubeAvailable}
          onSelectTarget={setSendTarget}
        />
      </div>

      <InputWarnings
        slowModeCooldown={core.slowModeCooldown}
        followerModeMinutes={followerModeMinutes}
        isFollowing={isFollowing}
        channelName={channelName}
        currentUsername={currentUsername}
      />

      <AutocompleteMenu
        isOpen={core.emoteAC.isOpen}
        results={core.emoteAC.results}
        selectedIndex={core.emoteAC.selectedIndex}
        menuRect={core.menuRect}
        menuRef={core.menuRef}
        onSelect={(i) => core.emoteAC.select(i)}
        renderItem={(emote, index, isSelected) => (
          <MenuItem
            key={`${emote.source}-${emote.name}`}
            index={index}
            isSelected={isSelected}
            onSelect={(i) => core.emoteAC.select(i)}
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
        isOpen={core.emojiAC.isOpen}
        results={core.emojiAC.results}
        selectedIndex={core.emojiAC.selectedIndex}
        menuRect={core.menuRect}
        menuRef={core.menuRef}
        maxHeight="260px"
        onSelect={(i) => core.emojiAC.select(i)}
        renderItem={(entry, idx, isSelected) => (
          <MenuItem
            key={entry.shortcode}
            index={idx}
            isSelected={isSelected}
            onSelect={(i) => core.emojiAC.select(i)}
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
        isOpen={core.usernameAC.isOpen}
        results={core.usernameAC.results}
        selectedIndex={core.usernameAC.selectedIndex}
        menuRect={core.menuRect}
        onSelect={(i) => core.usernameAC.select(i)}
        renderItem={(username, index, isSelected) => (
          <MenuItem
            key={username}
            index={index}
            isSelected={isSelected}
            onSelect={(i) => core.usernameAC.select(i)}
            style={{ fontSize: "0.95rem" }}
          >
            @{username}
          </MenuItem>
        )}
      />

      <AutocompleteMenu
        isOpen={core.commandAC.isOpen}
        results={core.commandAC.results}
        selectedIndex={core.commandAC.selectedIndex}
        menuRect={core.menuRect}
        onSelect={(i) => core.commandAC.select(i)}
        renderItem={(cmd, index, isSelected) => (
          <MenuItem
            key={cmd.name}
            index={index}
            isSelected={isSelected}
            onSelect={(i) => core.commandAC.select(i)}
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
        emotes={core.emotesOrganized}
        onSelectEmote={(name) => {
          core.insertWithPrefix(name);
          setShowEmotePicker(false);
        }}
        isOpen={showEmotePicker}
        onClose={() => setShowEmotePicker(false)}
      />

      <YoutubeEmojiPicker
        isOpen={showYtPicker}
        rect={ytPickerRect}
        search={ytPickerSearch}
        onSearchChange={setYtPickerSearch}
        onPick={insertEmojiFromPicker}
        pickerRef={ytPickerRef}
        searchInputRef={ytPickerSearchRef}
      />
    </div>
  );
};

export default UnifiedInput;
