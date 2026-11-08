import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPollRelayForTests,
  ackPollCommand,
  claimPollCommand,
  enqueuePollCommand,
  getPollRelay,
  syncPollState,
} from "../../src/server/streamToolPollRelay";
import type { PollState } from "../../src/components/chat/shared/bannerTypes";
import { defaultPollConfig } from "../../src/lib/streamerTools/poll";

const KEY = "twitch:alice";

function config() {
  return {
    ...defaultPollConfig(),
    title: "Pick one",
    choices: ["A", "B"],
  };
}

const poll: PollState = {
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

beforeEach(() => {
  __resetPollRelayForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("poll relay store", () => {
  it("queues a create command and exposes it to readers", () => {
    const command = enqueuePollCommand(KEY, "create", config(), "Mod");

    expect(command.status).toBe("pending");
    expect(command.action).toBe("create");
    expect(getPollRelay(KEY).command?.id).toBe(command.id);
  });

  it("rejects a second pending command", () => {
    enqueuePollCommand(KEY, "create", config(), "Mod");

    expect(() => enqueuePollCommand(KEY, "end", undefined, "Mod")).toThrow(
      /already pending/i,
    );
  });

  it("claims a command once", () => {
    const command = enqueuePollCommand(KEY, "create", config(), "Mod");

    const claimed = claimPollCommand(KEY, command.id);
    expect(claimed?.status).toBe("claimed");
    expect(claimPollCommand(KEY, command.id)).toBeNull();
  });

  it("acks a command and stores the resulting poll", () => {
    const command = enqueuePollCommand(KEY, "create", config(), "Mod");
    claimPollCommand(KEY, command.id);

    expect(ackPollCommand(KEY, command.id, poll, undefined)).toBe(true);
    const state = getPollRelay(KEY);
    expect(state.command?.status).toBe("done");
    expect(state.poll?.id).toBe("poll-1");
  });

  it("acks a failure without overwriting the poll", () => {
    const command = enqueuePollCommand(KEY, "end", undefined, "Mod");
    syncPollState(KEY, poll);
    claimPollCommand(KEY, command.id);

    expect(ackPollCommand(KEY, command.id, undefined, "Boom")).toBe(true);
    const state = getPollRelay(KEY);
    expect(state.command?.status).toBe("error");
    expect(state.command?.error).toBe("Boom");
    expect(state.poll?.id).toBe("poll-1");
  });

  it("mirrors and clears poll state", () => {
    syncPollState(KEY, poll);
    expect(getPollRelay(KEY).poll?.id).toBe("poll-1");

    syncPollState(KEY, null);
    expect(getPollRelay(KEY).poll).toBeNull();
  });

  it("expires a pending request after the timeout", () => {
    vi.useFakeTimers();
    const command = enqueuePollCommand(KEY, "create", config(), "Mod");

    vi.advanceTimersByTime(2 * 60 * 1000 + 1);

    const state = getPollRelay(KEY);
    expect(state.command?.id).toBe(command.id);
    expect(state.command?.status).toBe("error");
    expect(state.command?.error).toMatch(/did not respond/i);
  });
});
