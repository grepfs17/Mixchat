import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "os";
import path from "path";
import { randomBytes } from "crypto";
import { promises as fs } from "fs";

import {
  DEFAULT_STREAM_TOOLS_SETTINGS,
  getStreamToolsSettings,
  updateStreamToolsSettings,
  MAX_ALLOWED_MODS,
  MAX_MOD_FIELD_LENGTH,
  type AllowedMod,
} from "../../src/server/streamToolsSettings";

let baseDir: string;

beforeEach(async () => {
  baseDir = path.join(
    tmpdir(),
    `stream-tools-${randomBytes(6).toString("hex")}`,
  );
});

afterEach(async () => {
  await fs.rm(baseDir, { recursive: true, force: true });
});

describe("stream tools settings store", () => {
  it("returns defaults for an unknown channel", async () => {
    const settings = await getStreamToolsSettings({ baseDir }, "twitch:alice");
    expect(settings).toEqual(DEFAULT_STREAM_TOOLS_SETTINGS);
  });

  it("persists updates per channel", async () => {
    await updateStreamToolsSettings({ baseDir }, "twitch:alice", {
      allowMods: true,
    });
    const alice = await getStreamToolsSettings({ baseDir }, "twitch:alice");
    const bob = await getStreamToolsSettings({ baseDir }, "twitch:bob");
    expect(alice.allowMods).toBe(true);
    expect(bob.allowMods).toBe(false);
  });

  it("keeps untouched fields on partial updates", async () => {
    await updateStreamToolsSettings({ baseDir }, "twitch:alice", {
      enabled: false,
    });
    await updateStreamToolsSettings({ baseDir }, "twitch:alice", {
      allowMods: true,
    });
    const settings = await getStreamToolsSettings({ baseDir }, "twitch:alice");
    expect(settings.enabled).toBe(false);
    expect(settings.allowMods).toBe(true);
  });

  it("normalizes channel keys case-insensitively", async () => {
    await updateStreamToolsSettings({ baseDir }, "twitch:Alice", {
      allowMods: true,
    });
    const settings = await getStreamToolsSettings({ baseDir }, "twitch:alice");
    expect(settings.allowMods).toBe(true);
  });

  it("defaults to every moderator when no selection is stored", async () => {
    const settings = await getStreamToolsSettings({ baseDir }, "twitch:alice");
    expect(settings.modAccess).toBe("all");
    expect(settings.allowedMods).toEqual([]);
  });

  it("returns a copy of the defaults so callers cannot mutate them", async () => {
    const first = await getStreamToolsSettings({ baseDir }, "twitch:alice");
    first.allowedMods.push({ id: "1", login: "mallory" });
    const second = await getStreamToolsSettings({ baseDir }, "twitch:alice");
    expect(second.allowedMods).toEqual([]);
    expect(DEFAULT_STREAM_TOOLS_SETTINGS.allowedMods).toEqual([]);
  });

  it("stores grants by user id and normalizes the login", async () => {
    await updateStreamToolsSettings({ baseDir }, "twitch:alice", {
      modAccess: "selected",
      allowedMods: [
        { id: "1", login: "Mallory" },
        { id: "1", login: "mallory" },
        { id: "2", login: " Carol " },
        42 as unknown as AllowedMod,
        { id: "", login: "no-id" },
      ],
    });
    const settings = await getStreamToolsSettings({ baseDir }, "twitch:alice");
    expect(settings.modAccess).toBe("selected");
    expect(settings.allowedMods).toEqual([
      { id: "1", login: "mallory" },
      { id: "2", login: "carol" },
    ]);
  });

  it("caps the stored selection", async () => {
    const many = Array.from({ length: MAX_ALLOWED_MODS + 50 }, (_, i) => ({
      id: String(i),
      login: `mod${i}`,
    }));
    await updateStreamToolsSettings({ baseDir }, "twitch:alice", {
      modAccess: "selected",
      allowedMods: many,
    });
    const settings = await getStreamToolsSettings({ baseDir }, "twitch:alice");
    expect(settings.allowedMods).toHaveLength(MAX_ALLOWED_MODS);
  });

  it("truncates an over-long id or login", async () => {
    await updateStreamToolsSettings({ baseDir }, "twitch:alice", {
      modAccess: "selected",
      allowedMods: [
        { id: "i".repeat(MAX_MOD_FIELD_LENGTH + 20), login: "mallory" },
        { id: "2", login: "l".repeat(MAX_MOD_FIELD_LENGTH + 20) },
      ],
    });
    const settings = await getStreamToolsSettings({ baseDir }, "twitch:alice");
    expect(settings.allowedMods).toEqual([
      { id: "2", login: "l".repeat(MAX_MOD_FIELD_LENGTH) },
    ]);
  });

  it("keeps untouched fields on partial updates of the selection", async () => {
    await updateStreamToolsSettings({ baseDir }, "twitch:alice", {
      modAccess: "selected",
      allowedMods: [{ id: "1", login: "mallory" }],
    });
    await updateStreamToolsSettings({ baseDir }, "twitch:alice", {
      enabled: false,
    });
    const settings = await getStreamToolsSettings({ baseDir }, "twitch:alice");
    expect(settings.enabled).toBe(false);
    expect(settings.modAccess).toBe("selected");
    expect(settings.allowedMods).toEqual([{ id: "1", login: "mallory" }]);
  });

  it("reads settings written before the selection fields existed", async () => {
    await fs.mkdir(baseDir, { recursive: true });
    await fs.writeFile(
      path.join(baseDir, "twitch-alice.json"),
      JSON.stringify({
        fileVersion: 1,
        channelKey: "twitch:alice",
        enabled: true,
        allowMods: true,
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
      "utf8",
    );
    const settings = await getStreamToolsSettings({ baseDir }, "twitch:alice");
    expect(settings.allowMods).toBe(true);
    expect(settings.modAccess).toBe("all");
    expect(settings.allowedMods).toEqual([]);
  });
});
