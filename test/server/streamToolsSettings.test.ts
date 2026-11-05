import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "os";
import path from "path";
import { randomBytes } from "crypto";
import { promises as fs } from "fs";

import {
  DEFAULT_STREAM_TOOLS_SETTINGS,
  getStreamToolsSettings,
  updateStreamToolsSettings,
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
});
