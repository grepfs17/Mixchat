import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetModerationActorsForTests,
  recentModerationActor,
  rememberModerationActor,
} from "../../src/lib/twitchModerationActions";

afterEach(() => {
  __resetModerationActorsForTests();
  vi.useRealTimers();
});

describe("twitchModerationActions", () => {
  it("returns the actor for the matching action and target", () => {
    rememberModerationActor("timeout", "Troll", "SomeMod");
    expect(recentModerationActor("timeout", "troll")).toBe("SomeMod");
    expect(recentModerationActor("ban", "troll")).toBeUndefined();
  });

  it("ignores empty names and targets", () => {
    rememberModerationActor("ban", "troll", "   ");
    rememberModerationActor("ban", "   ", "SomeMod");
    expect(recentModerationActor("ban", "troll")).toBeUndefined();
  });

  it("expires entries after the TTL", () => {
    vi.useFakeTimers();
    rememberModerationActor("ban", "troll", "SomeMod");
    vi.advanceTimersByTime(30_001);
    expect(recentModerationActor("ban", "troll")).toBeUndefined();
  });
});
