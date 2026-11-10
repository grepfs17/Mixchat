import React, {
  useState,
  useRef,
  memo,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { FaTimes, FaSmile } from "react-icons/fa";
import type { Platform, TwitchMessage, EmoteAutocompleteMode } from "../../../lib/types";
import { useModerationContext } from "../../../contexts/ModerationContext";
import EmoteMenu from "../../EmoteMenu";
import PresetMessages from "./PresetMessages";
import AutocompleteMenu, { MenuItem } from "./AutocompleteMenu";
import { useChatInputCore } from "../../../hooks/chat/useChatInputCore";
import type { UseAutocompleteReturn } from "../../../hooks/chat/useAutocomplete";

const SELECTED_PLATFORMS: Platform[] = ["twitch"];

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
  emoteAutocompleteMode?: EmoteAutocompleteMode;
}

export interface MessageInputHandle {
  insertMention: (username: string) => void;
}

interface ChatAutocompleteProps<T> {
  ac: UseAutocompleteReturn<T>;
  menuRect: DOMRect | null;
  menuRef: React.RefObject<HTMLDivElement | null>;
  renderItem: (item: T, index: number, isSelected: boolean) => React.ReactNode;
}

/* Shared wiring for the emote / username / command autocomplete menus. */
function ChatAutocomplete<T>({
  ac,
  menuRect,
  menuRef,
  renderItem,
}: ChatAutocompleteProps<T>) {
  return (
    <AutocompleteMenu
      isOpen={ac.isOpen}
      results={ac.results}
      selectedIndex={ac.selectedIndex}
      menuRect={menuRect}
      menuRef={menuRef}
      onSelect={ac.select}
      renderItem={renderItem}
    />
  );
}

interface ReplyIndicatorProps {
  replyingTo?: TwitchMessage;
  onCancelReply?: () => void;
}

function ReplyIndicator({ replyingTo, onCancelReply }: ReplyIndicatorProps) {
  if (!replyingTo) return null;
  return (
    <div className="reply-indicator">
      <div className="reply-indicator-text">
        <span className="reply-indicator-author">
          Replying to @{replyingTo.author}
        </span>
        <span className="reply-indicator-preview">
          {replyingTo.content.substring(0, 50)}
          {replyingTo.content.length > 50 ? "..." : ""}
        </span>
      </div>
      {onCancelReply && (
        <button
          type="button"
          onClick={onCancelReply}
          className="reply-indicator-cancel"
          title="Cancel reply"
        >
          <FaTimes size={16} />
        </button>
      )}
    </div>
  );
}

function pluralize(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}

function followerModeMessage(minutes: number): string {
  if (minutes === 0) {
    return "⚠ Follower-only chat: follow this channel to send messages";
  }
  if (minutes < 60) {
    return `⚠ Follower-only chat: you must have followed for at least ${pluralize(minutes, "minute")}`;
  }
  if (minutes < 1440) {
    return `⚠ Follower-only chat: you must have followed for at least ${pluralize(Math.round(minutes / 60), "hour")}`;
  }
  return `⚠ Follower-only chat: you must have followed for at least ${pluralize(Math.round(minutes / 1440), "day")}`;
}

interface FollowerModeWarningProps {
  followerModeMinutes: number | null;
  isFollowing: boolean | null;
  channelName: string;
  currentUsername: string;
}

function FollowerModeWarning({
  followerModeMinutes,
  isFollowing,
  channelName,
  currentUsername,
}: FollowerModeWarningProps) {
  if (followerModeMinutes === null || isFollowing !== false) return null;
  if (
    channelName &&
    currentUsername.toLowerCase() === channelName.toLowerCase()
  ) {
    return null;
  }
  return (
    <div
      className="warning"
      style={{
        color: "#9ca3af",
        fontSize: "0.8rem",
        padding: "4px 12px",
        borderTop: "1px solid #1e293b",
      }}
    >
      {followerModeMessage(followerModeMinutes)}
    </div>
  );
}

const MessageInput = forwardRef<MessageInputHandle, MessageInputProps>(
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
    emoteAutocompleteMode = "default",
  }: MessageInputProps,
  ref: React.ForwardedRef<MessageInputHandle>,
) {
  const { isModerator } = useModerationContext();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showEmotePicker, setShowEmotePicker] = useState(false);

  const onSend = useCallback(
    async (text: string) => {
      await onSendMessage(text, SELECTED_PLATFORMS, replyingTo?.id);
      setShowEmotePicker(false);
      if (onCancelReply) onCancelReply();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onSendMessage, replyingTo, onCancelReply],
  );

  const core = useChatInputCore({
    inputRef: textareaRef,
    chatMessages,
    currentUsername,
    isModerator,
    isLoading,
    replyingToId: replyingTo?.id,
    enableTwitchFeatures: true,
    emoteAutocompleteMode,
    slowModeWaitTime,
    onSend,
  });

  useImperativeHandle(
    ref,
    () => ({ insertMention: core.insertMention }),
    [core.insertMention],
  );

  const handleInsertPresetText = useCallback(
    (text: string) => {
      const el = textareaRef.current;
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
    [core.message, core.setMessage, textareaRef],
  );

  const isDisabled = SELECTED_PLATFORMS.length === 0 || isLoading;

  return (
    <div className="message-input">
      <ReplyIndicator replyingTo={replyingTo} onCancelReply={onCancelReply} />
      <div className="input-group twitch" style={{ position: "relative" }}>
        <PresetMessages
          onInsertText={handleInsertPresetText}
          isLoading={isLoading}
          emoteAutocompleteMode={emoteAutocompleteMode}
        />
        <button type="button"
          onClick={() => setShowEmotePicker(!showEmotePicker)}
          disabled={isDisabled}
          className="emote-picker-button"
          title="Browse emotes"
        >
          <FaSmile size={18} />
        </button>
        <textarea
          ref={textareaRef}
          value={core.message}
          onChange={core.handleChange}
          onKeyDown={core.handleKeyDown}
          onFocus={onInputFocus}
          placeholder="Send to Twitch..."
          aria-label="Send message to Twitch"
          disabled={isDisabled}
          className="message-textarea"
          autoComplete="off"
          autoCapitalize="off"
        />

        <ChatAutocomplete
          ac={core.emoteAC}
          menuRect={core.menuRect}
          menuRef={core.menuRef}
          renderItem={(emote, index, isSelected) => (
            <MenuItem
              key={`${emote.source}-${emote.name}`}
              index={index}
              isSelected={isSelected}
              onSelect={core.emoteAC.select}
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

        <ChatAutocomplete
          ac={core.usernameAC}
          menuRect={core.menuRect}
          menuRef={core.menuRef}
          renderItem={(username, index, isSelected) => (
            <MenuItem
              key={username}
              index={index}
              isSelected={isSelected}
              onSelect={core.usernameAC.select}
              style={{ fontSize: "0.95rem" }}
            >
              @{username}
            </MenuItem>
          )}
        />

        <ChatAutocomplete
          ac={core.commandAC}
          menuRect={core.menuRect}
          menuRef={core.menuRef}
          renderItem={(cmd, index, isSelected) => (
            <MenuItem
              key={cmd.name}
              index={index}
              isSelected={isSelected}
              onSelect={core.commandAC.select}
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
        emotes={core.emotesOrganized}
        onSelectEmote={(name) => {
          core.insertWithPrefix(name);
          setShowEmotePicker(false);
        }}
        isOpen={showEmotePicker}
        onClose={() => setShowEmotePicker(false)}
      />

      <FollowerModeWarning
        followerModeMinutes={followerModeMinutes}
        isFollowing={isFollowing}
        channelName={channelName}
        currentUsername={currentUsername}
      />

      {SELECTED_PLATFORMS.length === 0 && (
        <div className="warning">
          Select at least one platform to send messages
        </div>
      )}
    </div>
  );
  },
);

export default memo(MessageInput);
