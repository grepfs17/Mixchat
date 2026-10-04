import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import {
  createWheel,
  deleteWheel,
  deleteWheelByChannel,
  gcWheels,
  getWheel,
  listWheelsForChannel,
  mutateWheel,
  mutateWheelByChannel,
  publicWheelView,
  readReadableWheel,
  readWheelWithToken,
} from "../../src/server/wheelStore";

let baseDir: string;

beforeEach(async () => {
  baseDir = path.join(
    tmpdir(),
    `mixchat-wheel-test-${randomBytes(6).toString("hex")}`,
  );
});

describe("createWheel", () => {
  it("writes a file and returns a 24-char id and 64-char owner token", async () => {
    const { id, ownerToken } = await createWheel(
      { baseDir },
      {
        name: "Giveaway",
        channelName: "Alice",
        channelPlatform: "twitch",
      },
    );
    expect(id).toHaveLength(24);
    expect(ownerToken).toHaveLength(64);
    await expect(fs.access(path.join(baseDir, `${id}.json`))).resolves.toBeUndefined();
  });

  it("sanitizes options (trim, dedupe, drop empties)", async () => {
    const { wheel } = await createWheel(
      { baseDir },
      { options: ["  Yes ", "yes", "", "No", "No"] },
    );
    expect(wheel.options).toEqual(["Yes", "No"]);
  });

  it("falls back to default options when none are provided", async () => {
    const { wheel } = await createWheel({ baseDir }, { options: [] });
    expect(wheel.options.length).toBeGreaterThan(0);
  });

  it("defaults to private", async () => {
    const { wheel } = await createWheel({ baseDir });
    expect(wheel.isPublic).toBe(false);
  });
});

describe("listWheelsForChannel", () => {
  it("returns only wheels for the matching channel, newest first", async () => {
    await createWheel(
      { baseDir },
      { name: "A", channelName: "alice", channelPlatform: "twitch" },
    );
    const b = await createWheel(
      { baseDir },
      { name: "B", channelName: "alice", channelPlatform: "twitch" },
    );
    await createWheel(
      { baseDir },
      { name: "C", channelName: "bob", channelPlatform: "twitch" },
    );
    const list = await listWheelsForChannel({ baseDir }, "alice", "twitch");
    expect(list).toHaveLength(2);
    expect(list.map((w) => w.name).sort()).toEqual(["A", "B"]);
    const bEntry = list.find((w) => w.id === b.id);
    expect(bEntry?.optionCount).toBeGreaterThan(0);
  });

  it("returns an empty list when the directory does not exist", async () => {
    const list = await listWheelsForChannel(
      { baseDir: path.join(baseDir, "nope") },
      "alice",
      "twitch",
    );
    expect(list).toEqual([]);
  });
});

describe("mutateWheel", () => {
  it("rejects the wrong token", async () => {
    const { id } = await createWheel({ baseDir });
    const res = await mutateWheel({ baseDir }, id, "wrong", (w) => ({
      wheel: w,
      result: null,
    }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("auth");
  });

  it("applies the mutator, bumps version and persists", async () => {
    const { id, ownerToken } = await createWheel({ baseDir });
    const res = await mutateWheel({ baseDir }, id, ownerToken, (w) => {
      const next = { ...w, name: "Renamed", options: ["x", "y"] };
      return { wheel: next, result: next };
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.wheel.name).toBe("Renamed");
      expect(res.wheel.version).toBe(1);
    }
    const reread = await getWheel({ baseDir }, id);
    expect(reread?.name).toBe("Renamed");
    expect(reread?.options).toEqual(["x", "y"]);
    expect(reread?.version).toBe(1);
  });

  it("rejects unknown ids", async () => {
    const res = await mutateWheel({ baseDir }, "missing", "t", (w) => ({
      wheel: w,
      result: null,
    }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("missing");
  });
});

describe("mutateWheelByChannel", () => {
  it("allows a matching channel and rejects a mismatched one", async () => {
    const { id } = await createWheel(
      { baseDir },
      { channelName: "Alice", channelPlatform: "twitch" },
    );
    const ok = await mutateWheelByChannel(
      { baseDir },
      id,
      { channelName: "alice", channelPlatform: "TWITCH" },
      (w) => ({ wheel: { ...w, name: "Trusted" }, result: null }),
    );
    expect(ok.ok).toBe(true);

    const bad = await mutateWheelByChannel(
      { baseDir },
      id,
      { channelName: "bob", channelPlatform: "twitch" },
      (w) => ({ wheel: w, result: null }),
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.reason).toBe("auth");
  });
});

describe("reads", () => {
  it("publicWheelView omits the owner token hash", async () => {
    const { id } = await createWheel({ baseDir }, { name: "X" });
    const record = await getWheel({ baseDir }, id);
    const view = publicWheelView(record!);
    expect(view).not.toHaveProperty("ownerTokenHash");
    expect(view).toHaveProperty("options");
  });

  it("readReadableWheel hides private wheels from anonymous readers", async () => {
    const { id, ownerToken } = await createWheel(
      { baseDir },
      { isPublic: false },
    );
    expect(await readReadableWheel({ baseDir }, id)).toBeNull();
    expect(await readReadableWheel({ baseDir }, id, ownerToken)).not.toBeNull();
  });

  it("readReadableWheel exposes public wheels to anyone", async () => {
    const { id } = await createWheel({ baseDir }, { isPublic: true });
    const view = await readReadableWheel({ baseDir }, id);
    expect(view?.id).toBe(id);
  });

  it("readWheelWithToken returns null for the wrong token", async () => {
    const { id } = await createWheel({ baseDir });
    expect(await readWheelWithToken({ baseDir }, id, "wrong")).toBeNull();
  });
});

describe("delete", () => {
  it("deletes with the correct owner token and reports auth on mismatch", async () => {
    const { id, ownerToken } = await createWheel({ baseDir });
    expect(await deleteWheel({ baseDir }, id, "wrong")).toBe("auth");
    expect(await deleteWheel({ baseDir }, id, ownerToken)).toBe("ok");
    expect(await deleteWheel({ baseDir }, id, ownerToken)).toBe("missing");
  });

  it("channel-trust delete requires the matching channel", async () => {
    const { id } = await createWheel(
      { baseDir },
      { channelName: "alice", channelPlatform: "twitch" },
    );
    expect(
      await deleteWheelByChannel(
        { baseDir },
        id,
        { channelName: "bob", channelPlatform: "twitch" },
      ),
    ).toBe("auth");
    expect(
      await deleteWheelByChannel(
        { baseDir },
        id,
        { channelName: "alice", channelPlatform: "twitch" },
      ),
    ).toBe("ok");
  });
});

describe("gcWheels", () => {
  it("removes stale wheels and keeps recent ones", async () => {
    const stale = await createWheel({ baseDir });
    const recent = await createWheel({ baseDir });
    await mutateWheel({ baseDir }, stale.id, stale.ownerToken, (w) => ({
      wheel: { ...w, lastSeenAt: "2020-01-01T00:00:00.000Z" },
      result: null,
    }));
    const removed = await gcWheels(
      { baseDir },
      30,
      new Date("2026-06-01T00:00:00Z"),
    );
    expect(removed).toBe(1);
    expect(await getWheel({ baseDir }, stale.id)).toBeNull();
    expect(await getWheel({ baseDir }, recent.id)).not.toBeNull();
  });
});
