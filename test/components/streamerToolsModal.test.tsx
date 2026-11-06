import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

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
import type { UseSongQueueResult } from "../../src/hooks/chat/useSongQueue";
import type { UseMusicPlayerResult } from "../../src/hooks/chat/useMusicPlayer";

function renderModal(overrides: Record<string, unknown> = {}) {
  const props = {
    giveaway: { phase: "config" } as unknown as UseGiveawayResult,
    songQueue: { phase: "idle" } as unknown as UseSongQueueResult,
    musicPlayer: { activePlaylist: null } as unknown as UseMusicPlayerResult,
    onAnnounce: vi.fn(async () => {}),
    onMinimize: vi.fn(),
    onClose: vi.fn(),
    channelKey: "twitch:alice",
    role: "owner" as const,
    settings: { enabled: true, allowMods: false },
    onUpdateSettings: vi.fn(async () => {}),
    ...overrides,
  };
  render(<StreamerToolsModal {...props} />);
  return props;
}

beforeEach(() => {
  localStorage.clear();
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
