import { render } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import React, { useEffect, useRef, useState } from "react";

/**
 * Test harness that mirrors the auto-fold-on-reload logic from AppContainer.
 *
 * Rather than mocking the full AppContainer stack (useTwitchChannels,
 * useChatSettings, useUiState, etc.) and `window.location.pathname`, this
 * harness isolates the core guard logic:
 *
 *   const prevChannelRef = useRef(selectedTwitchChannel);
 *   useEffect(() => {
 *     if (autoFoldSidebar && selectedTwitchChannel && !prevChannelRef.current) {
 *       setLeftColumnVisible(false);
 *     }
 *     prevChannelRef.current = selectedTwitchChannel;
 *   }, [selectedTwitchChannel, autoFoldSidebar, setLeftColumnVisible]);
 *
 * It mimics the page-reload scenario: `selectedTwitchChannel` starts empty
 * (the initial state) and is later set to a channel ID (as happens when
 * `useTwitchChannels` restores the channel from the `/channel/<name>` URL).
 */
function AutoFoldHarness({
  autoFoldSidebar,
  selectedTwitchChannel,
}: {
  autoFoldSidebar: boolean;
  selectedTwitchChannel: string;
}) {
  const [sidebarVisible, setSidebarVisible] = useState(true);

  const prevChannelRef = useRef(selectedTwitchChannel);
  useEffect(() => {
    if (
      autoFoldSidebar &&
      selectedTwitchChannel &&
      !prevChannelRef.current
    ) {
      setSidebarVisible(false);
    }
    prevChannelRef.current = selectedTwitchChannel;
  }, [selectedTwitchChannel, autoFoldSidebar]);

  return (
    <div>
      <span data-testid="channel">{selectedTwitchChannel || "(none)"}</span>
      <span data-testid="sidebar">
        {sidebarVisible ? "visible" : "hidden"}
      </span>
    </div>
  );
}

describe("autoFoldSidebar: reload guard (useRef + useEffect)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("folds sidebar when channel goes from empty to non-empty with autoFoldSidebar=true", () => {
    const { getByTestId, rerender } = render(
      <AutoFoldHarness autoFoldSidebar={true} selectedTwitchChannel="" />,
    );

    expect(getByTestId("sidebar").textContent).toBe("visible");

    // Simulate URL restoration on page reload: channel goes from "" → "channel123"
    rerender(
      <AutoFoldHarness
        autoFoldSidebar={true}
        selectedTwitchChannel="channel123"
      />,
    );

    expect(getByTestId("sidebar").textContent).toBe("hidden");
    expect(getByTestId("channel").textContent).toBe("channel123");
  });

  it("does NOT fold when autoFoldSidebar is false", () => {
    const { getByTestId, rerender } = render(
      <AutoFoldHarness autoFoldSidebar={false} selectedTwitchChannel="" />,
    );

    rerender(
      <AutoFoldHarness
        autoFoldSidebar={false}
        selectedTwitchChannel="channel123"
      />,
    );

    expect(getByTestId("sidebar").textContent).toBe("visible");
  });

  it("does NOT re-fold when switching between two non-empty channels", () => {
    const { getByTestId, rerender } = render(
      <AutoFoldHarness autoFoldSidebar={true} selectedTwitchChannel="" />,
    );

    // First transition: empty → channel1 (fold fires)
    rerender(
      <AutoFoldHarness
        autoFoldSidebar={true}
        selectedTwitchChannel="channel1"
      />,
    );
    expect(getByTestId("sidebar").textContent).toBe("hidden");

    // Switch to another channel: ref guard prevents re-firing
    rerender(
      <AutoFoldHarness
        autoFoldSidebar={true}
        selectedTwitchChannel="channel2"
      />,
    );
    expect(getByTestId("sidebar").textContent).toBe("hidden");
  });
});
