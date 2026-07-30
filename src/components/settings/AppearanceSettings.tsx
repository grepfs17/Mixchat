import React from "react";
import type { ChatFont, ChatTheme } from "../../lib/types";
import {
  FONT_FAMILY_MAP,
  CHAT_FONT_OPTIONS,
  THEME_OPTIONS,
} from "../../lib/types";
import type { SettingsItemDef } from "./types";


export interface AppearanceSettingsProps {
  fontSize: number;
  onFontSizeChange: (v: number) => void;
  chatFont: ChatFont;
  onChatFontChange: (v: ChatFont) => void;
  chatTheme: ChatTheme;
  onChatThemeChange: (v: ChatTheme) => void;
  splitChatEnabled: boolean;
  onSplitChatEnabledChange: (v: boolean) => void;
  hideChatTimestamps: boolean;
  onHideChatTimestampsChange: (v: boolean) => void;
}


function FontSizeSetting({
  fontSize,
  onFontSizeChange,
}: Pick<AppearanceSettingsProps, "fontSize" | "onFontSizeChange">) {
  return (
    <div className="embed-config-section">
      <label className="embed-config-label" htmlFor="embed-font-size">
        Chat Font Size:{" "}
        <span className="embed-config-value">{fontSize}px</span>
      </label>
      <div className="embed-config-range-row">
        <span className="embed-config-range-bound">12px</span>
        <input
          id="embed-font-size"
          type="range"
          min="12"
          max="32"
          step="1"
          value={fontSize}
          onChange={(e) => onFontSizeChange(parseInt(e.target.value))}
          className="embed-config-range"
        />
        <span className="embed-config-range-bound">32px</span>
      </div>
      <p className="embed-config-description">
        Adjust the size of the text in the chat window.
      </p>
    </div>
  );
}

function ChatFontSetting({
  chatFont,
  onChatFontChange,
}: Pick<AppearanceSettingsProps, "chatFont" | "onChatFontChange">) {
  return (
    <div className="embed-config-section">
      <label className="embed-config-label" htmlFor="embed-chat-font">
        Chat Font
      </label>
      <select
        id="embed-chat-font"
        value={chatFont}
        onChange={(e) => onChatFontChange(e.target.value as ChatFont)}
        className="embed-config-select"
        style={{ fontFamily: FONT_FAMILY_MAP[chatFont] }}
      >
        {CHAT_FONT_OPTIONS.map(({ value, label }) => (
          <option
            key={value}
            value={value}
            style={{ fontFamily: FONT_FAMILY_MAP[value] }}
          >
            {label}
          </option>
        ))}
      </select>
      <p className="embed-config-description">
        Choose the font used in the chat window.
      </p>
    </div>
  );
}

function ChatThemeSetting({
  chatTheme,
  onChatThemeChange,
}: Pick<AppearanceSettingsProps, "chatTheme" | "onChatThemeChange">) {
  let lastSection = "";
  return (
    <div className="embed-config-section">
      <span className="embed-config-label" id="embed-chat-theme-label">
        Chat Theme
      </span>
      <div
        className="embed-config-theme-grid"
        role="radiogroup"
        aria-labelledby="embed-chat-theme-label"
      >
        {THEME_OPTIONS.map(({ value, label, preview, section }) => {
          const showSection = section && section !== lastSection;
          lastSection = section || lastSection;
          return (
            <React.Fragment key={value}>
              {showSection && (
                <div className="embed-config-theme-section">{section}</div>
              )}
              <button
                type="button"
                onClick={() => onChatThemeChange(value as ChatTheme)}
                className={`embed-config-theme-btn${chatTheme === value ? " embed-config-theme-btn--active" : ""}`}
              >
                <div className="embed-config-theme-preview">
                  <div
                    className="embed-config-theme-preview-bg"
                    style={{ backgroundColor: preview.bg }}
                  />
                  <div
                    className="embed-config-theme-preview-hover"
                    style={{ backgroundColor: preview.hover }}
                  />
                  <div
                    className="embed-config-theme-preview-accent"
                    style={{ backgroundColor: preview.accent }}
                  />
                </div>
                <span className="embed-config-theme-label">{label}</span>
                {chatTheme === value && (
                  <span className="embed-config-theme-check">✓</span>
                )}
              </button>
            </React.Fragment>
          );
        })}
      </div>
      <p className="embed-config-description">
        Choose the background and hover colors for chat messages.
      </p>
    </div>
  );
}

function SplitChatSetting({
  splitChatEnabled,
  onSplitChatEnabledChange,
}: Pick<
  AppearanceSettingsProps,
  "splitChatEnabled" | "onSplitChatEnabledChange"
>) {
  return (
    <div className="embed-config-section">
      <label className="embed-config-checkbox-label">
        <input
          type="checkbox"
          checked={splitChatEnabled}
          onChange={(e) => onSplitChatEnabledChange(e.target.checked)}
        />
        <span>Split chat</span>
      </label>
      <p className="embed-config-description embed-config-description--indented">
        When enabled, messages show a subtle darker background to visually
        separate each message.
      </p>
    </div>
  );
}

function HideTimestampsSetting({
  hideChatTimestamps,
  onHideChatTimestampsChange,
}: Pick<
  AppearanceSettingsProps,
  "hideChatTimestamps" | "onHideChatTimestampsChange"
>) {
  return (
    <div className="embed-config-section">
      <label className="embed-config-checkbox-label">
        <input
          type="checkbox"
          checked={hideChatTimestamps}
          onChange={(e) => onHideChatTimestampsChange(e.target.checked)}
        />
        <span>Hide chat timestamps</span>
      </label>
      <p className="embed-config-description embed-config-description--indented">
        When enabled, the time a message was sent will be hidden.
      </p>
    </div>
  );
}

export function getAppearanceSettings(
  props: AppearanceSettingsProps,
): SettingsItemDef[] {
  return [
    {
      id: "font-size",
      group: "appearance",
      label: "Chat Font Size",
      description: "Adjust the size of the text in the chat window",
      render: () => (
        <FontSizeSetting
          fontSize={props.fontSize}
          onFontSizeChange={props.onFontSizeChange}
        />
      ),
    },
    {
      id: "chat-font",
      group: "appearance",
      label: "Chat Font",
      description: "Choose the font used in the chat window",
      render: () => (
        <ChatFontSetting
          chatFont={props.chatFont}
          onChatFontChange={props.onChatFontChange}
        />
      ),
    },
    {
      id: "chat-theme",
      group: "appearance",
      label: "Chat Theme",
      description:
        "Choose the background and hover colors for chat messages",
      render: () => (
        <ChatThemeSetting
          chatTheme={props.chatTheme}
          onChatThemeChange={props.onChatThemeChange}
        />
      ),
    },
    {
      id: "split-chat",
      group: "appearance",
      label: "Split chat",
      description:
        "Messages show a subtle darker background to visually separate each message",
      render: () => (
        <SplitChatSetting
          splitChatEnabled={props.splitChatEnabled}
          onSplitChatEnabledChange={props.onSplitChatEnabledChange}
        />
      ),
    },
    {
      id: "hide-timestamps",
      group: "appearance",
      label: "Hide chat timestamps",
      description: "The time a message was sent will be hidden",
      render: () => (
        <HideTimestampsSetting
          hideChatTimestamps={props.hideChatTimestamps}
          onHideChatTimestampsChange={props.onHideChatTimestampsChange}
        />
      ),
    },
  ];
}
