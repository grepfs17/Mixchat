import React from "react";
import type { MentionSoundType } from "../../hooks/chat/useTwitchChat";
import {
  playMentionSoundPreview,
  MENTION_SOUND_OPTIONS,
} from "../../hooks/chat/useTwitchChat";
import type { SettingsItemDef } from "./types";


export interface NotificationSettingsProps {
  mentionSoundEnabled: boolean;
  onMentionSoundEnabledChange: (v: boolean) => void;
  mentionVolume: number;
  onMentionVolumeChange: (v: number) => void;
  mentionSoundType: MentionSoundType;
  onMentionSoundTypeChange: (v: MentionSoundType) => void;
}


function MentionSoundSetting({
  mentionSoundEnabled,
  onMentionSoundEnabledChange,
  mentionVolume,
  onMentionVolumeChange,
  mentionSoundType,
  onMentionSoundTypeChange,
}: NotificationSettingsProps) {
  return (
    <div className="embed-config-section">
      <label className="embed-config-checkbox-label">
        <input
          type="checkbox"
          checked={mentionSoundEnabled}
          onChange={(e) => onMentionSoundEnabledChange(e.target.checked)}
        />
        <span>Play sound on mention</span>
      </label>
      <p className="embed-config-description embed-config-description--indented">
        Plays a notification sound when someone mentions your name or replies
        to your message.
      </p>
      {mentionSoundEnabled && (
        <div className="embed-config-mention-options">
          <div>
            <label
              className="embed-config-volume-label"
              htmlFor="embed-mention-volume"
            >
              Volume:{" "}
              <span className="embed-config-volume-value">
                {Math.round(mentionVolume * 100)}%
              </span>
            </label>
            <div className="embed-config-volume-row">
              <span className="embed-config-volume-bound">0%</span>
              <input
                id="embed-mention-volume"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={mentionVolume}
                onChange={(e) =>
                  onMentionVolumeChange(parseFloat(e.target.value))
                }
                className="embed-config-range"
              />
              <span className="embed-config-volume-bound">100%</span>
            </div>
          </div>
          <div>
            <span className="embed-config-sound-label" id="embed-sound-label">
              Sound
            </span>
            <div
              className="embed-config-sound-options"
              role="radiogroup"
              aria-labelledby="embed-sound-label"
            >
              {MENTION_SOUND_OPTIONS.map((opt) => (
                <button
                  type="button"
                  key={opt.value}
                  onClick={() => {
                    onMentionSoundTypeChange(opt.value);
                    playMentionSoundPreview(mentionVolume, opt.value);
                  }}
                  className={`embed-config-sound-btn${mentionSoundType === opt.value ? " embed-config-sound-btn--active" : ""}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="embed-config-sound-hint">
              Click a sound to preview it.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}


export function getNotificationSettings(
  props: NotificationSettingsProps,
): SettingsItemDef[] {
  return [
    {
      id: "mention-sound",
      group: "notifications",
      label: "Play sound on mention",
      description:
        "Plays a notification sound when someone mentions your name",
      render: () => <MentionSoundSetting {...props} />,
    },
  ];
}
