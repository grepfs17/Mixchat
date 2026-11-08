import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePollCreator } from "../../../src/hooks/chat/usePollCreator";
import { createTwitchPoll, endTwitchPoll } from "../../../src/lib/twitch";
import {
  getPollRelay,
  pollRelayAction,
} from "../../../src/lib/streamTools/api";
import type { PollState } from "../../../src/components/chat/shared/bannerTypes";
import type { PollRelayCommand } from "../../../src/lib/streamTools/pollRelay";

vi.mock("../../../src/lib/twitch", () => ({
  createTwitchPoll: vi.fn(),
  endTwitchPoll: vi.fn(),
}));

vi.mock("../../../src/lib/streamTools/api", () => ({
  getPollRelay: vi.fn(),
  pollRelayAction: vi.fn(),
}));

const activePoll: PollState = {
  id: "poll-1",
  title: "Pick one",
  choices: [
    { id: "a", title: "A", votes: 1 },
    { id: "b", title: "B", votes: 0 },
  ],
  totalVotes: 1,
  endsAt: new Date(Date.now() + 60_000),
  status: "active",
};

function emptyRelay() {
  return { poll: null, command: null, updatedAt: 0 };
}

function pendingCommand(): PollRelayCommand {
  return {
    id: "cmd-1",
    action: "create",
    config: {
      title: "Pick one",
      choices: ["A", "B"],
      duration: 300,
      channelPointsVoting: false,
      channelPointsPerVote: 100,
      bitsVoting: false,
      bitsPerVote: 100,
    },
    requestedAt: Date.now(),
    status: "pending",
  };
}

function fillValidConfig(result: {
  current: ReturnType<typeof usePollCreator>;
}) {
  act(() => {
    result.current.setField("title", "Pick one");
    result.current.setChoice(0, "A");
    result.current.setChoice(1, "B");
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPollRelay).mockResolvedValue(emptyRelay());
  vi.mocked(pollRelayAction).mockResolvedValue(emptyRelay());
});

describe("usePollCreator relay", () => {
  it("sends a moderator create request instead of calling Twitch", async () => {
    vi.mocked(pollRelayAction).mockResolvedValue({
      ...emptyRelay(),
      command: pendingCommand(),
    });
    const { result } = renderHook(() =>
      usePollCreator({
        broadcasterId: "123",
        canManage: false,
        livePoll: null,
        setPoll: vi.fn(),
        onNotify: vi.fn(),
        relayChannelKey: "twitch:alice",
        relayRole: "moderator",
      }),
    );
    fillValidConfig(result);

    await act(async () => {
      await result.current.start();
    });

    expect(createTwitchPoll).not.toHaveBeenCalled();
    expect(pollRelayAction).toHaveBeenCalledWith("twitch:alice", "create", {
      config: expect.objectContaining({
        title: "Pick one",
        choices: ["A", "B"],
      }),
    });
    expect(result.current.relayCommand?.status).toBe("pending");
  });

  it("uses the relayed poll state for moderators", async () => {
    vi.mocked(getPollRelay).mockResolvedValue({
      poll: activePoll,
      command: null,
      updatedAt: 0,
    });
    const { result } = renderHook(() =>
      usePollCreator({
        broadcasterId: "123",
        canManage: false,
        livePoll: null,
        setPoll: vi.fn(),
        onNotify: vi.fn(),
        relayChannelKey: "twitch:alice",
        relayRole: "moderator",
      }),
    );

    await waitFor(() => {
      expect(result.current.phase).toBe("active");
    });
    expect(result.current.effectivePoll?.id).toBe("poll-1");

    await act(async () => {
      await result.current.end();
    });

    expect(endTwitchPoll).not.toHaveBeenCalled();
    expect(pollRelayAction).toHaveBeenCalledWith("twitch:alice", "end");
  });

  it("executes a pending request on the broadcaster client", async () => {
    const command = pendingCommand();
    vi.mocked(getPollRelay)
      .mockResolvedValueOnce({ poll: null, command, updatedAt: 0 })
      .mockResolvedValue(emptyRelay());
    vi.mocked(pollRelayAction).mockImplementation(async (_key, action) => {
      if (action === "claim") {
        return { ...emptyRelay(), command, claimed: command };
      }
      return { ...emptyRelay(), poll: activePoll };
    });
    vi.mocked(createTwitchPoll).mockResolvedValue(activePoll);
    const setPoll = vi.fn();

    renderHook(() =>
      usePollCreator({
        broadcasterId: "123",
        canManage: true,
        affiliateEligible: true,
        livePoll: null,
        setPoll,
        onNotify: vi.fn(),
        relayChannelKey: "twitch:alice",
        relayRole: "owner",
      }),
    );

    await waitFor(() => {
      expect(createTwitchPoll).toHaveBeenCalledWith("123", command.config);
    });
    await waitFor(() => {
      expect(pollRelayAction).toHaveBeenCalledWith("twitch:alice", "ack", {
        commandId: command.id,
        poll: activePoll,
      });
    });
    expect(setPoll).toHaveBeenCalledWith(activePoll);
  });

  it("rejects a pending request when the broadcaster is not eligible", async () => {
    const command = pendingCommand();
    vi.mocked(getPollRelay)
      .mockResolvedValueOnce({ poll: null, command, updatedAt: 0 })
      .mockResolvedValue(emptyRelay());
    vi.mocked(pollRelayAction).mockImplementation(async (_key, action) => {
      if (action === "claim") {
        return { ...emptyRelay(), command, claimed: command };
      }
      return emptyRelay();
    });

    renderHook(() =>
      usePollCreator({
        broadcasterId: "123",
        canManage: true,
        affiliateEligible: false,
        livePoll: null,
        setPoll: vi.fn(),
        onNotify: vi.fn(),
        relayChannelKey: "twitch:alice",
        relayRole: "owner",
      }),
    );

    await waitFor(() => {
      expect(pollRelayAction).toHaveBeenCalledWith("twitch:alice", "ack", {
        commandId: command.id,
        error: expect.stringMatching(/Affiliate or Partner/i),
      });
    });
    expect(createTwitchPoll).not.toHaveBeenCalled();
  });
});
