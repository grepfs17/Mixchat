import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "os";
import path from "path";
import { randomBytes } from "crypto";
import { promises as fs } from "fs";

import {
  getStreamToolsState,
  mutateStreamToolsState,
} from "../../src/server/streamToolsState";

let baseDir: string;

beforeEach(async () => {
  baseDir = path.join(
    tmpdir(),
    `stream-tools-state-${randomBytes(6).toString("hex")}`,
  );
});

afterEach(async () => {
  await fs.rm(baseDir, { recursive: true, force: true });
});

const KEY = "twitch:alice";

function entry(userId: string, author = userId) {
  return {
    platform: "twitch" as const,
    userId,
    author,
  };
}

describe("shared stream tools state", () => {
  it("returns defaults for a new channel", async () => {
    const state = await getStreamToolsState({ baseDir }, KEY);
    expect(state.version).toBe(0);
    expect(state.giveaway.phase).toBe("config");
    expect(state.giveaway.entries).toEqual([]);
    expect(state.music.playlists).toEqual([]);
    expect(state.music.isPlaying).toBe(false);
  });

  it("increments version on every mutation", async () => {
    await mutateStreamToolsState({ baseDir }, KEY, (state) => {
      state.music.isPlaying = true;
    });
    await mutateStreamToolsState({ baseDir }, KEY, (state) => {
      state.music.isPlaying = false;
    });
    const state = await getStreamToolsState({ baseDir }, KEY);
    expect(state.version).toBe(2);
  });

  it("stores giveaway entries", async () => {
    await mutateStreamToolsState({ baseDir }, KEY, (state) => {
      state.giveaway = {
        phase: "running",
        keyword: "join",
        duration: 0,
        scope: "both",
        eligibility: "everyone",
        startedAt: Date.now(),
        endsAt: Number.POSITIVE_INFINITY,
        winner: null,
        entries: [],
        announcedAt: null,
      };
    });
    await mutateStreamToolsState({ baseDir }, KEY, (state) => {
      state.giveaway.entries = [
        ...state.giveaway.entries,
        entry("u1"),
        entry("u2"),
      ];
    });
    const state = await getStreamToolsState({ baseDir }, KEY);
    expect(state.giveaway.entries).toHaveLength(2);
  });

  it("auto-reveals a giveaway when its timer elapses", async () => {
    const startedAt = Date.now() - 60_000;
    await mutateStreamToolsState({ baseDir }, KEY, (state) => {
      state.giveaway = {
        phase: "running",
        keyword: "join",
        duration: 5,
        scope: "both",
        eligibility: "everyone",
        startedAt,
        endsAt: startedAt + 5_000,
        winner: null,
        entries: [entry("u1"), entry("u2")],
        announcedAt: null,
      };
    });
    const state = await getStreamToolsState({ baseDir }, KEY);
    expect(state.giveaway.phase).toBe("revealed");
    expect(["u1", "u2"]).toContain(state.giveaway.winner?.userId);
    // 1 from the setup mutation, 1 from the auto-reveal on read.
    expect(state.version).toBe(2);
  });

  it("keeps an unlimited giveaway running until revealed", async () => {
    await mutateStreamToolsState({ baseDir }, KEY, (state) => {
      state.giveaway = {
        phase: "running",
        keyword: "join",
        duration: 0,
        scope: "both",
        eligibility: "everyone",
        startedAt: Date.now(),
        endsAt: Number.POSITIVE_INFINITY,
        winner: null,
        entries: [entry("u1")],
        announcedAt: null,
      };
    });
    const state = await getStreamToolsState({ baseDir }, KEY);
    expect(state.giveaway.phase).toBe("running");
    expect(state.giveaway.winner).toBeNull();
  });
});
