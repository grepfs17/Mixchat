import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/lib/rateLimit", () => ({
  checkRateLimit: vi.fn(() => true),
}));

const { authorizeChannel } = vi.hoisted(() => ({
  authorizeChannel: vi.fn(async () => "ok"),
}));

vi.mock("../../../src/server/wheelAuth", () => ({
  authorizeChannel,
}));

import { GET, POST } from "../../../src/pages/api/stream-tools/poll";
import { __resetPollRelayForTests } from "../../../src/server/streamToolPollRelay";

const CHANNEL_KEY = "twitch:alice";

function ctx(url: string, body?: unknown, method = "GET"): any {
  return {
    request: new Request(`http://localhost${url}`, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
    }),
    params: {},
    cookies: { get: () => ({ value: "cookie" }) },
  };
}

function validConfig() {
  return {
    title: "Pick one",
    choices: ["A", "B"],
    duration: 300,
    channelPointsVoting: false,
    channelPointsPerVote: 100,
    bitsVoting: false,
    bitsPerVote: 100,
  };
}

beforeEach(() => {
  __resetPollRelayForTests();
  authorizeChannel.mockReset();
  authorizeChannel.mockResolvedValue("ok");
});

describe("GET /api/stream-tools/poll", () => {
  it("returns the relay for an authorized channel", async () => {
    const res = await GET(
      ctx(`/api/stream-tools/poll?channelKey=${encodeURIComponent(CHANNEL_KEY)}`),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      poll: null,
      command: null,
    });
    expect(authorizeChannel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ channelName: "alice" }),
      { allowModerators: true },
    );
  });

  it("rejects non-Twitch channels", async () => {
    const res = await GET(
      ctx(
        `/api/stream-tools/poll?channelKey=${encodeURIComponent("youtube:alice")}`,
      ),
    );
    expect(res.status).toBe(400);
  });

  it("requires a channel", async () => {
    const res = await GET(ctx("/api/stream-tools/poll"));
    expect(res.status).toBe(400);
  });

  it("rejects forbidden callers", async () => {
    authorizeChannel.mockResolvedValue("forbidden");
    const res = await GET(
      ctx(`/api/stream-tools/poll?channelKey=${encodeURIComponent(CHANNEL_KEY)}`),
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /api/stream-tools/poll", () => {
  it("queues a moderator create request", async () => {
    const res = await POST(
      ctx(
        "/api/stream-tools/poll",
        {
          channelKey: CHANNEL_KEY,
          action: "create",
          config: validConfig(),
          requestedBy: "Mod",
        },
        "POST",
      ),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.command).toMatchObject({
      action: "create",
      status: "pending",
      requestedBy: "Mod",
    });
    expect(authorizeChannel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ channelName: "alice" }),
      { allowModerators: true },
    );
  });

  it("rejects an invalid poll config", async () => {
    const res = await POST(
      ctx(
        "/api/stream-tools/poll",
        {
          channelKey: CHANNEL_KEY,
          action: "create",
          config: { ...validConfig(), title: "" },
        },
        "POST",
      ),
    );
    expect(res.status).toBe(400);
  });

  it("claims pending commands with owner auth", async () => {
    const created = await POST(
      ctx(
        "/api/stream-tools/poll",
        {
          channelKey: CHANNEL_KEY,
          action: "create",
          config: validConfig(),
        },
        "POST",
      ),
    );
    const { command } = await created.json();

    authorizeChannel.mockClear();
    const res = await POST(
      ctx(
        "/api/stream-tools/poll",
        {
          channelKey: CHANNEL_KEY,
          action: "claim",
          commandId: command.id,
        },
        "POST",
      ),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.claimed).toMatchObject({ id: command.id, status: "claimed" });
    // Owner-only: no allowModerators option.
    expect(authorizeChannel).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ channelName: "alice" }),
      undefined,
    );
  });

  it("acknowledges with a poll snapshot", async () => {
    const created = await POST(
      ctx(
        "/api/stream-tools/poll",
        {
          channelKey: CHANNEL_KEY,
          action: "create",
          config: validConfig(),
        },
        "POST",
      ),
    );
    const { command } = await created.json();
    await POST(
      ctx(
        "/api/stream-tools/poll",
        {
          channelKey: CHANNEL_KEY,
          action: "claim",
          commandId: command.id,
        },
        "POST",
      ),
    );

    const res = await POST(
      ctx(
        "/api/stream-tools/poll",
        {
          channelKey: CHANNEL_KEY,
          action: "ack",
          commandId: command.id,
          poll: {
            id: "poll-1",
            title: "Pick one",
            choices: [
              { id: "a", title: "A", votes: 1 },
              { id: "b", title: "B", votes: 0 },
            ],
            totalVotes: 1,
            endsAt: new Date(Date.now() + 60_000).toISOString(),
            status: "active",
          },
        },
        "POST",
      ),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.command.status).toBe("done");
    expect(body.poll.id).toBe("poll-1");
  });
});
