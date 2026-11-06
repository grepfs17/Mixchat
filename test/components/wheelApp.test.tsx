import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const { fetchWheelMock, listWheelsMock, updateWheelMock, deleteWheelMock, createWheelMock } =
  vi.hoisted(() => ({
    fetchWheelMock: vi.fn(),
    listWheelsMock: vi.fn(),
    updateWheelMock: vi.fn(),
    deleteWheelMock: vi.fn(),
    createWheelMock: vi.fn(),
  }));

vi.mock("../../src/lib/wheel/api", () => ({
  fetchWheel: fetchWheelMock,
  listWheels: listWheelsMock,
  updateWheel: updateWheelMock,
  deleteWheel: deleteWheelMock,
  createWheel: createWheelMock,
}));

vi.mock("../../src/lib/wheel/tokenStore", () => ({
  getWheelToken: vi.fn(async () => null),
  setWheelToken: vi.fn(async () => undefined),
  removeWheelToken: vi.fn(async () => undefined),
}));

vi.mock("../../src/lib/themes", () => ({
  applyTheme: vi.fn(),
}));

import WheelApp from "../../src/components/wheel/WheelApp";
import type { WheelPublicView, WheelSummary } from "../../src/lib/wheel/types";

function summary(overrides: Partial<WheelSummary> = {}): WheelSummary {
  return {
    id: "w1",
    name: "First",
    optionCount: 2,
    isPublic: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function wheel(overrides: Partial<WheelPublicView> = {}): WheelPublicView {
  return {
    id: "w1",
    name: "First",
    options: ["Red", "Blue"],
    isPublic: false,
    channelName: "alice",
    channelPlatform: "twitch",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 0,
    ...overrides,
  };
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  window.history.replaceState({}, "", "/wheel?channel=twitch:alice");
  fetchWheelMock.mockReset();
  listWheelsMock.mockReset();
  updateWheelMock.mockReset();
  deleteWheelMock.mockReset();
  createWheelMock.mockReset();
  listWheelsMock.mockResolvedValue([summary()]);
  fetchWheelMock.mockResolvedValue(wheel());
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
});

describe("WheelApp", () => {
  it("renders the selected wheel", async () => {
    render(<WheelApp />);
    await flush();
    expect(screen.getByDisplayValue("First")).toBeTruthy();
  });

  it("no longer offers share or copy-link controls", async () => {
    // A previously public wheel still renders, but there is no way to share
    // it or copy its link from the manager.
    listWheelsMock.mockResolvedValue([summary({ isPublic: true })]);
    fetchWheelMock.mockResolvedValue(wheel({ isPublic: true }));

    render(<WheelApp />);
    await flush();

    expect(screen.getByDisplayValue("First")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /share/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /copy link/i }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: /make private/i }),
    ).toBeNull();
  });

  it("reflects a remote rename without reloading", async () => {
    render(<WheelApp />);
    await flush();
    expect(screen.getByDisplayValue("First")).toBeTruthy();

    listWheelsMock.mockResolvedValue([
      summary({ name: "Renamed", updatedAt: "2026-01-01T00:05:00.000Z" }),
    ]);
    fetchWheelMock.mockResolvedValue(
      wheel({
        name: "Renamed",
        version: 1,
        updatedAt: "2026-01-01T00:05:00.000Z",
      }),
    );

    await advance(2000);

    expect(screen.getByDisplayValue("Renamed")).toBeTruthy();
    // The draft matches the remote copy, so there is nothing to save.
    expect(
      screen.queryByRole("button", { name: /save changes/i }),
    ).toBeNull();
  });

  it("keeps local unsaved edits while a remote change arrives", async () => {
    render(<WheelApp />);
    await flush();

    const input = screen.getByDisplayValue("First") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "My draft" } });

    fetchWheelMock.mockResolvedValue(
      wheel({
        name: "Renamed remotely",
        version: 1,
        updatedAt: "2026-01-01T00:05:00.000Z",
      }),
    );

    await advance(2000);

    expect(screen.getByDisplayValue("My draft")).toBeTruthy();
    expect(screen.queryByDisplayValue("Renamed remotely")).toBeNull();
  });

  it("picks up a wheel created on another device while none is selected", async () => {
    listWheelsMock.mockResolvedValue([]);
    render(<WheelApp />);
    await flush();
    expect(screen.getByText(/create a wheel or pick one/i)).toBeTruthy();

    listWheelsMock.mockResolvedValue([summary()]);
    await advance(10_000);

    expect(screen.getByDisplayValue("First")).toBeTruthy();
  });

  it("reflects a winner recorded on another device without reloading", async () => {
    render(<WheelApp />);
    await flush();
    expect(screen.getByText(/no winners yet/i)).toBeTruthy();

    fetchWheelMock.mockResolvedValue(
      wheel({
        version: 1,
        history: [{ name: "Champion", time: "10:00:00 01/01" }],
      }),
    );

    await advance(2000);

    expect(screen.getByText("Champion")).toBeTruthy();
    expect(screen.getByText("10:00:00 01/01")).toBeTruthy();
  });

  it("pauses syncing after a 429 instead of hammering the rate limiter", async () => {
    render(<WheelApp />);
    await flush();
    expect(fetchWheelMock).toHaveBeenCalledTimes(1);

    const throttled = Object.assign(new Error("Too many requests"), {
      status: 429,
      retryAfterSec: 60,
    });
    fetchWheelMock.mockRejectedValue(throttled);
    listWheelsMock.mockRejectedValue(throttled);

    // First poll is throttled.
    await advance(2_000);
    expect(fetchWheelMock).toHaveBeenCalledTimes(2);

    // Well inside the Retry-After window neither endpoint is touched.
    await advance(20_000);
    expect(fetchWheelMock).toHaveBeenCalledTimes(2);
    expect(listWheelsMock).toHaveBeenCalledTimes(1);

    // Once the pause expires syncing resumes.
    await advance(45_000);
    expect(fetchWheelMock.mock.calls.length).toBeGreaterThan(2);
  });

  it("drops a wheel that was deleted on another device", async () => {
    listWheelsMock.mockResolvedValue([
      summary(),
      summary({ id: "w2", name: "Other" }),
    ]);
    fetchWheelMock
      .mockResolvedValueOnce(wheel())
      .mockImplementation((id: string) =>
        id === "w1"
          ? Promise.reject(
              Object.assign(new Error("Wheel not found"), { status: 404 }),
            )
          : Promise.resolve(wheel({ id: "w2", name: "Other" })),
      );

    render(<WheelApp />);
    await flush();
    expect(screen.getByDisplayValue("First")).toBeTruthy();

    await advance(2_000);

    // The selection moves on to the remaining wheel instead of sticking on a
    // wheel that no longer exists.
    expect(screen.queryByDisplayValue("First")).toBeNull();
    expect(screen.getByDisplayValue("Other")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^First/ })).toBeNull();
  });

  it("does not resurrect a locally deleted wheel from a stale list", async () => {
    listWheelsMock.mockResolvedValue([
      summary(),
      summary({ id: "w2", name: "Other" }),
    ]);
    fetchWheelMock.mockImplementation((id: string) =>
      Promise.resolve(
        id === "w2" ? wheel({ id: "w2", name: "Other" }) : wheel(),
      ),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<WheelApp />);
    await flush();
    expect(screen.getByDisplayValue("First")).toBeTruthy();

    fireEvent.click(
      screen.getAllByRole("button", { name: "Delete wheel" })[0],
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByDisplayValue("Other")).toBeTruthy();

    // A list response that predates the delete still contains the old wheel.
    await advance(10_000);
    expect(screen.queryByRole("button", { name: /^First/ })).toBeNull();
  });

  it("clears winners through the server", async () => {
    fetchWheelMock.mockResolvedValue(
      wheel({ history: [{ name: "Champion", time: "10:00:00 01/01" }] }),
    );
    const confirmSpy = vi
      .spyOn(window, "confirm")
      .mockReturnValue(true);

    render(<WheelApp />);
    await flush();
    expect(screen.getByText("Champion")).toBeTruthy();

    updateWheelMock.mockResolvedValue(
      wheel({ history: [], version: 1 }),
    );
    fireEvent.click(screen.getByRole("button", { name: /^clear$/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(updateWheelMock).toHaveBeenCalledWith(
      "w1",
      { clearHistory: true },
      expect.objectContaining({ channelKey: "twitch:alice" }),
    );
    expect(screen.queryByText("Champion")).toBeNull();
    expect(confirmSpy).toHaveBeenCalled();
  });
});
