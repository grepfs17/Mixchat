import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import PollBanner, { type PollState } from "../../src/components/chat/shared/PollBanner";

vi.mock("react-icons/fa", () => ({
  FaTimes: () => <span data-testid="fa-times">X</span>,
  FaPoll: () => <span data-testid="fa-poll">Poll</span>,
}));

const basePoll: PollState = {
  id: "poll-1",
  title: "What game should we play?",
  choices: [
    { id: "1", title: "Valorant", votes: 142 },
    { id: "2", title: "League of Legends", votes: 89 },
    { id: "3", title: "Minecraft", votes: 56 },
  ],
  totalVotes: 287,
  endsAt: new Date(Date.now() + 60 * 1000),
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("PollBanner", () => {
  it("renders poll title and choices", () => {
    render(<PollBanner poll={basePoll} onDismiss={vi.fn()} />);

    expect(screen.getByText("What game should we play?")).toBeInTheDocument();
    expect(screen.getByText("Valorant")).toBeInTheDocument();
    expect(screen.getByText("League of Legends")).toBeInTheDocument();
    expect(screen.getByText("Minecraft")).toBeInTheDocument();
  });

  it("displays vote counts for each choice", () => {
    render(<PollBanner poll={basePoll} onDismiss={vi.fn()} />);

    expect(screen.getByText(/142 votes/)).toBeInTheDocument();
    expect(screen.getByText(/89 votes/)).toBeInTheDocument();
    expect(screen.getByText(/56 votes/)).toBeInTheDocument();
  });

  it("displays total votes", () => {
    render(<PollBanner poll={basePoll} onDismiss={vi.fn()} />);

    expect(screen.getByText("287 total votes")).toBeInTheDocument();
  });

  it("shows Live Poll badge for active polls", () => {
    render(<PollBanner poll={basePoll} onDismiss={vi.fn()} />);

    expect(screen.getByText("Live Poll")).toBeInTheDocument();
  });

  it("shows Poll Ended badge when status is completed", () => {
    const endedPoll: PollState = {
      ...basePoll,
      status: "completed",
    };
    render(<PollBanner poll={endedPoll} onDismiss={vi.fn()} />);

    expect(screen.getByText("Poll Ended")).toBeInTheDocument();
  });

  it("shows Ended Early badge when status is terminated", () => {
    const terminatedPoll: PollState = {
      ...basePoll,
      status: "terminated",
    };
    render(<PollBanner poll={terminatedPoll} onDismiss={vi.fn()} />);

    expect(screen.getByText("Ended Early")).toBeInTheDocument();
  });

  it("shows Archived badge when status is archived", () => {
    const archivedPoll: PollState = {
      ...basePoll,
      status: "archived",
    };
    render(<PollBanner poll={archivedPoll} onDismiss={vi.fn()} />);

    expect(screen.getByText("Archived")).toBeInTheDocument();
  });

  it("calls onDismiss after double-click on close button", () => {
    const onDismiss = vi.fn();
    render(<PollBanner poll={basePoll} onDismiss={onDismiss} />);

    const closeBtn = screen.getByLabelText("Dismiss poll notification");

    fireEvent.click(closeBtn);
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.click(closeBtn);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("shows tooltip on first click of close button", () => {
    render(<PollBanner poll={basePoll} onDismiss={vi.fn()} />);

    const closeBtn = screen.getByLabelText("Dismiss poll notification");
    fireEvent.click(closeBtn);

    expect(screen.getByText("Press again to close")).toBeInTheDocument();
  });

  it("highlights winning choice in ended poll", () => {
    const endedPoll: PollState = {
      ...basePoll,
      status: "completed",
    };
    render(<PollBanner poll={endedPoll} onDismiss={vi.fn()} />);

    const winnerElement = screen.getByText("Valorant").closest(".poll-banner-choice");
    expect(winnerElement).toHaveClass("poll-banner-choice--winner");
  });

  it("displays countdown timer for active poll", () => {
    render(<PollBanner poll={basePoll} onDismiss={vi.fn()} />);

    expect(screen.getByText(/Ends in \d+m \d+s|^Ends in \d+s$/)).toBeInTheDocument();
  });

  it("shows Final results for ended poll", () => {
    const endedPoll: PollState = {
      ...basePoll,
      status: "completed",
    };
    render(<PollBanner poll={endedPoll} onDismiss={vi.fn()} />);

    expect(screen.getByText("Final results")).toBeInTheDocument();
  });

  it("displays vote percentage for choices", () => {
    render(<PollBanner poll={basePoll} onDismiss={vi.fn()} />);

    expect(screen.getByText(/142 votes · 49%/)).toBeInTheDocument();
    expect(screen.getByText(/89 votes · 31%/)).toBeInTheDocument();
    expect(screen.getByText(/56 votes · 20%/)).toBeInTheDocument();
  });
});