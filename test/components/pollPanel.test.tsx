import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PollPanel from "../../src/components/chat/shared/PollPanel";
import type { UsePollCreatorResult } from "../../src/hooks/chat/usePollCreator";
import type { PollState } from "../../src/components/chat/shared/bannerTypes";

function makeCreator(
  overrides: Partial<UsePollCreatorResult> = {},
): UsePollCreatorResult {
  return {
    phase: "config",
    config: {
      title: "",
      choices: ["", ""],
      duration: 300,
      channelPointsVoting: false,
      channelPointsPerVote: 100,
      bitsVoting: false,
      bitsPerVote: 100,
    },
    error: null,
    starting: false,
    ending: false,
    setField: vi.fn(),
    setChoice: vi.fn(),
    addChoice: vi.fn(),
    removeChoice: vi.fn(),
    start: vi.fn(async () => {}),
    end: vi.fn(async () => {}),
    startNew: vi.fn(),
    ...overrides,
  };
}

const activePoll: PollState = {
  id: "poll-1",
  title: "What should we play?",
  choices: [
    { id: "a", title: "Valorant", votes: 10 },
    { id: "b", title: "Minecraft", votes: 5 },
  ],
  totalVotes: 15,
  endsAt: new Date(Date.now() + 60_000),
  status: "active",
};

describe("PollPanel", () => {
  it("renders the config form", () => {
    render(<PollPanel poll={makeCreator()} livePoll={null} />);

    expect(screen.getByText("Question")).toBeInTheDocument();
    expect(screen.getByLabelText("Choice 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Choice 2")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start poll" }),
    ).toBeInTheDocument();
  });

  it("calls start when the form is submitted", () => {
    const creator = makeCreator();
    render(<PollPanel poll={creator} livePoll={null} />);

    fireEvent.click(screen.getByRole("button", { name: "Start poll" }));

    expect(creator.start).toHaveBeenCalledTimes(1);
  });

  it("adds and removes choices through the hook", () => {
    const creator = makeCreator({
      config: {
        ...makeCreator().config,
        choices: ["A", "B", "C"],
      },
    });
    render(<PollPanel poll={creator} livePoll={null} />);

    fireEvent.click(screen.getByRole("button", { name: /add choice/i }));
    expect(creator.addChoice).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole("button", { name: "Remove choice 1" }),
    );
    expect(creator.removeChoice).toHaveBeenCalledWith(0);
  });

  it("disables creation for moderators", () => {
    render(<PollPanel poll={makeCreator()} livePoll={null} role="moderator" />);

    expect(
      screen.getByText("Only the broadcaster can create Twitch polls."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start poll" })).toBeDisabled();
  });

  it("shows live results and ends the poll", () => {
    const creator = makeCreator({ phase: "active" });
    render(<PollPanel poll={creator} livePoll={activePoll} />);

    expect(screen.getByText("What should we play?")).toBeInTheDocument();
    expect(screen.getByText("Valorant")).toBeInTheDocument();
    expect(screen.getByText("15 total votes")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "End poll" }));
    expect(creator.end).toHaveBeenCalledTimes(1);
  });

  it("shows final results and starts a new poll", () => {
    const creator = makeCreator({ phase: "ended" });
    render(
      <PollPanel
        poll={creator}
        livePoll={{ ...activePoll, status: "terminated" }}
      />,
    );

    expect(screen.getByText("Poll ended")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New poll" }));
    expect(creator.startNew).toHaveBeenCalledTimes(1);
  });
});
