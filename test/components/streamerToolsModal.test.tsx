import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";

vi.mock("../../src/hooks/chat/usePastPlaylists", () => ({
  usePastPlaylists: () => ({
    combined: [],
    localEntries: [],
    openKey: null,
    setOpenKey: () => {},
    openMeta: null,
    openPublicUrl: null,
    loadingServer: false,
    serverError: null,
    serverDetail: null,
    loadingDetail: false,
    detailError: null,
    linkCopied: false,
    copiedItemId: null,
    makingPublic: false,
    publicError: null,
    handleDelete: async () => {},
    handleClear: async () => {},
    handleCopyPublicUrl: () => {},
    handleCopySongUrl: () => {},
    handleMakePublic: async () => {},
  }),
}));

import StreamerToolsModal from "../../src/components/chat/shared/StreamerToolsModal";
import type { UseGiveawayResult } from "../../src/hooks/chat/useGiveaway";
import type { UsePollCreatorResult } from "../../src/hooks/chat/usePollCreator";
import type { UsePredictionCreatorResult } from "../../src/hooks/chat/usePredictionCreator";
import type { UseSongQueueResult } from "../../src/hooks/chat/useSongQueue";
import type { UseMusicPlayerResult } from "../../src/hooks/chat/useMusicPlayer";

function makeModalProps(overrides: Record<string, unknown> = {}) {
  return {
    giveaway: {
      phase: "config",
      history: [],
      clearHistory: () => {},
    } as unknown as UseGiveawayResult,
    poll: {
      phase: "config",
      config: { title: "", choices: ["", ""], duration: 300 },
      error: null,
      starting: false,
      ending: false,
      setField: () => {},
      setChoice: () => {},
      addChoice: () => {},
      removeChoice: () => {},
      start: async () => {},
      end: async () => {},
      startNew: () => {},
    } as unknown as UsePollCreatorResult,
    livePoll: null,
    prediction: {
      phase: "config",
      config: { title: "", outcomes: ["", ""], windowSeconds: 120 },
      error: null,
      starting: false,
      acting: false,
      setField: () => {},
      setOutcome: () => {},
      addOutcome: () => {},
      removeOutcome: () => {},
      start: async () => {},
      lock: async () => {},
      resolve: async () => {},
      cancel: async () => {},
      startNew: () => {},
    } as unknown as UsePredictionCreatorResult,
    livePrediction: null,
    songQueue: { phase: "idle" } as unknown as UseSongQueueResult,
    musicPlayer: { activePlaylist: null } as unknown as UseMusicPlayerResult,
    onAnnounce: vi.fn(async () => {}),
    onMinimize: vi.fn(),
    onClose: vi.fn(),
    channelKey: "twitch:alice",
    role: "owner" as const,
    settings: {
      enabled: true,
      allowMods: false,
      modAccess: "all" as const,
      allowedMods: [] as Array<{ id: string; login: string }>,
    },
    onUpdateSettings: vi.fn(async () => {}),
    ...overrides,
  };
}

function renderModal(overrides: Record<string, unknown> = {}) {
  const props = makeModalProps(overrides);
  render(<StreamerToolsModal {...props} />);
  return props;
}

beforeEach(() => {
  localStorage.clear();
});

describe("Stream tools navigation", () => {
  it("opens a tool panel when Open is clicked", () => {
    renderModal();

    const row = screen.getByText("Poll").closest("li");
    expect(row).toBeTruthy();
    fireEvent.click(within(row as HTMLElement).getByRole("button", { name: "Open" }));

    expect(screen.getByText("Question")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Start poll" }),
    ).toBeTruthy();
  });

  it("switches panels when a new tool is requested while open", () => {
    const props = makeModalProps();
    const { rerender } = render(<StreamerToolsModal {...props} />);

    rerender(<StreamerToolsModal {...props} initialTool="poll" />);

    expect(screen.getByText("Question")).toBeTruthy();
  });
});

describe("Stream tools moderator access", () => {
  it("keeps the explanation behind an info icon rather than on the input", () => {
    renderModal();

    expect(screen.getByRole("checkbox")).toBeTruthy();
    // No prose next to the checkbox…
    expect(screen.queryByText(/twitch moderators will see/i)).toBeNull();
    // …just the icon that opens it.
    expect(
      screen.getByRole("button", { name: "What can moderators do?" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("dialog", { name: /what moderators can do/i }),
    ).toBeNull();
  });

  it("opens a modal summarising what moderators can and cannot do", () => {
    renderModal();

    fireEvent.click(screen.getByRole("button", { name: "What can moderators do?" }));

    const dialog = screen.getByRole("dialog", {
      name: "What moderators can do",
    });
    expect(dialog).toHaveTextContent(/twitch moderators of your channel/i);
    expect(dialog).toHaveTextContent(/run a giveaway/i);
    expect(dialog).toHaveTextContent(/spin the wheel/i);
    expect(dialog).toHaveTextContent(/only twitch moderators are included/i);

    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(
      screen.queryByRole("dialog", { name: "What moderators can do" }),
    ).toBeNull();
    // The Stream tools dialog itself stays open.
    expect(screen.getByRole("dialog", { name: "Stream tools" })).toBeTruthy();
  });

  it("closes the info dialog on Escape before Stream tools", () => {
    const props = renderModal();

    fireEvent.click(screen.getByRole("button", { name: "What can moderators do?" }));
    expect(
      screen.getByRole("dialog", { name: "What moderators can do" }),
    ).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      screen.queryByRole("dialog", { name: "What moderators can do" }),
    ).toBeNull();
    expect(screen.getByRole("dialog", { name: "Stream tools" })).toBeTruthy();
    expect(props.onClose).not.toHaveBeenCalled();

    // A second Escape unwinds the Stream tools dialog itself.
    fireEvent.keyDown(window, { key: "Escape" });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("never shows the access control to moderators", () => {
    renderModal({ role: "moderator" });

    expect(
      screen.queryByRole("button", { name: "What can moderators do?" }),
    ).toBeNull();
    expect(screen.getByText(/controlling stream tools as a moderator/i)).toBeTruthy();
  });
});

describe("Stream tools moderator selection", () => {
  const MODERATORS = [
    { user_id: "1", user_login: "mallory", user_name: "Mallory" },
    { user_id: "2", user_login: "carol", user_name: "Carol" },
  ];

  function mockTwitchProxyFetch() {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = decodeURIComponent(String(input));
      if (url.includes("/helix/users")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: [{ id: "42" }] }),
        } as Response;
      }
      if (url.includes("/helix/moderation/moderators")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ data: MODERATORS, pagination: {} }),
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hides the selector while moderator access is off", () => {
    renderModal({
      settings: {
        enabled: true,
        allowMods: false,
        modAccess: "all",
        allowedMods: [],
      },
    });

    expect(screen.queryByRole("radio", { name: "All moderators" })).toBeNull();
  });

  it("offers all moderators or a selection", () => {
    renderModal({
      settings: {
        enabled: true,
        allowMods: true,
        modAccess: "all",
        allowedMods: [],
      },
    });

    expect(screen.getByRole("radio", { name: "All moderators" })).toBeChecked();
    expect(
      screen.getByRole("radio", { name: "Only selected moderators" }),
    ).not.toBeChecked();
    expect(screen.queryByRole("group", { name: "Select moderators" })).toBeNull();
  });

  it("lists moderators and saves the ones the streamer picks", async () => {
    mockTwitchProxyFetch();
    const props = makeModalProps({
      settings: {
        enabled: true,
        allowMods: true,
        modAccess: "selected",
        allowedMods: [],
      },
    });
    render(<StreamerToolsModal {...props} />);

    expect(await screen.findByText("Mallory")).toBeTruthy();
    expect(screen.getByText("Carol")).toBeTruthy();

    fireEvent.click(screen.getByRole("checkbox", { name: "Mallory" }));

    expect(props.onUpdateSettings).toHaveBeenCalledWith({
      allowedMods: [{ id: "1", login: "mallory" }],
    });
  });

  it("keeps granted moderators that Twitch no longer lists", async () => {
    mockTwitchProxyFetch();
    renderModal({
      settings: {
        enabled: true,
        allowMods: true,
        modAccess: "selected",
        allowedMods: [{ id: "99", login: "ghost" }],
      },
    });

    expect(await screen.findByText("ghost")).toBeTruthy();
    expect(screen.getByText("not a moderator")).toBeTruthy();
  });

  it("does not show grants as stale while the list is loading", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    renderModal({
      settings: {
        enabled: true,
        allowMods: true,
        modAccess: "selected",
        allowedMods: [{ id: "99", login: "ghost" }],
      },
    });

    expect(screen.getByText(/loading moderators/i)).toBeTruthy();
    expect(screen.queryByText("ghost")).toBeNull();
    expect(screen.queryByText(/no moderators found/i)).toBeNull();
  });
});
