import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import TwitchLinkPreview from "../../src/components/chat/TwitchLinkPreview";

describe("<TwitchLinkPreview>", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it("renders a loading skeleton while the metadata request is in flight", () => {
    // fetch that never resolves → component stays in loading state
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(
      <TwitchLinkPreview
        url="https://twitch.tv/lunateac"
        parts={{
          kind: "channel",
          channel: "lunateac",
          url: "https://twitch.tv/lunateac",
          href: "https://twitch.tv/lunateac",
        }}
      />,
    );
    expect(screen.getByText(/Loading preview/i)).toBeTruthy();
    // The skeleton is an anchor href'ing the eventual target
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("https://twitch.tv/lunateac");
  });

  it("renders the preview card once metadata arrives", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          kind: "channel",
          url: "https://twitch.tv/lunateac",
          href: "https://twitch.tv/lunateac",
          title: "Coding & chill stream",
          author: {
            login: "lunateac",
            displayName: "Lunateac",
            avatarUrl: "https://example.com/avatar.png",
          },
          thumbnailUrl: "https://example.com/thumb.jpg",
          live: true,
          viewers: 1234,
          gameName: "Software & Game Development",
        }),
      }),
    );
    render(
      <TwitchLinkPreview
        url="https://twitch.tv/lunateac"
        parts={{
          kind: "channel",
          channel: "lunateac",
          url: "https://twitch.tv/lunateac",
          href: "https://twitch.tv/lunateac",
        }}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/Coding & chill stream/i)).toBeTruthy();
    });
    // Author name appears (case-insensitive lookups via `text`)
    expect(screen.getAllByText(/Lunateac/i).length).toBeGreaterThan(0);
    // LIVE badge appears
    expect(screen.getByText(/LIVE/i)).toBeTruthy();
  });

  it("renders a clip-specific footer with the creator when metadata is for a clip", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          kind: "clip",
          url: "https://twitch.tv/lunateac/clip/Foo",
          href: "https://twitch.tv/lunateac/clip/Foo",
          title: "Mind the gap",
          author: {
            login: "lunateac",
            displayName: "Lunateac",
            avatarUrl: "",
          },
          creator: {
            login: "tofumushu",
            displayName: "Tofumushu",
            avatarUrl: "",
          },
          thumbnailUrl: "https://example.com/clip.png",
          live: false,
          views: 42,
        }),
      }),
    );
    render(
      <TwitchLinkPreview
        url="https://twitch.tv/lunateac/clip/Foo"
        parts={{
          kind: "clip",
          channel: "lunateac",
          clipSlug: "Foo",
          url: "https://twitch.tv/lunateac/clip/Foo",
          href: "https://twitch.tv/lunateac/clip/Foo",
        }}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/Mind the gap/i)).toBeTruthy();
    });
    // Clip meta: "Clipped by <author>"
    expect(screen.getByText(/Clipped by/i)).toBeTruthy();
    expect(screen.getByText(/Tofumushu/i)).toBeTruthy();
  });

  it("falls back to a plain link when the API signals the resource is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: "Resource not found" }),
      }),
    );
    render(
      <TwitchLinkPreview
        url="https://twitch.tv/deletedchannel"
        parts={{
          kind: "channel",
          channel: "deletedchannel",
          url: "https://twitch.tv/deletedchannel",
          href: "https://twitch.tv/deletedchannel",
        }}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("https://twitch.tv/deletedchannel")).toBeTruthy();
    });
    const link = screen.getByRole("link", {
      name: /https:\/\/twitch\.tv\/deletedchannel/i,
    });
    expect(link.getAttribute("href")).toBe("https://twitch.tv/deletedchannel");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("falls back to a plain link when not authenticated (401)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "Not authenticated" }),
      }),
    );
    render(
      <TwitchLinkPreview
        url="https://twitch.tv/lunateac"
        parts={{
          kind: "channel",
          channel: "lunateac",
          url: "https://twitch.tv/lunateac",
          href: "https://twitch.tv/lunateac",
        }}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("https://twitch.tv/lunateac")).toBeTruthy();
    });
  });
});
