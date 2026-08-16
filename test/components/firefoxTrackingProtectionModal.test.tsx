import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import FirefoxTrackingProtectionModal from "../../src/components/FirefoxTrackingProtectionModal";

const STORAGE_KEY = "mixchat.firefox-etp-notice-dismissed";
const originalUserAgent = window.navigator.userAgent;

const setUserAgent = (ua: string) => {
  Object.defineProperty(window.navigator, "userAgent", {
    value: ua,
    configurable: true,
  });
};

describe("FirefoxTrackingProtectionModal", () => {
  beforeEach(() => {
    localStorage.clear();
    setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
    );
  });

  afterEach(() => {
    setUserAgent(originalUserAgent);
  });

  it("shows the popup to Firefox users", async () => {
    render(<FirefoxTrackingProtectionModal />);

    expect(
      await screen.findByText(/Firefox: fix Twitch login/i),
    ).toBeDefined();
  });

  it("does not show the popup to non-Firefox browsers", () => {
    setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    );

    render(<FirefoxTrackingProtectionModal />);

    expect(screen.queryByText(/Firefox: fix Twitch login/i)).toBeNull();
  });

  it("does not show the popup when it was previously dismissed", () => {
    localStorage.setItem(STORAGE_KEY, "1");

    render(<FirefoxTrackingProtectionModal />);

    expect(screen.queryByText(/Firefox: fix Twitch login/i)).toBeNull();
  });

  it("persists the dismissal and hides the popup when 'Got it!' is clicked", async () => {
    render(<FirefoxTrackingProtectionModal />);

    const button = await screen.findByRole("button", { name: "Got it!" });
    fireEvent.click(button);

    expect(screen.queryByText(/Firefox: fix Twitch login/i)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBe("1");
  });

  it("shows when mixchat:show-firefox-notice is dispatched", () => {
    // Non-Firefox UA so it does not auto-show on mount.
    setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    );

    render(<FirefoxTrackingProtectionModal />);

    expect(screen.queryByText(/Firefox: fix Twitch login/i)).toBeNull();

    act(() => {
      window.dispatchEvent(new CustomEvent("mixchat:show-firefox-notice"));
    });

    expect(screen.getByText(/Firefox: fix Twitch login/i)).toBeDefined();
  });
});
