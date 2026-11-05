import React, { useRef, useState, useCallback } from "react";
import {
  FaPlay,
  FaTrash,
  FaUpload,
} from "react-icons/fa";
import type { SettingsItemDef } from "./types";
import { IS_DESKTOP } from "../../lib/constants";


export interface StreamerSettingsProps {
  streamerToolsEnabled: boolean;
  onStreamerToolsEnabledChange: (v: boolean) => void;
  hideViewerCount: boolean;
  onHideViewerCountChange: (v: boolean) => void;
  ignoredUsers: string[];
  onIgnoredUsersChange: (users: string[]) => void;
  eventSounds: Record<string, string>;
  onEventSoundChange: (eventType: string, soundData: string | null) => void;
  eventSoundVolume: number;
  onEventSoundVolumeChange: (v: number) => void;
}

const EVENT_SOUND_TYPES = [
  { key: "subscription", label: "New Subscription" },
  { key: "resub", label: "Resubscription" },
  { key: "subgift", label: "Gift Subscription" },
  { key: "redemption", label: "Channel Points Redemption" },
  { key: "highlight", label: "Highlighted Message" },
  { key: "raid", label: "Raid" },
  { key: "watch-streak", label: "Watch Streak" },
  { key: "announcement", label: "Announcement" },
  { key: "reward-gift", label: "Reward Gift" },
];


function StreamerToolsSetting({
  streamerToolsEnabled,
  onStreamerToolsEnabledChange,
}: Pick<
  StreamerSettingsProps,
  "streamerToolsEnabled" | "onStreamerToolsEnabledChange"
>) {
  return (
    <div className="embed-config-section">
      <label className="embed-config-checkbox-label">
        <input
          type="checkbox"
          checked={streamerToolsEnabled}
          onChange={(e) => onStreamerToolsEnabledChange(e.target.checked)}
        />
        <span>Streamer tools</span>
      </label>
      <p className="embed-config-description embed-config-description--indented">
        When enabled, a <strong>Streamer tools</strong> button appears in the
        chat header while you are viewing your own channel. It currently
        contains a <strong>Giveaway</strong> tool and a
        <strong> Music Player</strong> tool.
        {!IS_DESKTOP && (
          <>
            {" "}
            It also includes a <strong>Song Queue</strong> tool that lets
            chatters submit YouTube links in chat and follow along on a
            shareable public page.
          </>
        )}
      </p>
    </div>
  );
}

function HideViewerCountSetting({
  hideViewerCount,
  onHideViewerCountChange,
}: Pick<
  StreamerSettingsProps,
  "hideViewerCount" | "onHideViewerCountChange"
>) {
  return (
    <div className="embed-config-section">
      <label className="embed-config-checkbox-label">
        <input
          type="checkbox"
          checked={hideViewerCount}
          onChange={(e) => onHideViewerCountChange(e.target.checked)}
        />
        <span>Hide viewer count</span>
      </label>
      <p className="embed-config-description embed-config-description--indented">
        When enabled, the viewer count is hidden while viewing your own
        channel.
      </p>
    </div>
  );
}

function IgnoredUsersSetting({
  ignoredUsers,
  onIgnoredUsersChange,
}: Pick<StreamerSettingsProps, "ignoredUsers" | "onIgnoredUsersChange">) {
  const [ignoredUserInput, setIgnoredUserInput] = useState("");

  const addIgnoredUser = useCallback(() => {
    const username = ignoredUserInput.trim().toLowerCase();
    if (username && !ignoredUsers.includes(username)) {
      onIgnoredUsersChange([...ignoredUsers, username]);
      setIgnoredUserInput("");
    }
  }, [ignoredUserInput, ignoredUsers, onIgnoredUsersChange]);

  return (
    <div className="embed-config-section">
      <label
        className="embed-config-label"
        htmlFor="embed-ignored-user-input"
      >
        Ignored Users
      </label>
      <div className="embed-config-ignored-users-input-row">
        <input
          id="embed-ignored-user-input"
          type="text"
          className="embed-config-ignored-users-input"
          placeholder="Enter username..."
          aria-label="Enter username to ignore"
          value={ignoredUserInput}
          onChange={(e) => setIgnoredUserInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && ignoredUserInput.trim()) {
              addIgnoredUser();
            }
          }}
        />
        <button
          type="button"
          className="embed-config-ignored-users-add-btn"
          disabled={!ignoredUserInput.trim()}
          onClick={addIgnoredUser}
        >
          Add
        </button>
      </div>
      <p className="embed-config-description embed-config-description--indented">
        Messages from ignored users will be hidden from chat. A badge counter
        will show how many messages were ignored. This is meant to avoid seeing
        your own bots messages and let you center more in actual messages.
      </p>
      {ignoredUsers.length > 0 && (
        <div className="embed-config-ignored-users-list">
          {ignoredUsers.map((user) => (
            <div key={user} className="embed-config-ignored-user-item">
              <span className="embed-config-ignored-user-name">{user}</span>
              <button
                type="button"
                className="embed-config-ignored-user-remove"
                onClick={() =>
                  onIgnoredUsersChange(
                    ignoredUsers.filter((u) => u !== user),
                  )
                }
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EventSoundsSetting({
  eventSounds,
  onEventSoundChange,
  eventSoundVolume,
  onEventSoundVolumeChange,
}: Pick<
  StreamerSettingsProps,
  | "eventSounds"
  | "onEventSoundChange"
  | "eventSoundVolume"
  | "onEventSoundVolumeChange"
>) {
  const soundFileInputRef = useRef<HTMLInputElement>(null);
  const currentEventTypeRef = useRef<string>("");
  const [eventSoundsCollapsed, setEventSoundsCollapsed] = useState(true);

  const playEventSound = useCallback(
    (eventType: string) => {
      const soundData = eventSounds[eventType];
      if (!soundData) return;
      const audio = new Audio(soundData);
      audio.volume = Math.max(0, Math.min(1, eventSoundVolume));
      audio.play().catch(() => {});
    },
    [eventSounds, eventSoundVolume],
  );

  const removeEventSound = useCallback(
    (eventType: string) => {
      onEventSoundChange(eventType, null);
    },
    [onEventSoundChange],
  );

  const handleSoundFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !currentEventTypeRef.current) return;

      if (!file.type.startsWith("audio/")) {
        alert("Please select a valid audio file.");
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        alert("Audio file must be less than 5MB.");
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        onEventSoundChange(currentEventTypeRef.current, dataUrl);
        currentEventTypeRef.current = "";
      };
      reader.readAsDataURL(file);
      e.target.value = "";
    },
    [onEventSoundChange],
  );

  return (
    <div className="embed-config-section">
      <button
        type="button"
        className="embed-config-event-sounds-header"
        onClick={() => setEventSoundsCollapsed((v) => !v)}
      >
        <div
          style={{ display: "flex", alignItems: "center", gap: "8px" }}
        >
          <span
            className="embed-config-label embed-config-label--clickable"
            id="embed-event-sounds-label"
          >
            Event Sounds
          </span>
          {Object.keys(eventSounds).length > 0 && (
            <span className="embed-config-event-sounds-count">
              {Object.keys(eventSounds).length}
            </span>
          )}
        </div>
        <svg
          className={`embed-config-group-chevron${eventSoundsCollapsed ? " embed-config-group-chevron--collapsed" : ""}`}
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M2.5 4.5L6 8L9.5 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <p className="embed-config-description">
        Upload custom sounds for different chat events. Sounds play
        automatically when these events occur.
      </p>
      {!eventSoundsCollapsed && (
        <div className="embed-config-event-sounds">
          <div
            className="embed-config-section"
            style={{ padding: "0 0 8px" }}
          >
            <label
              className="embed-config-volume-label"
              htmlFor="embed-event-sound-volume"
            >
              Volume:{" "}
              <span className="embed-config-volume-value">
                {Math.round(eventSoundVolume * 100)}%
              </span>
            </label>
            <div className="embed-config-volume-row">
              <span className="embed-config-volume-bound">0%</span>
              <input
                id="embed-event-sound-volume"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={eventSoundVolume}
                onChange={(e) =>
                  onEventSoundVolumeChange(parseFloat(e.target.value))
                }
                className="embed-config-range"
              />
              <span className="embed-config-volume-bound">100%</span>
            </div>
          </div>
          {EVENT_SOUND_TYPES.map(({ key, label }) => {
            const hasSound = !!eventSounds[key];
            return (
              <div key={key} className="embed-config-event-sound-item">
                <span className="embed-config-event-sound-label">
                  {label}
                </span>
                <div className="embed-config-event-sound-actions">
                  {hasSound ? (
                    <>
                      <button
                        type="button"
                        onClick={() => playEventSound(key)}
                        className="embed-config-event-sound-btn embed-config-event-sound-btn--play"
                        title="Play sound"
                      >
                        <FaPlay size={10} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeEventSound(key)}
                        className="embed-config-event-sound-btn embed-config-event-sound-btn--remove"
                        title="Remove sound"
                      >
                        <FaTrash size={10} />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        currentEventTypeRef.current = key;
                        soundFileInputRef.current?.click();
                      }}
                      className="embed-config-event-sound-btn embed-config-event-sound-btn--upload"
                    >
                      <FaUpload size={10} /> Upload
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <input
        ref={soundFileInputRef}
        type="file"
        accept="audio/*"
        onChange={handleSoundFileUpload}
        style={{ display: "none" }}
      />
    </div>
  );
}


export function getStreamerSettings(
  props: StreamerSettingsProps,
): SettingsItemDef[] {
  return [
    {
      id: "streamer-tools",
      group: "streamer",
      label: "Streamer tools",
      description:
        "Show a Streamer tools button on your own channel with moderation helpers like giveaways",
      render: () => (
        <StreamerToolsSetting
          streamerToolsEnabled={props.streamerToolsEnabled}
          onStreamerToolsEnabledChange={props.onStreamerToolsEnabledChange}
        />
      ),
    },
    {
      id: "hide-viewer-count",
      group: "streamer",
      label: "Hide viewer count",
      description:
        "The viewer count is hidden while viewing your own channel",
      render: () => (
        <HideViewerCountSetting
          hideViewerCount={props.hideViewerCount}
          onHideViewerCountChange={props.onHideViewerCountChange}
        />
      ),
    },
    {
      id: "ignored-users",
      group: "streamer",
      label: "Ignored Users",
      description:
        "Hide messages from specific users and show a badge counter instead",
      render: () => (
        <IgnoredUsersSetting
          ignoredUsers={props.ignoredUsers}
          onIgnoredUsersChange={props.onIgnoredUsersChange}
        />
      ),
    },
    {
      id: "event-sounds",
      group: "streamer",
      label: "Event Sounds",
      description: "Upload custom sounds for different chat events",
      render: () => (
        <EventSoundsSetting
          eventSounds={props.eventSounds}
          onEventSoundChange={props.onEventSoundChange}
          eventSoundVolume={props.eventSoundVolume}
          onEventSoundVolumeChange={props.onEventSoundVolumeChange}
        />
      ),
    },
  ];
}
