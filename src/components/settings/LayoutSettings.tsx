import React from "react";
import type { SettingsItemDef } from "./types";


export interface LayoutSettingsProps {
  embedDefaultOpen: boolean;
  onEmbedDefaultOpenChange: (v: boolean) => void;
  defaultPlayerType: "embed" | "m3u8";
  onDefaultPlayerTypeChange: (v: "embed" | "m3u8") => void;
  defaultHlsQuality: string;
  onDefaultHlsQualityChange: (v: string) => void;
  onNeedsReload: () => void;
}

function EmbedDefaultSetting({
  embedDefaultOpen,
  onEmbedDefaultOpenChange,
}: Pick<LayoutSettingsProps, "embedDefaultOpen" | "onEmbedDefaultOpenChange">) {
  return (
    <div className="embed-config-section">
      <label className="embed-config-checkbox-label">
        <input
          type="checkbox"
          checked={embedDefaultOpen}
          onChange={(e) => onEmbedDefaultOpenChange(e.target.checked)}
        />
        <span>Open stream embed by default</span>
      </label>
      <p className="embed-config-description embed-config-description--indented">
        If enabled, the stream embed will be visible when you open Mixchat. If
        disabled, the chat will take up the full width.
      </p>
    </div>
  );
}

function DefaultPlayerSetting({
  defaultPlayerType,
  onDefaultPlayerTypeChange,
  onNeedsReload,
}: Pick<
  LayoutSettingsProps,
  "defaultPlayerType" | "onDefaultPlayerTypeChange" | "onNeedsReload"
>) {
  return (
    <div className="embed-config-section">
      <label className="embed-config-label" htmlFor="embed-default-player">
        Default player
      </label>
      <select
        id="embed-default-player"
        value={defaultPlayerType}
        onChange={(e) => {
          onDefaultPlayerTypeChange(e.target.value as "embed" | "m3u8");
          onNeedsReload();
        }}
        className="embed-config-select"
      >
        <option value="embed">Twitch</option>
        <option value="m3u8">M3U8 (experimental)</option>
      </select>
      <p className="embed-config-description">
        Twitch uses the official embed player. M3U8 plays the raw video stream
        directly and uses less bandwidth, but is experimental.
      </p>
    </div>
  );
}

function HlsQualitySetting({
  defaultHlsQuality,
  onDefaultHlsQualityChange,
}: Pick<LayoutSettingsProps, "defaultHlsQuality" | "onDefaultHlsQualityChange">) {
  return (
    <div className="embed-config-section">
      <label className="embed-config-label" htmlFor="embed-hls-quality">
        Default HLS resolution
      </label>
      <select
        id="embed-hls-quality"
        value={defaultHlsQuality}
        onChange={(e) => onDefaultHlsQualityChange(e.target.value)}
        className="embed-config-select"
      >
        <option value="highest">Highest available</option>
        <option value="1080p">1080p</option>
        <option value="720p">720p</option>
        <option value="480p">480p</option>
        <option value="360p">360p</option>
        <option value="160p">160p</option>
        <option value="audio_only">Audio only</option>
      </select>
      <p className="embed-config-description">
        Default resolution for the M3U8 player. Falls back to the closest
        available quality if the exact resolution is not available.
      </p>
    </div>
  );
}


export function getLayoutSettings(
  props: LayoutSettingsProps,
): SettingsItemDef[] {
  return [
    {
      id: "embed-default",
      group: "layout",
      label: "Open stream embed by default",
      description: "The stream embed will be visible when you open Mixchat",
      render: () => (
        <EmbedDefaultSetting
          embedDefaultOpen={props.embedDefaultOpen}
          onEmbedDefaultOpenChange={props.onEmbedDefaultOpenChange}
        />
      ),
    },
    {
      id: "default-player",
      group: "layout",
      label: "Default player",
      description:
        "Choose which player to use for Twitch streams. M3U8 (HLS) uses less bandwidth and avoids third-party cookies.",
      render: () => (
        <DefaultPlayerSetting
          defaultPlayerType={props.defaultPlayerType}
          onDefaultPlayerTypeChange={props.onDefaultPlayerTypeChange}
          onNeedsReload={props.onNeedsReload}
        />
      ),
    },
    {
      id: "default-hls-quality",
      group: "layout",
      label: "Default HLS resolution",
      description: "When using the M3U8 player, start with this resolution.",
      render: () => (
        <HlsQualitySetting
          defaultHlsQuality={props.defaultHlsQuality}
          onDefaultHlsQualityChange={props.onDefaultHlsQualityChange}
        />
      ),
    },
  ];
}
