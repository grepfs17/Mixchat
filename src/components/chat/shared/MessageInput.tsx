import React, { useState, useRef, memo, useCallback } from "react";
import { FaTimes, FaSmile } from "react-icons/fa";
import type { Platform, TwitchMessage, EmoteAutocompleteMode } from "../../../lib/types";
import { useModerationContext } from "../../../contexts/ModerationContext";
import EmoteMenu from "../../EmoteMenu";
import PresetMessages from "./PresetMessages";
import AutocompleteMenu, { MenuItem } from "./AutocompleteMenu";
import { useChatInputCore } from "../../../hooks/chat/useChatInputCore";

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
}: MessageInputProps) {
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

  return (
    <div className="message-input">
      {replyingTo && (
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
      )}
      <div className="input-group twitch" style={{ position: "relative" }}>
        <PresetMessages
          onSendMessage={onSendMessage}
          isLoading={isLoading}
          selectedPlatforms={SELECTED_PLATFORMS}
          replyingTo={replyingTo}
          onCancelReply={onCancelReply}
          emoteAutocompleteMode={emoteAutocompleteMode}
        />
        <button type="button"
          onClick={() => setShowEmotePicker(!showEmotePicker)}
          disabled={SELECTED_PLATFORMS.length === 0 || isLoading}
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
          disabled={SELECTED_PLATFORMS.length === 0 || isLoading}
          className="message-textarea"
          autoComplete="off"
          autoCapitalize="off"
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

      {SELECTED_PLATFORMS.length === 0 && (
        <div className="warning">
          Select at least one platform to send messages
        </div>
      )}
    </div>
  );
}

export default memo(MessageInput);
