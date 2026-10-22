import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { IS_TWITCH_ONLY } from "../../../src/lib/constants";

// Mocks first so the hook imports see them.
vi.mock("../../../src/lib/oauthSession", () => ({
  listenForOAuthSession: vi.fn(() => () => undefined),
}));

vi.mock("../../../src/hooks/app/useTokenRefresh", () => ({
  useTokenRefresh: vi.fn(),
}));

async function loadHook() {
  const mod = await import("../../../src/hooks/app/useAuthSessions");
  return mod.useAuthSessions;
}

function seedYoutubeSession(hasDriveScope = false) {
  localStorage.setItem(
    "mixchat_sessions:v1",
    JSON.stringify({
      youtube: {
        platform: "youtube",
        userId: "u1",
        displayName: "Alice",
        expiresAt: Date.now() + 60_000,
        hasDriveScope,
      },
    }),
  );
}

/**
 * Dispatch a `message` event synchronously via `window.dispatchEvent` rather
 * than `window.postMessage`. Same-origin `postMessage` queues the dispatch
 * via an async microtask in jsdom, so `act()` returns before the listener
 * fires, making the test timing-dependent. Dispatching a real MessageEvent
 * synchronously invokes the listener inside `act()`.
 */
function dispatchMessageEvent(data: unknown, origin = window.location.origin) {
  window.dispatchEvent(new MessageEvent("message", { data, origin }));
}

describe("useAuthSessions: mixchat_drive_granted listener", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("sets youtube.hasDriveScope=true on a same-origin mixchat_drive_granted message", async () => {
    seedYoutubeSession(false);
    const useAuthSessions = await loadHook();
    const { result } = renderHook(() => useAuthSessions());

    await waitFor(() => {
      expect(result.current.sessions.youtube?.userId).toBe("u1");
    });
    expect(result.current.sessions.youtube?.hasDriveScope).toBe(false);

    act(() => {
      dispatchMessageEvent({ type: "mixchat_drive_granted" });
    });

    expect(result.current.sessions.youtube?.hasDriveScope).toBe(true);
  });

  it("ignores mixchat_drive_granted messages from a different origin", async () => {
    seedYoutubeSession(false);
    const useAuthSessions = await loadHook();
    const { result } = renderHook(() => useAuthSessions());

    await waitFor(() => {
      expect(result.current.sessions.youtube?.userId).toBe("u1");
    });

    act(() => {
      dispatchMessageEvent(
        { type: "mixchat_drive_granted" },
        "https://evil.example.com",
      );
    });

    expect(result.current.sessions.youtube?.hasDriveScope).toBe(false);
  });

  it("ignores same-origin messages whose type is not mixchat_drive_granted", async () => {
    seedYoutubeSession(false);
    const useAuthSessions = await loadHook();
    const { result } = renderHook(() => useAuthSessions());

    await waitFor(() => {
      expect(result.current.sessions.youtube?.userId).toBe("u1");
    });

    act(() => {
      dispatchMessageEvent({
        type: "mixchat_session",
        session: { platform: "youtube" },
      });
    });

    expect(result.current.sessions.youtube?.hasDriveScope).toBe(false);
  });

  it("sets hasDriveScope=true on a same-origin storage event (cross-tab fallback)", async () => {
    seedYoutubeSession(false);
    const useAuthSessions = await loadHook();
    const { result } = renderHook(() => useAuthSessions());

    await waitFor(() => {
      expect(result.current.sessions.youtube?.userId).toBe("u1");
    });

    act(() => {
      // `storageArea` is omitted because jsdom's StorageEvent rejects the
      // mock localStorage. The hook only reads `key` and `newValue`.
      const evt = new StorageEvent("storage", {
        key: "mixchat_drive_granted",
        newValue: JSON.stringify({ ts: Date.now() }),
        url: window.location.href,
      });
      window.dispatchEvent(evt);
    });

    expect(result.current.sessions.youtube?.hasDriveScope).toBe(true);
    // The listener cleans up the storage key after consuming it.
    expect(localStorage.getItem("mixchat_drive_granted")).toBeNull();
  });

  it("is a no-op when no YouTube session is present", async () => {
    // No youtube entry in localStorage. Drive grant is meaningless without it.
    const useAuthSessions = await loadHook();
    const { result } = renderHook(() => useAuthSessions());

    // The mount-effect has run inside renderHook (wrapped in act). With
    // localStorage cleared in beforeEach, sessions stays empty.
    expect(result.current.sessions.youtube).toBeUndefined();

    expect(() => {
      act(() => {
        dispatchMessageEvent({ type: "mixchat_drive_granted" });
      });
    }).not.toThrow();

    expect(result.current.sessions.youtube).toBeUndefined();
  });

  it("clears popup poll interval on unmount (youtubeLogin)", async () => {
    const clearIntervalSpy = vi.spyOn(global, "clearInterval");

    // Mock fetch to return oauth-state so the async flow proceeds.
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ state: "test-state" }), { status: 200 }),
    );

    // Mock window.open to return a popup that appears open
    const mockPopup = { closed: false, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(mockPopup as any);

    // Stub the YouTube client ID so openYoutubeOAuth doesn't early-return
    vi.stubEnv("PUBLIC_YOUTUBE_CLIENT_ID", "test-client-id");

    const useAuthSessions = await loadHook();
    const { result, unmount } = renderHook(() => useAuthSessions());

    act(() => {
      result.current.youtubeLogin();
    });
    // The oauth-state fetch is async, so wait for isLoggingIn to become true.
    await waitFor(() => {
      expect(result.current.isLoggingIn).toBe(true);
    });

    // Clear spy so we only track clearInterval calls from unmount
    clearIntervalSpy.mockClear();

    unmount();

    // The cleanup effect should have called clearInterval for the popup poll
    expect(clearIntervalSpy).toHaveBeenCalled();

    vi.unstubAllEnvs();
  });

  it("clears popup poll interval on unmount (youtubeDriveLogin)", async () => {
    const clearIntervalSpy = vi.spyOn(global, "clearInterval");

    // Mock fetch to return oauth-state with drive flow.
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ state: "test-state:drive" }), { status: 200 }),
    );

    const mockPopup = { closed: false, close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(mockPopup as any);
    vi.stubEnv("PUBLIC_YOUTUBE_CLIENT_ID", "test-client-id");

    const useAuthSessions = await loadHook();
    const { result, unmount } = renderHook(() => useAuthSessions());

    act(() => {
      result.current.youtubeDriveLogin();
    });
    // The oauth-state fetch is async, so wait for isLoggingIn to become true.
    await waitFor(() => {
      expect(result.current.isLoggingIn).toBe(true);
    });

    clearIntervalSpy.mockClear();
    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();

    vi.unstubAllEnvs();
  });

  it("preserves hasDriveScope across token refreshes", async () => {
    seedYoutubeSession(true);

    // Capture the session-update callback that useTokenRefresh receives
    // so we can simulate a token-refresh cycle.
    const { useTokenRefresh } = await import(
      "../../../src/hooks/app/useTokenRefresh"
    );
    const useAuthSessions = await loadHook();
    const { result } = renderHook(() => useAuthSessions());

    await waitFor(() => {
      expect(result.current.sessions.youtube?.hasDriveScope).toBe(true);
    });

    // Extract the handleYoutubeSessionUpdate callback from the second
    // useTokenRefresh call (index 1 = YouTube, index 0 = Twitch).
    const calls = vi.mocked(useTokenRefresh).mock.calls;
    const youtubeCall = calls.find(
      ([, , , opts]) => opts?.checkInterval === 120_000,
    );
    expect(youtubeCall).toBeDefined();
    const updateCb = youtubeCall![1] as (s: { platform: string }) => void;

    // Simulate a token refresh that returns a session WITHOUT hasDriveScope.
    act(() => {
      updateCb({
        platform: "youtube",
        userId: "u1",
        displayName: "Alice",
        accessToken: "fresh-token",
        expiresAt: Date.now() + 60_000,
      } as any);
    });

    expect(result.current.sessions.youtube?.hasDriveScope).toBe(true);
    // accessToken is never persisted to localStorage, so after the save
    // effect runs it's stripped from the serialised copy, but hasDriveScope
    // is a client-side flag that survives the strip + refresh cycle.
    expect(result.current.sessions.youtube?.accessToken).toBeUndefined();
  });
});

describe("useAuthSessions: YouTube session restore gated by IS_TWITCH_ONLY", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("strips YouTube from restored sessions when IS_TWITCH_ONLY is true", async () => {
    seedYoutubeSession(false);
    const useAuthSessions = await loadHook();
    const { result } = renderHook(() => useAuthSessions());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    if (IS_TWITCH_ONLY) {
      // Twitch-only mode: YouTube session must be stripped after restore
      expect(result.current.sessions.youtube).toBeUndefined();
    } else {
      // Normal mode: YouTube session should be restored from localStorage
      expect(result.current.sessions.youtube).toBeDefined();
      expect(result.current.sessions.youtube?.userId).toBe("u1");
    }
  });

  it("preserves Twitch session while handling YouTube based on IS_TWITCH_ONLY", async () => {
    localStorage.setItem(
      "mixchat_sessions:v1",
      JSON.stringify({
        twitch: {
          platform: "twitch",
          userId: "t1",
          displayName: "Bob",
          expiresAt: Date.now() + 60_000,
        },
        youtube: {
          platform: "youtube",
          userId: "u1",
          displayName: "Alice",
          expiresAt: Date.now() + 60_000,
        },
      }),
    );

    const useAuthSessions = await loadHook();
    const { result } = renderHook(() => useAuthSessions());

    await waitFor(() => {
      expect(result.current.sessions.twitch).toBeDefined();
    });

    // Twitch session is always preserved
    expect(result.current.sessions.twitch?.userId).toBe("t1");

    if (IS_TWITCH_ONLY) {
      // Twitch-only mode: YouTube session must be stripped
      expect(result.current.sessions.youtube).toBeUndefined();
    } else {
      // Normal mode: YouTube session should be restored
      expect(result.current.sessions.youtube).toBeDefined();
      expect(result.current.sessions.youtube?.userId).toBe("u1");
    }
  });
});
