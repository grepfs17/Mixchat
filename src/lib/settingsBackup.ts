/**
 * Settings backup/restore utility.
 * Exports user settings as a JSON file and imports them back.
 * No server-side storage — the user owns their data.
 */

import { loadEventSounds, saveEventSounds } from "./eventSoundStorage";

const BACKUP_VERSION = 1;

/** Keys that represent user preferences (not auth tokens, not caches). */
export const SETTINGS_KEYS = [
  "mixchat_video_ratio",
  "mixchat_favorite_channels",
  "mixchat_embed_default_open",
  "mixchat_unify_chat",
  "mixchat_split_chat",
  "mixchat_use_youtube_embed",
  "mixchat_font_size",
  "mixchat_chat_font",
  "mixchat_chat_theme",
  "mixchat_mention_sound",
  "mixchat_mention_volume",
  "mixchat_mention_sound_type",
  "mixchat_show_deleted_messages",
  "mixchat_compact_actions",
  "mixchat_keep_mod_actions_visible",
  "mixchat_mod_actions_first",
  "mixchat_double_click_confirm_mod_actions",
  "mixchat_hide_viewer_count",
  "mixchat_hide_chat_timestamps",
  "mixchat_event_sound_volume",
  "mixchat_chat_split_ratio",
  "mixchat_watched_streamers",
  "mixchat_youtube_links",
  "mixchat_streamer_tools_enabled",
  "mixchat_ignored_users",
  "mixchat_mod_mode_targets",
  "mixchat_default_player_type",
  "mixchat_default_hls_quality",
  "disabled_emotes_v1",
] as const;

interface SettingsBackup {
  _version: number;
  _app: string;
  _exportedAt: string;
  settings: Record<string, string>;
}

function readSettings(): Record<string, string> {
  const data: Record<string, string> = {};
  for (const key of SETTINGS_KEYS) {
    const value = localStorage.getItem(key);
    if (value !== null) {
      data[key] = value;
    }
  }
  return data;
}

function writeSettings(settings: Record<string, string>): number {
  let count = 0;
  for (const [key, value] of Object.entries(settings)) {
    if (SETTINGS_KEYS.includes(key as (typeof SETTINGS_KEYS)[number])) {
      localStorage.setItem(key, value);
      count++;
    }
  }
  return count;
}

/**
 * Export all user settings to a downloadable JSON file.
 * Event sounds are read from IndexedDB and included in the backup.
 */
export async function exportSettings(): Promise<void> {
  const settings = readSettings();
  const eventSounds = await loadEventSounds();
  if (eventSounds && Object.keys(eventSounds).length > 0) {
    settings["mixchat_event_sounds"] = JSON.stringify(eventSounds);
  }

  const backup: SettingsBackup = {
    _version: BACKUP_VERSION,
    _app: "mixchat",
    _exportedAt: new Date().toISOString(),
    settings,
  };

  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `mixchat-settings-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import settings from a JSON file.
 * Returns the number of settings restored, or -1 on error.
 * Event sounds are written to IndexedDB.
 */
export function importSettings(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result as string) as SettingsBackup;

        if (parsed._app !== "mixchat") {
          reject(new Error("This file is not a Mixchat settings backup."));
          return;
        }

        if (!parsed.settings || typeof parsed.settings !== "object") {
          reject(new Error("Invalid backup file format."));
          return;
        }

        let count = writeSettings(parsed.settings);

        if (parsed.settings["mixchat_event_sounds"]) {
          try {
            const sounds = JSON.parse(parsed.settings["mixchat_event_sounds"]);
            await saveEventSounds(sounds);
            count++;
          } catch {
            // ignore malformed event sounds
          }
        }

        resolve(count);
      } catch (e) {
        reject(new Error("Failed to parse settings file."));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsText(file);
  });
}
