import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  backupSettingsToDrive,
  restoreSettingsFromDrive,
} from "../../src/lib/driveSync";
import * as googleDrive from "../../src/lib/googleDrive";
import * as eventSoundStorage from "../../src/lib/eventSoundStorage";

vi.mock("../../src/lib/googleDrive", () => ({
  saveSettingsToDrive: vi.fn(),
  loadSettingsFromDrive: vi.fn(),
}));

vi.mock("../../src/lib/eventSoundStorage", () => ({
  loadEventSounds: vi.fn().mockResolvedValue(null),
  saveEventSounds: vi.fn().mockResolvedValue(undefined),
}));

const mockSave = vi.mocked(googleDrive.saveSettingsToDrive);
const mockLoad = vi.mocked(googleDrive.loadSettingsFromDrive);
const mockLoadSounds = vi.mocked(eventSoundStorage.loadEventSounds);
const mockSaveSounds = vi.mocked(eventSoundStorage.saveEventSounds);

// Helper: parse the JSON that backupSettingsToDrive passes to saveSettingsToDrive
function parseBackup(json: string) {
  return JSON.parse(json) as {
    _version: number;
    _app: string;
    _exportedAt: string;
    settings: Record<string, string>;
  };
}

describe("driveSync", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockSave.mockResolvedValue({ fileId: "abc" });
    mockSaveSounds.mockResolvedValue(undefined);
  });

  // ─── backupSettingsToDrive ──────────────────────────────────────────────

  describe("backupSettingsToDrive", () => {
    it("reads settings from versioned :v1 keys", async () => {
      localStorage.setItem(
        "mixchat_favorite_channels:v1",
        JSON.stringify(["channel1"]),
      );
      localStorage.setItem("mixchat_font_size", "20");
      localStorage.setItem(
        "mixchat_watched_streamers:v1",
        JSON.stringify(["streamer1"]),
      );
      localStorage.setItem(
        "mixchat_youtube_links:v1",
        JSON.stringify([{ id: "abc" }]),
      );

      const result = await backupSettingsToDrive();

      expect(result.ok).toBe(true);
      expect(mockSave).toHaveBeenCalledTimes(1);

      const backup = parseBackup(mockSave.mock.calls[0][0]);
      expect(backup._app).toBe("mixchat");
      expect(backup.settings["mixchat_favorite_channels:v1"]).toBe(
        JSON.stringify(["channel1"]),
      );
      expect(backup.settings["mixchat_font_size"]).toBe("20");
      expect(backup.settings["mixchat_watched_streamers:v1"]).toBe(
        JSON.stringify(["streamer1"]),
      );
      expect(backup.settings["mixchat_youtube_links:v1"]).toBe(
        JSON.stringify([{ id: "abc" }]),
      );
    });

    it("includes event sounds when present", async () => {
      mockLoadSounds.mockResolvedValue({
        subscription: "data:audio/mp3;base64,abc123",
      });

      const result = await backupSettingsToDrive();

      expect(result.ok).toBe(true);
      const backup = parseBackup(mockSave.mock.calls[0][0]);
      expect(backup.settings["mixchat_event_sounds"]).toBe(
        JSON.stringify({ subscription: "data:audio/mp3;base64,abc123" }),
      );
    });

    it("does not include event sounds when empty", async () => {
      mockLoadSounds.mockResolvedValue({});

      const result = await backupSettingsToDrive();

      expect(result.ok).toBe(true);
      const backup = parseBackup(mockSave.mock.calls[0][0]);
      expect(backup.settings["mixchat_event_sounds"]).toBeUndefined();
    });

    it("does not read from old unversioned keys", async () => {
      // Data only at old key, app should not find it
      localStorage.setItem(
        "mixchat_favorite_channels",
        JSON.stringify(["old"]),
      );

      await backupSettingsToDrive();

      const backup = parseBackup(mockSave.mock.calls[0][0]);
      // Neither the old key nor the :v1 key should be in the backup
      expect(backup.settings["mixchat_favorite_channels"]).toBeUndefined();
      expect(
        backup.settings["mixchat_favorite_channels:v1"],
      ).toBeUndefined();
    });

    it("includes newly-added backup keys (giveaway_history, past_playlists, notified_streamers)", async () => {
      localStorage.setItem(
        "mixchat_giveaway_history:v1",
        JSON.stringify([{ winner: "alice" }]),
      );
      localStorage.setItem(
        "mixchat_song_queue_past_playlists:v1",
        JSON.stringify([{ name: "playlist1" }]),
      );
      localStorage.setItem(
        "mixchat_notified_streamers:v1",
        JSON.stringify(["streamerX"]),
      );

      await backupSettingsToDrive();

      const backup = parseBackup(mockSave.mock.calls[0][0]);
      expect(backup.settings["mixchat_giveaway_history:v1"]).toBe(
        JSON.stringify([{ winner: "alice" }]),
      );
      expect(backup.settings["mixchat_song_queue_past_playlists:v1"]).toBe(
        JSON.stringify([{ name: "playlist1" }]),
      );
      expect(backup.settings["mixchat_notified_streamers:v1"]).toBe(
        JSON.stringify(["streamerX"]),
      );
    });

    it("returns error on Drive permission failure", async () => {
      mockSave.mockRejectedValue(
        new Error("Drive permission insufficient scope"),
      );

      const result = await backupSettingsToDrive();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain("Re-auth with Drive");
      }
    });

    it("returns error on generic failure", async () => {
      mockSave.mockRejectedValue(new Error("Network down"));

      const result = await backupSettingsToDrive();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toBe("Network down");
      }
    });

    it("returns webViewLink from Drive result", async () => {
      mockSave.mockResolvedValue({
        fileId: "abc",
        webViewLink: "https://drive.google.com/file/abc",
      });

      const result = await backupSettingsToDrive();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.webViewLink).toBe(
          "https://drive.google.com/file/abc",
        );
      }
    });
  });

  // ─── restoreSettingsFromDrive ───────────────────────────────────────────

  describe("restoreSettingsFromDrive", () => {
    it("restores settings and writes to resolved :v1 keys", async () => {
      mockLoad.mockResolvedValue({
        settings: {
          "mixchat_favorite_channels:v1": JSON.stringify(["ch1"]),
          "mixchat_watched_streamers:v1": JSON.stringify(["s1"]),
          "mixchat_youtube_links:v1": JSON.stringify([{ id: "link1" }]),
          mixchat_font_size: "18",
        },
        exportedAt: new Date().toISOString(),
        version: 1,
      });

      const result = await restoreSettingsFromDrive();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.count).toBe(4);
      }
      expect(localStorage.getItem("mixchat_favorite_channels:v1")).toBe(
        JSON.stringify(["ch1"]),
      );
      expect(localStorage.getItem("mixchat_watched_streamers:v1")).toBe(
        JSON.stringify(["s1"]),
      );
      expect(localStorage.getItem("mixchat_youtube_links:v1")).toBe(
        JSON.stringify([{ id: "link1" }]),
      );
      expect(localStorage.getItem("mixchat_font_size")).toBe("18");
    });

    it("maps old unversioned key names to :v1 on restore", async () => {
      mockLoad.mockResolvedValue({
        settings: {
          mixchat_favorite_channels: JSON.stringify(["old_channel"]),
          mixchat_watched_streamers: JSON.stringify(["old_streamer"]),
          mixchat_youtube_links: JSON.stringify([{ id: "old" }]),
          mixchat_giveaway_history: JSON.stringify([{ winner: "bob" }]),
          mixchat_song_queue_past_playlists: JSON.stringify([
            { name: "pl" },
          ]),
          mixchat_notified_streamers: JSON.stringify(["ns1"]),
          mixchat_font_size: "22",
        },
        exportedAt: new Date().toISOString(),
        version: 1,
      });

      const result = await restoreSettingsFromDrive();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.count).toBe(7);
      }
      // All mapped to :v1 keys
      expect(localStorage.getItem("mixchat_favorite_channels:v1")).toBe(
        JSON.stringify(["old_channel"]),
      );
      expect(localStorage.getItem("mixchat_watched_streamers:v1")).toBe(
        JSON.stringify(["old_streamer"]),
      );
      expect(localStorage.getItem("mixchat_youtube_links:v1")).toBe(
        JSON.stringify([{ id: "old" }]),
      );
      expect(localStorage.getItem("mixchat_giveaway_history:v1")).toBe(
        JSON.stringify([{ winner: "bob" }]),
      );
      expect(
        localStorage.getItem("mixchat_song_queue_past_playlists:v1"),
      ).toBe(JSON.stringify([{ name: "pl" }]));
      expect(
        localStorage.getItem("mixchat_notified_streamers:v1"),
      ).toBe(JSON.stringify(["ns1"]));
      // Unversioned keys should NOT be written
      expect(
        localStorage.getItem("mixchat_favorite_channels"),
      ).toBeNull();
      expect(
        localStorage.getItem("mixchat_watched_streamers"),
      ).toBeNull();
    });

    it("saves event sounds from backup (old key name)", async () => {
      mockLoad.mockResolvedValue({
        settings: {
          mixchat_event_sounds: JSON.stringify({
            sub: "data:audio/mp3;base64,xyz",
          }),
          mixchat_font_size: "16",
        },
        exportedAt: new Date().toISOString(),
        version: 1,
      });

      const result = await restoreSettingsFromDrive();

      expect(result.ok).toBe(true);
      expect(mockSaveSounds).toHaveBeenCalledWith({
        sub: "data:audio/mp3;base64,xyz",
      });
      // font_size should also be restored
      expect(localStorage.getItem("mixchat_font_size")).toBe("16");
    });

    it("saves event sounds from backup (:v1 key name)", async () => {
      mockLoad.mockResolvedValue({
        settings: {
          "mixchat_event_sounds:v1": JSON.stringify({
            sub: "data:audio/mp3;base64,v1data",
          }),
        },
        exportedAt: new Date().toISOString(),
        version: 1,
      });

      const result = await restoreSettingsFromDrive();

      expect(result.ok).toBe(true);
      expect(mockSaveSounds).toHaveBeenCalledWith({
        sub: "data:audio/mp3;base64,v1data",
      });
    });

    it("ignores malformed event sounds in backup", async () => {
      mockLoad.mockResolvedValue({
        settings: {
          mixchat_event_sounds: "not-valid-json",
          mixchat_font_size: "14",
        },
        exportedAt: new Date().toISOString(),
        version: 1,
      });

      const result = await restoreSettingsFromDrive();

      expect(result.ok).toBe(true);
      if (result.ok) {
        // event sounds parse failure skips it, font_size still restored
        expect(result.count).toBe(1);
      }
      expect(mockSaveSounds).not.toHaveBeenCalled();
      expect(localStorage.getItem("mixchat_font_size")).toBe("14");
    });

    it("returns error on Drive permission failure", async () => {
      mockLoad.mockRejectedValue(
        new Error("sign in again to continue"),
      );

      const result = await restoreSettingsFromDrive();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toContain("Re-auth with Drive");
      }
    });

    it("returns error on generic failure", async () => {
      mockLoad.mockRejectedValue(new Error("File not found"));

      const result = await restoreSettingsFromDrive();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message).toBe("File not found");
      }
    });

    it("handles backup with no settings gracefully", async () => {
      mockLoad.mockResolvedValue({
        settings: {},
        exportedAt: new Date().toISOString(),
        version: 1,
      });

      const result = await restoreSettingsFromDrive();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.count).toBe(0);
      }
    });

    it("handles backup with mix of old and :v1 keys without double-writing", async () => {
      mockLoad.mockResolvedValue({
        settings: {
          // Both old and new for the same logical key
          mixchat_favorite_channels: JSON.stringify(["from_old"]),
          "mixchat_favorite_channels:v1": JSON.stringify(["from_new"]),
        },
        exportedAt: new Date().toISOString(),
        version: 1,
      });

      const result = await restoreSettingsFromDrive();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.count).toBe(2);
      }
      // The :v1 key is written twice, first from the old key mapping,
      // then overwritten by the :v1 key itself. Final value is "from_new".
      expect(localStorage.getItem("mixchat_favorite_channels:v1")).toBe(
        JSON.stringify(["from_new"]),
      );
    });
  });
});
