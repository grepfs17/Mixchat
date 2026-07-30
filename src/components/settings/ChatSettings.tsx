import React from "react";
import type { SettingsItemDef } from "./types";

export interface ChatSettingsProps {
  unifyChatEnabled: boolean;
  onUnifyChatEnabledChange: (v: boolean) => void;
  useYoutubeEmbed: boolean;
  onUseYoutubeEmbedChange: (v: boolean) => void;
  showDeletedMessages: boolean;
  onShowDeletedMessagesChange: (v: boolean) => void;
  renderThirdPartyEmotesOnYoutube: boolean;
  onRenderThirdPartyEmotesOnYoutubeChange: (v: boolean) => void;
  compactActions: boolean;
  onCompactActionsChange: (v: boolean) => void;
  keepModActionsVisible: boolean;
  onKeepModActionsVisibleChange: (v: boolean) => void;
  modActionsFirst: boolean;
  onModActionsFirstChange: (v: boolean) => void;
  doubleClickConfirmModActions: boolean;
  onDoubleClickConfirmModActionsChange: (v: boolean) => void;
}

function UnifyChatsSetting({
  unifyChatEnabled,
  onUnifyChatEnabledChange,
}: Pick<ChatSettingsProps, "unifyChatEnabled" | "onUnifyChatEnabledChange">) {
  return (
    <div className="embed-config-section">
      <label className="embed-config-checkbox-label">
        <input
          type="checkbox"
          checked={unifyChatEnabled}
          onChange={(e) => onUnifyChatEnabledChange(e.target.checked)}
        />
        <span>Unify chats</span>
      </label>
      <p className="embed-config-description embed-config-description--indented">
        When enabled, Twitch and YouTube messages appear together in a single
        chronological feed. Each platform keeps its own styling and features.
      </p>
    </div>
  );
}

function YoutubeEmbedSetting({
  useYoutubeEmbed,
  onUseYoutubeEmbedChange,
}: Pick<ChatSettingsProps, "useYoutubeEmbed" | "onUseYoutubeEmbedChange">) {
  return (
    <div className="embed-config-section">
      <label className="embed-config-checkbox-label">
        <input
          type="checkbox"
          checked={useYoutubeEmbed}
          onChange={(e) => onUseYoutubeEmbedChange(e.target.checked)}
        />
        <span>Use official YouTube chat embed</span>
      </label>
      <p className="embed-config-description embed-config-description--indented">
        Replaces the custom YouTube chat with the official iframe embed. Note:
        This disables some features like custom emotes and unified chat for
        YouTube.
      </p>
    </div>
  );
}

function ShowDeletedSetting({
  showDeletedMessages,
  onShowDeletedMessagesChange,
}: Pick<
  ChatSettingsProps,
  "showDeletedMessages" | "onShowDeletedMessagesChange"
>) {
  return (
    <div className="embed-config-section">
      <label className="embed-config-checkbox-label">
        <input
          type="checkbox"
          checked={showDeletedMessages}
          onChange={(e) => onShowDeletedMessagesChange(e.target.checked)}
        />
        <span>Show deleted messages</span>
      </label>
      <p className="embed-config-description embed-config-description--indented">
        When enabled, deleted messages are hidden behind a click-to-reveal
        link. When disabled, they are removed from chat entirely.
      </p>
    </div>
  );
}

function ThirdPartyEmotesSetting({
  renderThirdPartyEmotesOnYoutube,
  onRenderThirdPartyEmotesOnYoutubeChange,
}: Pick<
  ChatSettingsProps,
  | "renderThirdPartyEmotesOnYoutube"
  | "onRenderThirdPartyEmotesOnYoutubeChange"
>) {
  return (
    <div className="embed-config-section">
      <label className="embed-config-checkbox-label">
        <input
          type="checkbox"
          checked={renderThirdPartyEmotesOnYoutube}
          onChange={(e) =>
            onRenderThirdPartyEmotesOnYoutubeChange(e.target.checked)
          }
        />
        <span>Render 7TV / BTTV / FFZ emotes in YouTube chat</span>
      </label>
      <p className="embed-config-description embed-config-description--indented">
        When enabled, any word in a YouTube chat message that matches a 7TV,
        BTTV, or FFZ emote name is rendered as an image. Uses the same emote
        set as the currently selected Twitch channel, so the scope is global +
        channel-specific just like Twitch chat. Only Mixchat users will see
        the emotes. The message is still sent as plain text on YouTube and
        other viewers see the raw names.
      </p>
    </div>
  );
}

function HideActionsSetting({
  compactActions,
  onCompactActionsChange,
  keepModActionsVisible,
  onKeepModActionsVisibleChange,
}: Pick<
  ChatSettingsProps,
  | "compactActions"
  | "onCompactActionsChange"
  | "keepModActionsVisible"
  | "onKeepModActionsVisibleChange"
>) {
  return (
    <div className="embed-config-section">
      <label className="embed-config-checkbox-label">
        <input
          type="checkbox"
          checked={compactActions}
          onChange={(e) => onCompactActionsChange(e.target.checked)}
        />
        <span>Hide inline action buttons</span>
      </label>
      <p className="embed-config-description embed-config-description--indented">
        When enabled, the small reply/copy/mod buttons are hidden from each
        message. You can still access all actions by right-clicking (long press
        on mobile) a message to open the context menu.
      </p>
      {compactActions && (
        <label className="embed-config-checkbox-label embed-config-checkbox-label--suboption">
          <input
            type="checkbox"
            checked={keepModActionsVisible}
            onChange={(e) =>
              onKeepModActionsVisibleChange(e.target.checked)
            }
          />
          <span>Keep mod actions visible</span>
        </label>
      )}
      {compactActions && (
        <p className="embed-config-description embed-config-description--indented">
          When enabled, moderator action buttons (delete, timeout, ban, warn)
          remain visible even when inline action buttons are hidden.
        </p>
      )}
    </div>
  );
}

function ModActionsFirstSetting({
  modActionsFirst,
  onModActionsFirstChange,
}: Pick<ChatSettingsProps, "modActionsFirst" | "onModActionsFirstChange">) {
  return (
    <div className="embed-config-section">
      <label className="embed-config-checkbox-label">
        <input
          type="checkbox"
          checked={modActionsFirst}
          onChange={(e) => onModActionsFirstChange(e.target.checked)}
        />
        <span>Show mod actions at the start of the message</span>
      </label>
      <p className="embed-config-description embed-config-description--indented">
        When enabled, the mod action buttons (delete, timeout, ban, warn)
        appear at the <strong>start</strong> of each message instead of the
        end, putting them before the timestamp, badges and author. Reply and
        copy buttons stay at the end. Only visible while moderator mode is on.
      </p>
    </div>
  );
}

function DoubleClickConfirmSetting({
  doubleClickConfirmModActions,
  onDoubleClickConfirmModActionsChange,
}: Pick<
  ChatSettingsProps,
  | "doubleClickConfirmModActions"
  | "onDoubleClickConfirmModActionsChange"
>) {
  return (
    <div className="embed-config-section">
      <label className="embed-config-checkbox-label">
        <input
          type="checkbox"
          checked={doubleClickConfirmModActions}
          onChange={(e) =>
            onDoubleClickConfirmModActionsChange(e.target.checked)
          }
        />
        <span>Double-click to confirm mod actions</span>
      </label>
      <p className="embed-config-description embed-config-description--indented">
        When enabled, you must double-click moderator action buttons (delete,
        timeout, ban, warn) to confirm the action. This helps prevent
        accidental moderation actions.
      </p>
    </div>
  );
}

export function getChatSettings(props: ChatSettingsProps): SettingsItemDef[] {
  return [
    {
      id: "unify-chats",
      group: "chat",
      label: "Unify chats",
      description:
        "Twitch and YouTube messages appear together in a single chronological feed",
      render: () => (
        <UnifyChatsSetting
          unifyChatEnabled={props.unifyChatEnabled}
          onUnifyChatEnabledChange={props.onUnifyChatEnabledChange}
        />
      ),
    },
    {
      id: "youtube-embed",
      group: "chat",
      label: "Use official YouTube chat embed",
      description:
        "Replaces the custom YouTube chat with the official iframe embed",
      render: () => (
        <YoutubeEmbedSetting
          useYoutubeEmbed={props.useYoutubeEmbed}
          onUseYoutubeEmbedChange={props.onUseYoutubeEmbedChange}
        />
      ),
    },
    {
      id: "show-deleted",
      group: "chat",
      label: "Show deleted messages",
      description:
        "Deleted messages are hidden behind a click-to-reveal link",
      render: () => (
        <ShowDeletedSetting
          showDeletedMessages={props.showDeletedMessages}
          onShowDeletedMessagesChange={props.onShowDeletedMessagesChange}
        />
      ),
    },
    {
      id: "render-third-party-emotes-on-youtube",
      group: "chat",
      label: "Render 7TV / BTTV / FFZ emotes in YouTube chat",
      description:
        "Resolve third-party emote names inside YouTube live chat messages as images",
      render: () => (
        <ThirdPartyEmotesSetting
          renderThirdPartyEmotesOnYoutube={
            props.renderThirdPartyEmotesOnYoutube
          }
          onRenderThirdPartyEmotesOnYoutubeChange={
            props.onRenderThirdPartyEmotesOnYoutubeChange
          }
        />
      ),
    },
    {
      id: "hide-inline-actions",
      group: "chat",
      label: "Hide inline action buttons",
      description:
        "The small reply/copy/mod buttons are hidden from each message",
      render: () => (
        <HideActionsSetting
          compactActions={props.compactActions}
          onCompactActionsChange={props.onCompactActionsChange}
          keepModActionsVisible={props.keepModActionsVisible}
          onKeepModActionsVisibleChange={props.onKeepModActionsVisibleChange}
        />
      ),
    },
    {
      id: "mod-actions-first",
      group: "chat",
      label: "Show mod actions at the start of the message",
      description:
        "Move the moderator action buttons (delete, timeout, ban, warn) to the start of the message, before the timestamp and badges",
      render: () => (
        <ModActionsFirstSetting
          modActionsFirst={props.modActionsFirst}
          onModActionsFirstChange={props.onModActionsFirstChange}
        />
      ),
    },
    {
      id: "double-click-confirm-mod-actions",
      group: "chat",
      label: "Double-click to confirm mod actions",
      description:
        "Require a double-click to confirm moderator actions (delete, timeout, ban, warn)",
      render: () => (
        <DoubleClickConfirmSetting
          doubleClickConfirmModActions={props.doubleClickConfirmModActions}
          onDoubleClickConfirmModActionsChange={
            props.onDoubleClickConfirmModActionsChange
          }
        />
      ),
    },
  ];
}
