import { render, screen, fireEvent } from "@testing-library/react";
import { act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import CelebrationBanner, {
  type CelebrationState,
} from "../../src/components/chat/shared/CelebrationBanner";

vi.mock("react-icons/fa", () => ({
  FaTimes: () => <span data-testid="fa-times">X</span>,
  FaStar: () => <span data-testid="fa-star">Star</span>,
}));

const baseCelebration: CelebrationState = {
  id: "cele-1",
  userName: "testuser",
  userDisplayName: "TestUser",
  bitsUsed: 100,
  totalBitsUsed: 500,
  messageEffectId: null,
  endsAt: new Date(Date.now() + 60000),
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CelebrationBanner", () => {
  it("renders the Celebration label and user name", () => {
    render(
      <CelebrationBanner
        celebration={baseCelebration}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText("CELEBRATION")).toBeInTheDocument();
    expect(screen.getByText("TestUser")).toBeInTheDocument();
  });

  it("displays bits count", () => {
    render(
      <CelebrationBanner
        celebration={baseCelebration}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText("100 bits")).toBeInTheDocument();
  });

  it("formats large bits counts with locale", () => {
    const bigBits = { ...baseCelebration, bitsUsed: 5000 };
    render(
      <CelebrationBanner celebration={bigBits} onDismiss={vi.fn()} />,
    );

    expect(screen.getByText("5,000 bits")).toBeInTheDocument();
  });

  it("calls onDismiss after timer expires", () => {
    const onDismiss = vi.fn();
    const soonCelebration = {
      ...baseCelebration,
      endsAt: new Date(Date.now() + 1000),
    };
    render(
      <CelebrationBanner
        celebration={soonCelebration}
        onDismiss={onDismiss}
      />,
    );

    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("requires double-click to dismiss early", () => {
    const onDismiss = vi.fn();
    render(
      <CelebrationBanner
        celebration={baseCelebration}
        onDismiss={onDismiss}
      />,
    );

    const closeBtn = screen.getByLabelText(
      "Dismiss celebration notification",
    );
    fireEvent.click(closeBtn);
    expect(onDismiss).not.toHaveBeenCalled();

    expect(screen.getByText("Press again to close")).toBeInTheDocument();

    fireEvent.click(closeBtn);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("resets confirm-close on blur", () => {
    const onDismiss = vi.fn();
    render(
      <CelebrationBanner
        celebration={baseCelebration}
        onDismiss={onDismiss}
      />,
    );

    const closeBtn = screen.getByLabelText(
      "Dismiss celebration notification",
    );
    fireEvent.click(closeBtn);
    expect(screen.getByText("Press again to close")).toBeInTheDocument();

    fireEvent.blur(closeBtn);
    expect(
      screen.queryByText("Press again to close"),
    ).not.toBeInTheDocument();
  });

  it("has an accessible role", () => {
    render(
      <CelebrationBanner
        celebration={baseCelebration}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});