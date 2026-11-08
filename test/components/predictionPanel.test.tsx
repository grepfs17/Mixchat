import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PredictionPanel from "../../src/components/chat/shared/PredictionPanel";
import type { UsePredictionCreatorResult } from "../../src/hooks/chat/usePredictionCreator";
import type { PredictionState } from "../../src/components/chat/shared/bannerTypes";

function makeCreator(
  overrides: Partial<UsePredictionCreatorResult> = {},
): UsePredictionCreatorResult {
  return {
    phase: "config",
    config: {
      title: "",
      outcomes: ["", ""],
      windowSeconds: 120,
    },
    error: null,
    starting: false,
    acting: false,
    setField: vi.fn(),
    setOutcome: vi.fn(),
    addOutcome: vi.fn(),
    removeOutcome: vi.fn(),
    start: vi.fn(async () => {}),
    lock: vi.fn(async () => {}),
    resolve: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
    startNew: vi.fn(),
    ...overrides,
  };
}

const activePrediction: PredictionState = {
  id: "pred-1",
  title: "Will we win?",
  outcomes: [
    { id: "a", title: "Yes", color: "blue", users: 3, channelPoints: 30 },
    { id: "b", title: "No", color: "pink", users: 2, channelPoints: 20 },
  ],
  totalPoints: 50,
  totalUsers: 5,
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

describe("PredictionPanel", () => {
  it("renders the config form", () => {
    render(<PredictionPanel prediction={makeCreator()} livePrediction={null} />);

    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByLabelText("Outcome 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Outcome 2")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start prediction" }),
    ).toBeInTheDocument();
  });

  it("calls start when the form is submitted", () => {
    const creator = makeCreator();
    render(<PredictionPanel prediction={creator} livePrediction={null} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Start prediction" }),
    );

    expect(creator.start).toHaveBeenCalledTimes(1);
  });

  it("adds and removes outcomes through the hook", () => {
    const creator = makeCreator({
      config: {
        ...makeCreator().config,
        outcomes: ["Yes", "No", "Maybe"],
      },
    });
    render(<PredictionPanel prediction={creator} livePrediction={null} />);

    fireEvent.click(
      screen.getByRole("button", { name: /add outcome/i }),
    );
    expect(creator.addOutcome).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole("button", { name: "Remove outcome 1" }),
    );
    expect(creator.removeOutcome).toHaveBeenCalledWith(0);
  });

  it("disables creation for moderators", () => {
    render(
      <PredictionPanel
        prediction={makeCreator()}
        livePrediction={null}
        role="moderator"
      />,
    );

    expect(
      screen.getByText("Only the broadcaster can create Twitch predictions."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start prediction" }),
    ).toBeDisabled();
  });

  it("shows active outcomes and locks or cancels", () => {
    const creator = makeCreator({ phase: "active" });
    render(
      <PredictionPanel
        prediction={creator}
        livePrediction={activePrediction}
      />,
    );

    expect(screen.getByText("Will we win?")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("5 predictors")).toBeInTheDocument();
    expect(screen.getByText("50 points")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Lock prediction" }),
    );
    expect(creator.lock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(creator.cancel).toHaveBeenCalledTimes(1);
  });

  it("requires a winning outcome before resolving a locked prediction", () => {
    const creator = makeCreator({ phase: "locked" });
    render(
      <PredictionPanel
        prediction={creator}
        livePrediction={lockedPrediction}
      />,
    );

    const resolve = screen.getByRole("button", { name: /resolve/i });
    expect(resolve).toBeDisabled();

    fireEvent.click(screen.getByRole("radio", { name: "Yes" }));
    expect(resolve).not.toBeDisabled();

    fireEvent.click(resolve);
    expect(creator.resolve).toHaveBeenCalledWith("a");
  });

  it("shows the winner and starts a new prediction", () => {
    const creator = makeCreator({ phase: "ended" });
    render(
      <PredictionPanel
        prediction={creator}
        livePrediction={resolvedPrediction}
      />,
    );

    expect(screen.getByText("Resolved")).toBeInTheDocument();
    expect(screen.getByText("Winner")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "New prediction" }),
    );
    expect(creator.startNew).toHaveBeenCalledTimes(1);
  });
});
