import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePollCreator } from "../../../src/hooks/chat/usePollCreator";
import { createTwitchPoll, endTwitchPoll } from "../../../src/lib/twitch";
import type { PollState } from "../../../src/components/chat/shared/bannerTypes";

vi.mock("../../../src/lib/twitch", () => ({
  createTwitchPoll: vi.fn(),
  endTwitchPoll: vi.fn(),
}));

const createdPoll: PollState = {
  id: "poll-1",
  title: "Pick one",
  choices: [
    { id: "a", title: "A", votes: 0 },
    { id: "b", title: "B", votes: 0 },
  ],
  totalVotes: 0,
  endsAt: new Date(Date.now() + 60_000),
  status: "active",
};

const endedPoll: PollState = {
  ...createdPoll,
  status: "terminated",
};

function setup(livePoll: PollState | null = null, canManage = true) {
  const setPoll = vi.fn();
  const onNotify = vi.fn();
  const hook = renderHook(
    ({ livePoll: current }) =>
      usePollCreator({
        broadcasterId: "123",
        canManage,
        livePoll: current,
        setPoll,
        onNotify,
      }),
    { initialProps: { livePoll } },
  );
  return { ...hook, setPoll, onNotify };
}

function fillValidConfig(result: { current: ReturnType<typeof usePollCreator> }) {
  act(() => {
    result.current.setField("title", "Pick one");
    result.current.setChoice(0, "A");
    result.current.setChoice(1, "B");
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("usePollCreator", () => {
  it("starts in the config phase", () => {
    const { result } = setup();
    expect(result.current.phase).toBe("config");
    expect(result.current.config.choices).toHaveLength(2);
  });

  it("validates before calling Twitch", async () => {
    const { result, onNotify } = setup();

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.error).toBe("Enter a poll question.");
    expect(createTwitchPoll).not.toHaveBeenCalled();
    expect(onNotify).not.toHaveBeenCalled();
  });

  it("creates a poll and stores it", async () => {
    vi.mocked(createTwitchPoll).mockResolvedValue(createdPoll);
    const { result, setPoll, onNotify } = setup();
    fillValidConfig(result);

    await act(async () => {
      await result.current.start();
    });

    expect(createTwitchPoll).toHaveBeenCalledWith(
      "123",
      expect.objectContaining({
        title: "Pick one",
        choices: ["A", "B"],
      }),
    );
    expect(setPoll).toHaveBeenCalledWith(createdPoll);
    expect(onNotify).toHaveBeenCalledWith("Poll started", "success");
    expect(result.current.error).toBeNull();
  });

  it("surfaces create failures", async () => {
    vi.mocked(createTwitchPoll).mockRejectedValue(new Error("Missing scope"));
    const { result, onNotify } = setup();
    fillValidConfig(result);

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.error).toBe("Missing scope");
    expect(onNotify).toHaveBeenCalledWith("Missing scope", "error");
  });

  it("blocks users who cannot manage polls", async () => {
    const { result } = setup(null, false);
    fillValidConfig(result);

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.error).toBe(
      "Only the broadcaster can create polls.",
    );
    expect(createTwitchPoll).not.toHaveBeenCalled();
  });

  it("ends an active poll", async () => {
    vi.mocked(endTwitchPoll).mockResolvedValue(endedPoll);
    const { result, setPoll, onNotify } = setup(createdPoll);

    await act(async () => {
      await result.current.end();
    });

    expect(result.current.phase).toBe("active");
    expect(endTwitchPoll).toHaveBeenCalledWith("123", "poll-1");
    expect(setPoll).toHaveBeenCalledWith(endedPoll);
    expect(onNotify).toHaveBeenCalledWith("Poll ended", "success");
  });

  it("reports when there is no active poll", async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.end();
    });

    expect(result.current.error).toBe("No active poll.");
    expect(endTwitchPoll).not.toHaveBeenCalled();
  });

  it("resets to a fresh config", () => {
    const { result, setPoll } = setup(endedPoll);
    fillValidConfig(result);

    act(() => {
      result.current.startNew();
    });

    expect(result.current.config.title).toBe("");
    expect(result.current.config.choices).toEqual(["", ""]);
    expect(setPoll).toHaveBeenCalledWith(null);
  });

  it("enforces choice count bounds locally", () => {
    const { result } = setup();

    act(() => {
      result.current.addChoice();
      result.current.addChoice();
      result.current.addChoice();
    });
    expect(result.current.config.choices).toHaveLength(5);

    act(() => {
      result.current.addChoice();
    });
    expect(result.current.config.choices).toHaveLength(5);

    act(() => {
      result.current.removeChoice(0);
      result.current.removeChoice(0);
      result.current.removeChoice(0);
    });
    expect(result.current.config.choices).toHaveLength(2);
  });
});
