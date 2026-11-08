import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePredictionCreator } from "../../../src/hooks/chat/usePredictionCreator";
import {
  createTwitchPrediction,
  updateTwitchPrediction,
} from "../../../src/lib/twitch";
import type { PredictionState } from "../../../src/components/chat/shared/bannerTypes";

vi.mock("../../../src/lib/twitch", () => ({
  createTwitchPrediction: vi.fn(),
  updateTwitchPrediction: vi.fn(),
}));

const activePrediction: PredictionState = {
  id: "pred-1",
  title: "Will we win?",
  outcomes: [
    { id: "a", title: "Yes", color: "blue", users: 0, channelPoints: 0 },
    { id: "b", title: "No", color: "pink", users: 0, channelPoints: 0 },
  ],
  totalPoints: 0,
  totalUsers: 0,
  status: "active",
  endsAt: new Date(Date.now() + 60_000),
};

const lockedPrediction: PredictionState = {
  ...activePrediction,
  status: "locked",
};

const resolvedPrediction: PredictionState = {
  ...activePrediction,
  status: "resolved",
  winningOutcomeId: "a",
};

const canceledPrediction: PredictionState = {
  ...activePrediction,
  status: "canceled",
};

function setup(livePrediction: PredictionState | null = null, canManage = true) {
  const setPrediction = vi.fn();
  const onNotify = vi.fn();
  const hook = renderHook(
    ({ livePrediction: current }) =>
      usePredictionCreator({
        broadcasterId: "123",
        canManage,
        livePrediction: current,
        setPrediction,
        onNotify,
      }),
    { initialProps: { livePrediction } },
  );
  return { ...hook, setPrediction, onNotify };
}

function fillValidConfig(result: {
  current: ReturnType<typeof usePredictionCreator>;
}) {
  act(() => {
    result.current.setField("title", "Will we win?");
    result.current.setOutcome(0, "Yes");
    result.current.setOutcome(1, "No");
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("usePredictionCreator", () => {
  it("starts in the config phase", () => {
    const { result } = setup();
    expect(result.current.phase).toBe("config");
    expect(result.current.config.outcomes).toHaveLength(2);
  });

  it("validates before calling Twitch", async () => {
    const { result, onNotify } = setup();

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.error).toBe("Enter a prediction title.");
    expect(createTwitchPrediction).not.toHaveBeenCalled();
    expect(onNotify).not.toHaveBeenCalled();
  });

  it("creates a prediction and stores it", async () => {
    vi.mocked(createTwitchPrediction).mockResolvedValue(activePrediction);
    const { result, setPrediction, onNotify } = setup();
    fillValidConfig(result);

    await act(async () => {
      await result.current.start();
    });

    expect(createTwitchPrediction).toHaveBeenCalledWith(
      "123",
      expect.objectContaining({
        title: "Will we win?",
        outcomes: ["Yes", "No"],
      }),
    );
    expect(setPrediction).toHaveBeenCalledWith(activePrediction);
    expect(onNotify).toHaveBeenCalledWith("Prediction started", "success");
  });

  it("surfaces create failures", async () => {
    vi.mocked(createTwitchPrediction).mockRejectedValue(
      new Error("Channel Points are not enabled"),
    );
    const { result, onNotify } = setup();
    fillValidConfig(result);

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.error).toBe("Channel Points are not enabled");
    expect(onNotify).toHaveBeenCalledWith(
      "Channel Points are not enabled",
      "error",
    );
  });

  it("blocks users who cannot manage predictions", async () => {
    const { result } = setup(null, false);
    fillValidConfig(result);

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.error).toBe(
      "Only the broadcaster can create predictions.",
    );
    expect(createTwitchPrediction).not.toHaveBeenCalled();
  });

  it("locks an active prediction", async () => {
    vi.mocked(updateTwitchPrediction).mockResolvedValue(lockedPrediction);
    const { result, setPrediction, onNotify } = setup(activePrediction);

    await act(async () => {
      await result.current.lock();
    });

    expect(updateTwitchPrediction).toHaveBeenCalledWith(
      "123",
      "pred-1",
      "LOCKED",
      undefined,
    );
    expect(setPrediction).toHaveBeenCalledWith(lockedPrediction);
    expect(onNotify).toHaveBeenCalledWith("Prediction locked", "success");
  });

  it("only locks while active", async () => {
    const { result } = setup(lockedPrediction);

    await act(async () => {
      await result.current.lock();
    });

    expect(result.current.error).toBe(
      "A prediction can only be locked while it is active.",
    );
    expect(updateTwitchPrediction).not.toHaveBeenCalled();
  });

  it("resolves a locked prediction with a winning outcome", async () => {
    vi.mocked(updateTwitchPrediction).mockResolvedValue(resolvedPrediction);
    const { result, setPrediction, onNotify } = setup(lockedPrediction);

    await act(async () => {
      await result.current.resolve("a");
    });

    expect(updateTwitchPrediction).toHaveBeenCalledWith(
      "123",
      "pred-1",
      "RESOLVED",
      "a",
    );
    expect(setPrediction).toHaveBeenCalledWith(resolvedPrediction);
    expect(onNotify).toHaveBeenCalledWith(
      "Prediction resolved",
      "success",
    );
  });

  it("requires a winning outcome before resolving", async () => {
    const { result } = setup(lockedPrediction);

    await act(async () => {
      await result.current.resolve("");
    });

    expect(result.current.error).toBe("Choose the winning outcome.");
    expect(updateTwitchPrediction).not.toHaveBeenCalled();
  });

  it("only resolves after locking", async () => {
    const { result } = setup(activePrediction);

    await act(async () => {
      await result.current.resolve("a");
    });

    expect(result.current.error).toBe(
      "Lock the prediction before resolving it.",
    );
    expect(updateTwitchPrediction).not.toHaveBeenCalled();
  });

  it("cancels an active or locked prediction", async () => {
    vi.mocked(updateTwitchPrediction).mockResolvedValue(canceledPrediction);
    const { result, setPrediction, onNotify } = setup(lockedPrediction);

    await act(async () => {
      await result.current.cancel();
    });

    expect(updateTwitchPrediction).toHaveBeenCalledWith(
      "123",
      "pred-1",
      "CANCELED",
      undefined,
    );
    expect(setPrediction).toHaveBeenCalledWith(canceledPrediction);
    expect(onNotify).toHaveBeenCalledWith("Prediction canceled", "success");
  });

  it("reports when there is no active prediction", async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.lock();
    });
    expect(result.current.error).toBe(
      "A prediction can only be locked while it is active.",
    );

    await act(async () => {
      await result.current.cancel();
    });
    expect(result.current.error).toBe(
      "There is no active prediction to cancel.",
    );
  });

  it("resets to a fresh config", () => {
    const { result, setPrediction } = setup(canceledPrediction);
    fillValidConfig(result);

    act(() => {
      result.current.startNew();
    });

    expect(result.current.config.title).toBe("");
    expect(result.current.config.outcomes).toEqual(["", ""]);
    expect(setPrediction).toHaveBeenCalledWith(null);
  });

  it("enforces outcome count bounds locally", () => {
    const { result } = setup();

    act(() => {
      for (let i = 0; i < 10; i++) result.current.addOutcome();
    });
    expect(result.current.config.outcomes).toHaveLength(10);

    act(() => {
      result.current.addOutcome();
    });
    expect(result.current.config.outcomes).toHaveLength(10);

    act(() => {
      for (let i = 0; i < 10; i++) result.current.removeOutcome(0);
    });
    expect(result.current.config.outcomes).toHaveLength(2);
  });
});
