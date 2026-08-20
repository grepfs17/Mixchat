import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import ChatHeader from "../../src/components/chat/display/ChatHeader";

function openStatusDropdown() {
  fireEvent.click(
    screen.getByTitle("Event connection status"),
  );
}

describe("ChatHeader — redemption PubSub status", () => {
  it("shows the PubSub feed status as connected in the dropdown", () => {
    render(
      <ChatHeader
        subscriptionStatuses={new Map()}
        redemptionPubSubStatus="connected"
      />,
    );

    openStatusDropdown();

    expect(screen.getByText("Channel Points (PubSub)")).toBeInTheDocument();
    expect(screen.getByText("connected")).toBeInTheDocument();
  });

  it("labels a disabled PubSub feed as disabled", () => {
    render(
      <ChatHeader
        subscriptionStatuses={new Map()}
        redemptionPubSubStatus="disconnected"
      />,
    );

    openStatusDropdown();

    const section = screen
      .getByText("Channel Points (PubSub)")
      .closest(".eventsub-status-section") as HTMLElement;
    expect(within(section).getByText("disabled")).toBeInTheDocument();
  });

  it("renders the error state for a dropped PubSub connection", () => {
    render(
      <ChatHeader
        subscriptionStatuses={new Map()}
        redemptionPubSubStatus="error"
      />,
    );

    openStatusDropdown();

    expect(screen.getByText("Channel Points (PubSub)")).toBeInTheDocument();
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("does not render the PubSub row when the status is not provided", () => {
    render(<ChatHeader subscriptionStatuses={new Map()} />);

    openStatusDropdown();

    expect(
      screen.queryByText("Channel Points (PubSub)"),
    ).not.toBeInTheDocument();
  });
});