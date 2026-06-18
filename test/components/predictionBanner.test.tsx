import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import PredictionBanner, {
  type PredictionState,
} from "../../src/components/chat/shared/PredictionBanner";

vi.mock("react-icons/fa", () => ({
  FaTimes: () => <span data-testid="fa-times">X</span>,
  FaMagic: () => <span data-testid="fa-magic">Magic</span>,
}));

const basePrediction: PredictionState = {
  id: "pred-1",
  title: "Will we win this game?",
  outcomes: [
    { id: "o1", title: "Yes!", color: "blue", users: 10, channelPoints: 15000 },
    { id: "o2", title: "No!", color: "pink", users: 5, channelPoints: 5000 },
  ],
  totalPoints: 20000,
  totalUsers: 15,
  status: "active",
  endsAt: new Date(Date.now() + 5 * 60 * 1000),
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PredictionBanner", () => {
  it("renders prediction title and outcomes", () => {
    render(
      <PredictionBanner prediction={basePrediction} onDismiss={vi.fn()} />,
    );

    expect(screen.getByText("Will we win this game?")).toBeInTheDocument();
    expect(screen.getByText("Yes!")).toBeInTheDocument();
    expect(screen.getByText("No!")).toBeInTheDocument();
  });

  it("displays channel points for each outcome", () => {
    render(
      <PredictionBanner prediction={basePrediction} onDismiss={vi.fn()} />,
    );

    expect(screen.getAllByText(/15,000 pts/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/5,000 pts/).length).toBeGreaterThanOrEqual(1);
  });

  it("displays total predictors and points", () => {
    render(
      <PredictionBanner prediction={basePrediction} onDismiss={vi.fn()} />,
    );

    expect(
      screen.getByText("15 predictors · 20,000 points"),
    ).toBeInTheDocument();
  });

  it("shows Live Prediction badge for active prediction", () => {
    render(
      <PredictionBanner prediction={basePrediction} onDismiss={vi.fn()} />,
    );

    expect(screen.getByText("Live Prediction")).toBeInTheDocument();
  });

  it("shows Result badge when resolved", () => {
    const resolved: PredictionState = {
      ...basePrediction,
      status: "resolved",
      winningOutcomeId: "o1",
    };
    render(<PredictionBanner prediction={resolved} onDismiss={vi.fn()} />);

    expect(screen.getByText("Result")).toBeInTheDocument();
  });

  it("shows Locked badge when locked", () => {
    const locked: PredictionState = {
      ...basePrediction,
      status: "locked",
    };
    render(<PredictionBanner prediction={locked} onDismiss={vi.fn()} />);

    expect(screen.getByText("Locked")).toBeInTheDocument();
  });

  it("shows Canceled badge when canceled", () => {
    const canceled: PredictionState = {
      ...basePrediction,
      status: "canceled",
    };
    render(<PredictionBanner prediction={canceled} onDismiss={vi.fn()} />);

    expect(screen.getByText("Canceled")).toBeInTheDocument();
  });

  it("highlights winning outcome when resolved with winningOutcomeId", () => {
    const resolved: PredictionState = {
      ...basePrediction,
      status: "resolved",
      winningOutcomeId: "o1",
    };
    render(<PredictionBanner prediction={resolved} onDismiss={vi.fn()} />);

    const winner = screen
      .getByText("Yes!")
      .closest(".prediction-banner-outcome");
    expect(winner).toHaveClass("prediction-banner-outcome--winner");
    expect(screen.getByText("Winner")).toBeInTheDocument();
  });

  it("calls onDismiss after double-click on close button", () => {
    const onDismiss = vi.fn();
    render(
      <PredictionBanner prediction={basePrediction} onDismiss={onDismiss} />,
    );

    const closeBtn = screen.getByLabelText("Dismiss prediction notification");

    fireEvent.click(closeBtn);
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.click(closeBtn);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("shows tooltip on first click of close button", () => {
    render(
      <PredictionBanner prediction={basePrediction} onDismiss={vi.fn()} />,
    );

    const closeBtn = screen.getByLabelText("Dismiss prediction notification");
    fireEvent.click(closeBtn);

    expect(screen.getByText("Press again to close")).toBeInTheDocument();
  });

  it("displays countdown timer for active prediction", () => {
    render(
      <PredictionBanner prediction={basePrediction} onDismiss={vi.fn()} />,
    );

    expect(screen.getByText(/Ends in \d+m \d+s/)).toBeInTheDocument();
  });

  it("shows Locked — waiting for result for locked prediction", () => {
    const locked: PredictionState = {
      ...basePrediction,
      status: "locked",
    };
    render(<PredictionBanner prediction={locked} onDismiss={vi.fn()} />);

    expect(screen.getByText("Locked — waiting for result")).toBeInTheDocument();
  });

  it("shows Final result for resolved prediction", () => {
    const resolved: PredictionState = {
      ...basePrediction,
      status: "resolved",
      winningOutcomeId: "o1",
    };
    render(<PredictionBanner prediction={resolved} onDismiss={vi.fn()} />);

    expect(screen.getByText("Final result")).toBeInTheDocument();
  });

  it("displays percentage for outcomes", () => {
    render(
      <PredictionBanner prediction={basePrediction} onDismiss={vi.fn()} />,
    );

    expect(screen.getByText(/15,000 pts · 75%/)).toBeInTheDocument();
    expect(screen.getByText(/5,000 pts · 25%/)).toBeInTheDocument();
  });
});
