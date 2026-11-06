import { beforeEach, describe, expect, it } from "vitest";
import { getDesktopShell, isTauriShell } from "../../src/lib/desktopShell";

beforeEach(() => {
  window.history.replaceState({}, "", "/");
  sessionStorage.clear();
  delete window.__MIXCHAT_SHELL__;
});

describe("desktopShell", () => {
  it("detects the shell from the query marker", () => {
    window.history.replaceState({}, "", "/?mixchat-shell=tauri");
    expect(getDesktopShell()).toBe("tauri");
    expect(isTauriShell()).toBe(true);
  });

  it("detects the injected shell marker", () => {
    window.__MIXCHAT_SHELL__ = "tauri";
    expect(getDesktopShell()).toBe("tauri");
  });

  it("remembers the shell across same-tab navigations", () => {
    window.history.replaceState({}, "", "/?mixchat-shell=tauri");
    expect(getDesktopShell()).toBe("tauri");

    window.history.replaceState({}, "", "/channel/example");
    expect(getDesktopShell()).toBe("tauri");
  });

  it("returns null in a normal browser", () => {
    expect(getDesktopShell()).toBeNull();
    expect(isTauriShell()).toBe(false);
  });
});
