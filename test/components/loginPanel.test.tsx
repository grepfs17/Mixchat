import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import LoginPanel from "../../src/components/LoginPanel";
import { IS_TWITCH_ONLY } from "../../src/lib/constants";

const noop = vi.fn();

function renderLoginPanel(overrides: Partial<Parameters<typeof LoginPanel>[0]> = {}) {
  return render(
    <LoginPanel
      twitchConnected={false}
      onTwitchLogin={noop}
      onTwitchLogout={noop}
      hasYoutubeSession={false}
      hasDriveScope={false}
      onReauthYoutube={noop}
      onYoutubeDriveLogin={noop}
      {...overrides}
    />,
  );
}

describe("LoginPanel: YouTube UI gated by IS_TWITCH_ONLY", () => {
  beforeEach(() => {
    localStorage.clear();
    noop.mockClear();
  });

  describe("YouTube login button", () => {
    it("does not render the YouTube login button when IS_TWITCH_ONLY is true", () => {
      renderLoginPanel({
        twitchConnected: true,
        youtubeConnected: false,
        onYoutubeLogin: noop,
      });

      const loginBtn = screen.queryByText("Login with YouTube");
      if (IS_TWITCH_ONLY) {
        expect(loginBtn).not.toBeInTheDocument();
      } else {
        expect(loginBtn).toBeInTheDocument();
      }
    });

    it("never renders YouTube login when onYoutubeLogin is not provided", () => {
      renderLoginPanel({
        twitchConnected: true,
        youtubeConnected: false,
      });

      expect(screen.queryByText("Login with YouTube")).not.toBeInTheDocument();
    });
  });

  describe("YouTube logout / connected section", () => {
    it("does not render the YouTube connected section when IS_TWITCH_ONLY is true", () => {
      renderLoginPanel({
        twitchConnected: true,
        youtubeConnected: true,
        youtubeUser: "TestYouTuber",
        onYoutubeLogout: noop,
      });

      // The YouTube section contains a "Logout" button and the user name
      const youtubeSection = document.querySelector(".youtube-section");
      if (IS_TWITCH_ONLY) {
        expect(youtubeSection).not.toBeInTheDocument();
      } else {
        expect(youtubeSection).toBeInTheDocument();
        expect(screen.getByText("TestYouTuber")).toBeInTheDocument();
      }
    });
  });

  describe("YouTube link management button", () => {
    it("does not render the YouTube link button when IS_TWITCH_ONLY is true", () => {
      renderLoginPanel({
        twitchConnected: true,
        twitchUser: "Streamer",
        onManageYoutubeLinks: noop,
      });

      const ytLinkBtn = screen.queryByTitle("Link YouTube channels");
      if (IS_TWITCH_ONLY) {
        expect(ytLinkBtn).not.toBeInTheDocument();
      } else {
        expect(ytLinkBtn).toBeInTheDocument();
      }
    });

    it("never renders YouTube link button when onManageYoutubeLinks is not provided", () => {
      renderLoginPanel({
        twitchConnected: true,
        twitchUser: "Streamer",
      });

      expect(
        screen.queryByTitle("Link YouTube channels"),
      ).not.toBeInTheDocument();
    });

    it("does not render YouTube link button when twitch is not connected", () => {
      renderLoginPanel({
        twitchConnected: false,
        onManageYoutubeLinks: noop,
      });

      // When not connected, the user-actions section doesn't render at all
      expect(
        screen.queryByTitle("Link YouTube channels"),
      ).not.toBeInTheDocument();
    });
  });
});
