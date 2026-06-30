import { loadEventSounds, saveEventSounds } from "./eventSoundStorage";
import { loadSettingsFromDrive, saveSettingsToDrive } from "./googleDrive";

const SETTINGS_KEYS = [
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
  "mixchat_hide_viewer_count",
  "mixchat_disable_mod_mode_by_default",
  "mixchat_hide_chat_timestamps",
  "mixchat_event_sound_volume",
  "mixchat_chat_split_ratio",
  "mixchat_watched_streamers",
  "mixchat_youtube_links",
  "disabled_emotes_v1",
  "mixchat_ignored_users",
];

const DRIVE_PERMISSION_HINT =
  'Drive access required. Click "Re-auth with Drive" below.';

function isDrivePermissionError(err: unknown): boolean {
  const message =
    err && typeof err === "object" && "message" in err
      ? String((err as { message?: unknown }).message ?? "")
      : "";
  return (
    message.includes("Drive permission") ||
    message.includes("insufficient") ||
    message.includes("sign in again")
  );
}

function driveErrorMessage(err: unknown, fallback: string): string {
  if (isDrivePermissionError(err)) return DRIVE_PERMISSION_HINT;
  return err instanceof Error ? err.message : fallback;
}

export type BackupResult =
  { ok: true; webViewLink?: string } | { ok: false; message: string };

export type RestoreResult =
  { ok: true; count: number } | { ok: false; message: string };

export async function backupSettingsToDrive(): Promise<BackupResult> {
  try {
    const eventSoundsData = await loadEventSounds();
    const settings: Record<string, string> = {};

    for (const k of SETTINGS_KEYS) {
      const v = localStorage.getItem(k);
      if (v !== null) settings[k] = v;
    }

    if (eventSoundsData && Object.keys(eventSoundsData).length > 0) {
      settings["mixchat_event_sounds"] = JSON.stringify(eventSoundsData);
    }

    const backup = {
      _version: 1,
      _app: "mixchat",
      _exportedAt: new Date().toISOString(),
      settings,
    };

    const result = await saveSettingsToDrive(JSON.stringify(backup, null, 2));
    return { ok: true, webViewLink: result.webViewLink };
  } catch (err) {
    return {
      ok: false,
      message: driveErrorMessage(err, "Failed to save to Drive"),
    };
  }
}

export async function restoreSettingsFromDrive(): Promise<RestoreResult> {
  try {
    const result = await loadSettingsFromDrive();
    let count = 0;
    for (const [key, value] of Object.entries(result.settings)) {
      if (key === "mixchat_event_sounds") {
        try {
          const sounds = JSON.parse(value);
          await saveEventSounds(sounds);
          count++;
        } catch {
          /* ignore */
        }
      } else {
        localStorage.setItem(key, value);
        count++;
      }
    }
    return { ok: true, count };
  } catch (err) {
    return {
      ok: false,
      message: driveErrorMessage(err, "Failed to load from Drive"),
    };
  }
}
