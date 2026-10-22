import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import LoadingScreen, {
  type LoadingStep,
} from "../../src/components/app/LoadingScreen";

const STEPS: LoadingStep[] = [
  {
    id: "session",
    label: "Restoring your session",
    detail: "Reading saved preferences",
    status: "complete",
    weight: 20,
  },
  {
    id: "channels",
    label: "Loading followed channels",
    detail: "Fetching your channel list",
    status: "active",
    weight: 80,
  },
];

describe("LoadingScreen", () => {
  it("renders every stage and the current activity", () => {
    render(<LoadingScreen steps={STEPS} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getAllByText("Loading followed channels")).toHaveLength(2);
    expect(screen.getByText("Fetching your channel list")).toBeInTheDocument();
  });

  it("exposes progress to assistive technology", () => {
    render(<LoadingScreen steps={STEPS} />);

    const progress = screen.getByRole("progressbar", {
      name: "Loading Mixchat",
    });
    expect(progress).toHaveAttribute("aria-valuemin", "0");
    expect(progress).toHaveAttribute("aria-valuemax", "100");
  });
});
