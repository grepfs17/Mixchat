import { describe, it, expect } from "vitest";
import {
  defaultPollConfig,
  mapTwitchPoll,
  parsePollCommand,
  validatePollConfig,
  type PollConfig,
} from "../../../src/lib/streamerTools/poll";

function validConfig(overrides: Partial<PollConfig> = {}): PollConfig {
  return {
    ...defaultPollConfig(),
    title: "What should we play?",
    choices: ["Valorant", "Minecraft"],
    ...overrides,
  };
}

describe("validatePollConfig", () => {
  it("accepts a minimal valid config", () => {
    expect(validatePollConfig(validConfig())).toBeNull();
  });

  it("requires a question", () => {
    expect(validatePollConfig(validConfig({ title: "  " }))).toBe(
      "Enter a poll question.",
    );
  });

  it("limits the question length", () => {
    expect(
      validatePollConfig(validConfig({ title: "x".repeat(61) })),
    ).toMatch(/60 characters or fewer/);
  });

  it("enforces choice count bounds", () => {
    expect(validatePollConfig(validConfig({ choices: ["one"] }))).toMatch(
      /at least 2 choices/,
    );
    expect(
      validatePollConfig(
        validConfig({ choices: ["1", "2", "3", "4", "5", "6"] }),
      ),
    ).toMatch(/at most 5 choices/);
  });

  it("rejects empty, long, and duplicate choices", () => {
    expect(validatePollConfig(validConfig({ choices: ["Yes", ""] }))).toBe(
      "Every choice needs text.",
    );
    expect(
      validatePollConfig(validConfig({ choices: ["Yes", "x".repeat(26)] })),
    ).toMatch(/25 characters or fewer/);
    expect(
      validatePollConfig(validConfig({ choices: ["Yes", " yes "] })),
    ).toBe("Choices must be unique.");
  });

  it("enforces the Twitch duration range", () => {
    expect(validatePollConfig(validConfig({ duration: 14 }))).toMatch(
      /between 15 and 1800/,
    );
    expect(validatePollConfig(validConfig({ duration: 1801 }))).toMatch(
      /between 15 and 1800/,
    );
  });

  it("validates channel points and bits settings only when enabled", () => {
    expect(
      validatePollConfig(
        validConfig({
          channelPointsVoting: true,
          channelPointsPerVote: 0,
        }),
      ),
    ).toMatch(/Channel Points per vote/);
    expect(
      validatePollConfig(
        validConfig({ bitsVoting: true, bitsPerVote: 10001 }),
      ),
    ).toMatch(/Bits per vote/);
    expect(
      validatePollConfig(
        validConfig({ bitsVoting: true, bitsPerVote: 0 }),
      ),
    ).toMatch(/Bits per vote/);
    expect(
      validatePollConfig(
        validConfig({
          channelPointsVoting: false,
          channelPointsPerVote: 0,
          bitsVoting: false,
          bitsPerVote: -1,
        }),
      ),
    ).toBeNull();
  });
});

describe("parsePollCommand", () => {
  it("recognizes the local poll commands case-insensitively", () => {
    expect(parsePollCommand("/createpoll")).toBe("createpoll");
    expect(parsePollCommand("  /CreatePoll  ")).toBe("createpoll");
    expect(parsePollCommand("/endpoll")).toBe("endpoll");
    expect(parsePollCommand("/ENDPOLL now")).toBe("endpoll");
  });

  it("ignores everything else", () => {
    expect(parsePollCommand("hello /createpoll")).toBeNull();
    expect(parsePollCommand("/poll")).toBeNull();
    expect(parsePollCommand("")).toBeNull();
  });
});

describe("mapTwitchPoll", () => {
  it("maps a Twitch response to PollState", () => {
    const mapped = mapTwitchPoll({
      id: "poll-1",
      title: "Pick one",
      status: "ACTIVE",
      started_at: "2026-01-01T00:00:00Z",
      ends_at: "2026-01-01T00:05:00Z",
      choices: [
        { id: "a", title: "A", votes: 3 },
        { id: "b", title: "B", votes: 2 },
      ],
    });

    expect(mapped).toEqual({
      id: "poll-1",
      title: "Pick one",
      choices: [
        { id: "a", title: "A", votes: 3 },
        { id: "b", title: "B", votes: 2 },
      ],
      totalVotes: 5,
      endsAt: new Date("2026-01-01T00:05:00Z"),
      status: "active",
    });
  });

  it("falls back to the start time and lowercase status", () => {
    const mapped = mapTwitchPoll({
      id: "poll-2",
      title: "Pick one",
      status: "TERMINATED",
      started_at: "2026-01-01T00:00:00Z",
      choices: [{ id: "a", title: "A" }],
    });

    expect(mapped.endsAt).toEqual(new Date("2026-01-01T00:00:00Z"));
    expect(mapped.status).toBe("terminated");
    expect(mapped.totalVotes).toBe(0);
  });
});
