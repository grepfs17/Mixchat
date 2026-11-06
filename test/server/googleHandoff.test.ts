import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  completeHandoff,
  createHandoff,
  failHandoff,
  findByState,
  resetGoogleHandoffsForTests,
  takeResult,
} from "../../src/server/googleHandoff";

const RESULT = {
  flow: "youtube" as const,
  accessToken: "access-token",
  refreshToken: "refresh-token",
  expiresIn: 3600,
  session: {
    platform: "youtube" as const,
    userId: "channel-1",
    displayName: "Mixchat",
    accessToken: "access-token",
    refreshToken: "refresh-token",
    expiresAt: 1_800_000_000_000,
    timestamp: 1_700_000_000_000,
  },
};

beforeEach(() => {
  resetGoogleHandoffsForTests();
});

describe("googleHandoff", () => {
  it("creates a handoff with a state, id and PKCE challenge", () => {
    const handoff = createHandoff("youtube", 1_000);
    expect(handoff.id).toMatch(/^[0-9a-f]{48}$/);
    expect(handoff.state).toMatch(/^[0-9a-f]{48}$/);
    expect(handoff.codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(handoff.flow).toBe("youtube");

    const stored = findByState(handoff.state, 1_000);
    expect(stored).not.toBeNull();
    expect(stored?.flow).toBe("youtube");

    const expectedChallenge = createHash("sha256")
      .update(stored!.codeVerifier)
      .digest("base64url");
    expect(handoff.codeChallenge).toBe(expectedChallenge);
  });

  it("reports pending until the callback completes the exchange", () => {
    const handoff = createHandoff("youtube", 1_000);
    expect(takeResult(handoff.id, 1_000)).toEqual({ status: "pending" });

    expect(completeHandoff(handoff.id, RESULT)).toBe(true);
    expect(takeResult(handoff.id, 1_000)).toEqual({
      status: "complete",
      result: RESULT,
    });
  });

  it("consumes a completed handoff exactly once", () => {
    const handoff = createHandoff("youtube", 1_000);
    completeHandoff(handoff.id, RESULT);

    expect(takeResult(handoff.id, 1_000).status).toBe("complete");
    expect(takeResult(handoff.id, 1_000)).toEqual({ status: "expired" });
  });

  it("surfaces a callback failure to the poller", () => {
    const handoff = createHandoff("youtube", 1_000);
    expect(failHandoff(handoff.id, "No YouTube channel")).toBe(true);

    expect(takeResult(handoff.id, 1_000)).toEqual({
      status: "error",
      message: "No YouTube channel",
    });
    expect(takeResult(handoff.id, 1_000)).toEqual({ status: "expired" });
  });

  it("expires a handoff after the TTL", () => {
    const handoff = createHandoff("youtube", 1_000);
    expect(findByState(handoff.state, 1_000 + 10 * 60 * 1000)).not.toBeNull();
    expect(findByState(handoff.state, 1_000 + 10 * 60 * 1000 + 1)).toBeNull();
    expect(takeResult(handoff.id, 1_000 + 10 * 60 * 1000 + 1)).toEqual({
      status: "expired",
    });
  });

  it("caps the number of pending handoffs", () => {
    const first = createHandoff("youtube", 1_000);
    for (let index = 0; index < 20; index += 1) {
      createHandoff("youtube", 1_000 + index);
    }

    expect(findByState(first.state, 1_000)).toBeNull();
    expect(takeResult(first.id, 1_000)).toEqual({ status: "expired" });
  });
});
