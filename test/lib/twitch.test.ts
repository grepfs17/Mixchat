import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getStreamStatuses,
  getRecentMessages,
  pinTwitchMessage,
  unpinTwitchMessage,
  getPinnedTwitchMessageId,
  createTwitchPoll,
  endTwitchPoll,
  createTwitchPrediction,
  updateTwitchPrediction,
} from "../../src/lib/twitch";

describe("twitch lib mocked HTTP tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getStreamStatuses returns correct live/offline mapping", async () => {
    // Stub fetch to return one live stream for user '1'
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            {
              user_id: "1",
              title: "Live Stream",
              viewer_count: 123,
              started_at: "2024-01-01T00:00:00Z",
            },
          ],
        }),
      }),
    );

    const result = await getStreamStatuses("token", "client", ["1", "2"]);

    expect(result["1"]).toBeDefined();
    expect(result["1"].isLive).toBe(true);
    expect(result["1"].title).toBe("Live Stream");
    expect(result["1"].viewerCount).toBe(123);

    expect(result["2"]).toBeDefined();
    expect(result["2"].isLive).toBe(false);
  });

  it("getRecentMessages parses raw IRC messages", async () => {
    const rawMsg = `@badge-info=;badges=moderator/1;color=#1E90FF;display-name=Mod;emotes=;tmi-sent-ts=${Date.now()};user-id=456 :mod!mod@mod.tmi.twitch.tv PRIVMSG #channel :Hello there`;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [rawMsg] }),
      }),
    );

    const messages = await getRecentMessages("channel");
    expect(messages).toHaveLength(1);
    const m = messages[0];
    expect(m.author).toBe("Mod");
    expect(m.content).toBe("Hello there");
    expect(m.userId).toBe("456");
    expect(m.isPreloaded).toBe(true);
  });

  it("getRecentMessages parses the gifs tag on preloaded messages", async () => {
    const rawMsg = `@badge-info=;badges=;color=;display-name=Viewer;emotes=;gifs=0-23|gifid123|https://media.giphy.com/media/gifid123/giphy.gif;tmi-sent-ts=${Date.now()};user-id=789 :viewer!viewer@viewer.tmi.twitch.tv PRIVMSG #channel :[YAY Yes GIF by Author]`;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [rawMsg] }),
      }),
    );

    const messages = await getRecentMessages("channel");
    expect(messages).toHaveLength(1);
    const m = messages[0];
    expect(m.gifs).toEqual([
      {
        id: "gifid123",
        url: "https://media.giphy.com/media/gifid123/giphy.gif",
        start: 0,
        end: 23,
      },
    ]);
  });

  it("getRecentMessages shifts gif ranges when stripping a reply prefix", async () => {
    const content = "[YAY Yes GIF by Author]";
    const rawMsg = `@reply-parent-msg-id=parent1;reply-parent-display-name=Mod;reply-parent-msg-body=p%20w;badges=;color=;display-name=Viewer;emotes=;gifs=5-28|gifid123|https://media.giphy.com/media/gifid123/giphy.gif;tmi-sent-ts=${Date.now()};user-id=789 :viewer!viewer@viewer.tmi.twitch.tv PRIVMSG #channel :@mod ${content}`;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [rawMsg] }),
      }),
    );

    const messages = await getRecentMessages("channel");
    expect(messages).toHaveLength(1);
    const m = messages[0];
    expect(m.content).toBe(content);
    expect(m.gifs).toEqual([
      {
        id: "gifid123",
        url: "https://media.giphy.com/media/gifid123/giphy.gif",
        start: 0,
        end: 23,
      },
    ]);
  });

  it("getRecentMessages returns empty array on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );
    const messages = await getRecentMessages("channel");
    expect(messages).toEqual([]);
  });

  it("pinTwitchMessage puts the message id to the pin endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const result = await pinTwitchMessage("123", "456", "msg-1");

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "/api/twitch-proxy?path=/helix/chat/pins&broadcaster_id=123&moderator_id=456",
    );
    expect(opts.method).toBe("PUT");
    expect(JSON.parse(opts.body)).toEqual({ message_id: "msg-1" });
  });

  it("getPinnedTwitchMessageId returns the pinned message id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ message_id: "msg-1" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await getPinnedTwitchMessageId("123", "456");

    expect(result).toBe("msg-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "/api/twitch-proxy?path=/helix/chat/pins&broadcaster_id=123&moderator_id=456",
    );
  });

  it("getPinnedTwitchMessageId returns null when nothing is pinned", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }),
    );

    const result = await getPinnedTwitchMessageId("123", "456");
    expect(result).toBeNull();
  });

  it("unpinTwitchMessage deletes the pin with the message id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const result = await unpinTwitchMessage("123", "456", "msg-1");

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "/api/twitch-proxy?path=/helix/chat/pins&broadcaster_id=123&moderator_id=456&message_id=msg-1",
    );
    expect(opts.method).toBe("DELETE");
  });
});

describe("twitch poll API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("createTwitchPoll posts the poll config to the proxy", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "poll-1",
            title: "Pick one",
            status: "ACTIVE",
            started_at: "2026-01-01T00:00:00Z",
            ends_at: "2026-01-01T00:05:00Z",
            choices: [
              { id: "a", title: "A", votes: 0 },
              { id: "b", title: "B", votes: 0 },
            ],
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const poll = await createTwitchPoll("123", {
      title: " Pick one ",
      choices: [" A ", " B "],
      duration: 300,
      channelPointsVoting: false,
      channelPointsPerVote: 100,
      bitsVoting: false,
      bitsPerVote: 100,
    });

    expect(poll.id).toBe("poll-1");
    expect(poll.totalVotes).toBe(0);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/twitch-proxy?path=/helix/polls");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({
      broadcaster_id: "123",
      title: "Pick one",
      choices: [{ title: "A" }, { title: "B" }],
      duration: 300,
      channel_points_voting_enabled: false,
      bits_voting_enabled: false,
    });
  });

  it("createTwitchPoll includes voting costs only when enabled", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "poll-1",
            title: "Pick one",
            status: "ACTIVE",
            started_at: "2026-01-01T00:00:00Z",
            choices: [{ id: "a", title: "A" }],
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await createTwitchPoll("123", {
      title: "Pick one",
      choices: ["A", "B"],
      duration: 60,
      channelPointsVoting: true,
      channelPointsPerVote: 500,
      bitsVoting: true,
      bitsPerVote: 10,
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.channel_points_per_vote).toBe(500);
    expect(body.bits_per_vote).toBe(10);
  });

  it("endTwitchPoll patches the poll status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "poll-1",
            title: "Pick one",
            status: "TERMINATED",
            started_at: "2026-01-01T00:00:00Z",
            choices: [{ id: "a", title: "A", votes: 1 }],
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const poll = await endTwitchPoll("123", "poll-1");

    expect(poll?.status).toBe("terminated");
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/twitch-proxy?path=/helix/polls");
    expect(opts.method).toBe("PATCH");
    expect(JSON.parse(opts.body)).toEqual({
      broadcaster_id: "123",
      id: "poll-1",
      status: "TERMINATED",
    });
  });
});

describe("twitch prediction API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function predictionResponse(status: string, extra: Record<string, unknown> = {}) {
    return {
      ok: true,
      json: async () => ({
        data: [
          {
            id: "pred-1",
            title: "Will we win?",
            status,
            created_at: "2026-01-01T00:00:00Z",
            prediction_window: 120,
            outcomes: [
              { id: "a", title: "Yes", color: "blue", users: 1, channel_points: 10 },
              { id: "b", title: "No", color: "pink", users: 0, channel_points: 0 },
            ],
            ...extra,
          },
        ],
      }),
    };
  }

  it("createTwitchPrediction posts the config to the proxy", async () => {
    const fetchMock = vi.fn().mockResolvedValue(predictionResponse("ACTIVE"));
    vi.stubGlobal("fetch", fetchMock);

    const prediction = await createTwitchPrediction("123", {
      title: " Will we win? ",
      outcomes: [" Yes ", " No "],
      windowSeconds: 120,
    });

    expect(prediction.id).toBe("pred-1");
    expect(prediction.totalPoints).toBe(10);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/twitch-proxy?path=/helix/predictions");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({
      broadcaster_id: "123",
      title: "Will we win?",
      outcomes: [{ title: "Yes" }, { title: "No" }],
      prediction_window: 120,
    });
  });

  it("updateTwitchPrediction locks a prediction", async () => {
    const fetchMock = vi.fn().mockResolvedValue(predictionResponse("LOCKED"));
    vi.stubGlobal("fetch", fetchMock);

    const prediction = await updateTwitchPrediction("123", "pred-1", "LOCKED");

    expect(prediction?.status).toBe("locked");
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/twitch-proxy?path=/helix/predictions");
    expect(opts.method).toBe("PATCH");
    expect(JSON.parse(opts.body)).toEqual({
      broadcaster_id: "123",
      id: "pred-1",
      status: "LOCKED",
    });
  });

  it("updateTwitchPrediction resolves with a winning outcome", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        predictionResponse("RESOLVED", { winning_outcome_id: "a" }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const prediction = await updateTwitchPrediction(
      "123",
      "pred-1",
      "RESOLVED",
      "a",
    );

    expect(prediction?.status).toBe("resolved");
    expect(prediction?.winningOutcomeId).toBe("a");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      broadcaster_id: "123",
      id: "pred-1",
      status: "RESOLVED",
      winning_outcome_id: "a",
    });
  });

  it("updateTwitchPrediction requires a winner to resolve", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      updateTwitchPrediction("123", "pred-1", "RESOLVED"),
    ).rejects.toThrow(/winning outcome is required/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
