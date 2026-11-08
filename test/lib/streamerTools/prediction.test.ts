import { describe, it, expect } from "vitest";
import {
  defaultPredictionConfig,
  mapTwitchPrediction,
  parsePredictionCommand,
  validatePredictionConfig,
  type PredictionConfig,
} from "../../../src/lib/streamerTools/prediction";

function validConfig(
  overrides: Partial<PredictionConfig> = {},
): PredictionConfig {
  return {
    ...defaultPredictionConfig(),
    title: "Will we win?",
    outcomes: ["Yes", "No"],
    ...overrides,
  };
}

describe("validatePredictionConfig", () => {
  it("accepts a minimal valid config", () => {
    expect(validatePredictionConfig(validConfig())).toBeNull();
  });

  it("requires a title and limits its length", () => {
    expect(validatePredictionConfig(validConfig({ title: "  " }))).toBe(
      "Enter a prediction title.",
    );
    expect(
      validatePredictionConfig(validConfig({ title: "x".repeat(46) })),
    ).toMatch(/45 characters or fewer/);
  });

  it("enforces outcome count bounds", () => {
    expect(
      validatePredictionConfig(validConfig({ outcomes: ["Yes"] })),
    ).toMatch(/at least 2 outcomes/);
    expect(
      validatePredictionConfig(
        validConfig({
          outcomes: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"],
        }),
      ),
    ).toMatch(/at most 10 outcomes/);
  });

  it("rejects empty, long, and duplicate outcomes", () => {
    expect(
      validatePredictionConfig(validConfig({ outcomes: ["Yes", ""] })),
    ).toBe("Every outcome needs text.");
    expect(
      validatePredictionConfig(
        validConfig({ outcomes: ["Yes", "x".repeat(26)] }),
      ),
    ).toMatch(/25 characters or fewer/);
    expect(
      validatePredictionConfig(validConfig({ outcomes: ["Yes", " yes "] })),
    ).toBe("Outcomes must be unique.");
  });

  it("enforces the Twitch prediction window", () => {
    expect(
      validatePredictionConfig(validConfig({ windowSeconds: 29 })),
    ).toMatch(/between 30 and 1800/);
    expect(
      validatePredictionConfig(validConfig({ windowSeconds: 1801 })),
    ).toMatch(/between 30 and 1800/);
  });
});

describe("parsePredictionCommand", () => {
  it("recognizes local prediction commands case-insensitively", () => {
    expect(parsePredictionCommand("/createprediction")).toBe(
      "createprediction",
    );
    expect(parsePredictionCommand("  /CreatePrediction  ")).toBe(
      "createprediction",
    );
    expect(parsePredictionCommand("/lockprediction")).toBe("lockprediction");
    expect(parsePredictionCommand("/cancelprediction now")).toBe(
      "cancelprediction",
    );
  });

  it("ignores everything else", () => {
    expect(parsePredictionCommand("hello /createprediction")).toBeNull();
    expect(parsePredictionCommand("/prediction")).toBeNull();
    expect(parsePredictionCommand("")).toBeNull();
  });
});

describe("mapTwitchPrediction", () => {
  it("maps a Twitch response to PredictionState", () => {
    const mapped = mapTwitchPrediction({
      id: "pred-1",
      title: "Will we win?",
      status: "ACTIVE",
      created_at: "2026-01-01T00:00:00Z",
      prediction_window: 120,
      outcomes: [
        { id: "a", title: "Yes", color: "blue", users: 3, channel_points: 30 },
        { id: "b", title: "No", color: "pink", users: 2, channel_points: 20 },
      ],
    });

    expect(mapped).toEqual({
      id: "pred-1",
      title: "Will we win?",
      outcomes: [
        { id: "a", title: "Yes", color: "blue", users: 3, channelPoints: 30 },
        { id: "b", title: "No", color: "pink", users: 2, channelPoints: 20 },
      ],
      totalPoints: 50,
      totalUsers: 5,
      status: "active",
      winningOutcomeId: undefined,
      endsAt: new Date("2026-01-01T00:02:00Z"),
      lockedAt: undefined,
    });
  });

  it("maps locked and resolved states", () => {
    const locked = mapTwitchPrediction({
      id: "pred-2",
      title: "Will we win?",
      status: "LOCKED",
      locked_at: "2026-01-01T00:01:00Z",
      outcomes: [{ id: "a", title: "Yes" }],
    });
    expect(locked.status).toBe("locked");
    expect(locked.lockedAt).toEqual(new Date("2026-01-01T00:01:00Z"));
    expect(locked.endsAt).toEqual(new Date("2026-01-01T00:01:00Z"));

    const resolved = mapTwitchPrediction({
      id: "pred-2",
      title: "Will we win?",
      status: "RESOLVED",
      winning_outcome_id: "a",
      outcomes: [{ id: "a", title: "Yes" }],
    });
    expect(resolved.status).toBe("resolved");
    expect(resolved.winningOutcomeId).toBe("a");
  });

  it("maps canceled predictions and defaults missing fields", () => {
    const mapped = mapTwitchPrediction({
      id: "pred-3",
      title: "Will we win?",
      status: "CANCELED",
      outcomes: [{ id: "a", title: "Yes" }],
    });

    expect(mapped.status).toBe("canceled");
    expect(mapped.outcomes[0]).toEqual({
      id: "a",
      title: "Yes",
      color: "blue",
      users: 0,
      channelPoints: 0,
    });
    expect(mapped.endsAt).toBeUndefined();
  });
});
