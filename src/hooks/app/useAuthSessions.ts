import { useCallback, useEffect, useRef, useState } from "react";
import type { PlatformSession } from "../../lib/types";
import { listenForOAuthSession } from "../../lib/oauthSession";
import { useTokenRefresh } from "./useTokenRefresh";

const SESSIONS_KEY = "mixchat_sessions";

/**
 * Safe wrapper around `popup.closed`.
 * Browsers warn when accessing `.closed` on a cross-origin popup whose
 * server sent a `Cross-Origin-Opener-Policy` header (e.g. Google OAuth).
 * This suppresses the console spam while still detecting closed popups.
 */
function isPopupClosed(popup: Window | null): boolean {
  try {
    return !popup || popup.closed;
  } catch {
    return true;
  }
}

/**
 * Build the Google OAuth request URL including the CSRF `state`.
 * For the Drive flow the state is suffixed with `:drive` so the
 * server-side callback can detect which OAuth flow it is serving.
 * The full state (with suffix) is persisted to sessionStorage so the
 * popup's CSRF check matches.
 *
 * Module-scope: no closure dependencies on the hook, so useCallback
 * would only add React noise.
 */
function buildGoogleAuthUrl(scope: string, drive: boolean): string {
  const clientId = import.meta.env.PUBLIC_YOUTUBE_CLIENT_ID;
  const redirectUri = import.meta.env.PUBLIC_YOUTUBE_REDIRECT_URI;
  const state = drive
    ? `${crypto.randomUUID()}:drive`
    : crypto.randomUUID();
  try {
    sessionStorage.setItem("youtube_oauth_state", state);
  } catch (_) {
    // sessionStorage may be unavailable in private browsing mode or when
    // the quota is exhausted. Without this write the popup's CSRF check
    // would later fail with "invalid state" — log here so devtools makes
    // the cause obvious.
    console.warn("sessionStorage unavailable for OAuth CSRF state");
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/**
 * Open an OAuth popup, centred over the main window. Returns `null` if
 * the browser blocked the popup. Module-scope for the same reason as
 * `buildGoogleAuthUrl`.
 */
function openCenteredPopup(target: string, url: string): Window | null {
  const width = 600;
  const height = 700;
  const left = window.screenX + (window.outerWidth - width) / 2;
  const top = window.screenY + (window.outerHeight - height) / 2;
  return window.open(
    url,
    target,
    `width=${width},height=${height},left=${left},top=${top}`,
  );
}

export type AuthSessions = {
  twitch?: PlatformSession;
  youtube?: PlatformSession;
};

function stripTokens<T extends Record<string, PlatformSession | undefined>>(
  sessions: T,
): T {
  const stripped = {} as T;
  for (const key of Object.keys(sessions) as Array<keyof T>) {
    const session = sessions[key];
    if (session) {
      const { accessToken: _dropped, ...rest } = session;
      stripped[key] = rest as T[typeof key];
    }
  }
  return stripped;
}

const REFRESH_OPTIONS = {
  warningThreshold: 10 * 60 * 1000,
  checkInterval: 120 * 1000,
  maxRetries: 3,
} as const;

export type UseAuthSessionsResult = {
  sessions: AuthSessions;
  isLoggingIn: boolean;
  isLoading: boolean;
  setIsLoading: (value: boolean) => void;
  twitchLogin: () => void;
  twitchLogout: () => void;
  youtubeLogin: () => void;
  youtubeDriveLogin: () => void;
  youtubeLogout: () => void;
  clearTwitchSession: () => void;
};

export function useAuthSessions(): UseAuthSessionsResult {
  const [sessions, setSessions] = useState<AuthSessions>({});
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Skip the very first save run: the mount effect closes over the initial
  // `{}` and would clobber the localStorage copy that the load-effect is
  // about to read in the same commit.
  const isFirstSaveRef = useRef(true);
  // Track popup-poll intervals so they can be cleaned up on unmount.
  const popupPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up any popup-poll interval on unmount.
  useEffect(() => {
    return () => {
      if (popupPollRef.current) {
        clearInterval(popupPollRef.current);
        popupPollRef.current = null;
      }
    };
  }, []);

  // Persist sessions to localStorage on every change after the initial mount.
  useEffect(() => {
    if (isFirstSaveRef.current) {
      isFirstSaveRef.current = false;
      return;
    }
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(stripTokens(sessions)));
  }, [sessions]);

  const handleTwitchSessionUpdate = useCallback(
    (updatedSession: PlatformSession) => {
      setSessions((prev) => ({ ...prev, twitch: updatedSession }));
    },
    [],
  );

  const handleTwitchRefreshError = useCallback((error: Error) => {
    console.error("Token refresh permanently failed:", error);
    setSessions({});
    localStorage.removeItem(SESSIONS_KEY);
  }, []);

  const handleYoutubeSessionUpdate = useCallback(
    (updatedSession: PlatformSession) => {
      setSessions((prev) => ({
        ...prev,
        youtube: {
          ...updatedSession,
          // Preserve hasDriveScope across token refreshes — the refreshed
          // session from the API doesn't include this client-side flag.
          hasDriveScope: prev.youtube?.hasDriveScope,
        },
      }));
    },
    [],
  );

  const handleYoutubeRefreshError = useCallback((error: Error) => {
    console.error("YouTube token refresh permanently failed:", error);
    setSessions((prev) => {
      const next = { ...prev };
      delete next.youtube;
      return next;
    });
  }, []);

  useTokenRefresh(
    sessions.twitch || null,
    handleTwitchSessionUpdate,
    handleTwitchRefreshError,
    REFRESH_OPTIONS,
  );
  useTokenRefresh(
    sessions.youtube || null,
    handleYoutubeSessionUpdate,
    handleYoutubeRefreshError,
    REFRESH_OPTIONS,
  );

  // Restore from localStorage on mount. On reload the accessToken has been
  // stripped for security, so seed expiresAt = now to force an immediate refresh.
  useEffect(() => {
    const saved = localStorage.getItem(SESSIONS_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as AuthSessions;
        const restored: AuthSessions = { ...parsed };
        if (restored.twitch && !restored.twitch.expiresAt) {
          restored.twitch = {
            ...restored.twitch,
            expiresAt: new Date().getTime(),
          };
        }
        if (restored.youtube && !restored.youtube.expiresAt) {
          restored.youtube = {
            ...restored.youtube,
            expiresAt: new Date().getTime(),
          };
        }
        setSessions(restored);
        if (!restored.twitch) {
          setIsLoading(false);
        }
      } catch (e) {
        console.error("Failed to load sessions:", e);
        setIsLoading(false);
      }
    } else {
      setIsLoading(false);
    }
  }, []);

  const twitchLogin = useCallback(() => {
    const clientId = import.meta.env.PUBLIC_TWITCH_CLIENT_ID;
    const redirectUri = import.meta.env.PUBLIC_TWITCH_REDIRECT_URI;

    if (!clientId) {
      alert("Twitch Client ID not configured");
      return;
    }

    // Generate a random CSRF state token and persist it for the callback to verify.
    const state = crypto.randomUUID();
    sessionStorage.setItem("twitch_oauth_state", state);
    // Also persist to localStorage as a fallback for mobile browsers where
    // window.open creates a new tab instead of a popup (new tabs do not
    // inherit sessionStorage).
    try {
      localStorage.setItem(
        "twitch_oauth_state_fb",
        JSON.stringify({
          state,
          returnUrl: window.location.href,
          exp: Date.now() + 5 * 60 * 1000,
        }),
      );
    } catch (_) {
      /* storage may be unavailable (private mode, quota) */
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope:
        "chat:read chat:edit user:read:email user:read:follows user:read:emotes user:read:subscriptions channel:read:redemptions channel:read:hype_train channel:read:polls channel:read:predictions bits:read moderator:manage:chat_messages moderator:manage:banned_users moderator:manage:announcements moderator:manage:shoutouts moderator:manage:warnings moderator:manage:automod user:read:moderated_channels user:write:chat channel:manage:broadcast channel:manage:raids moderator:read:followers",
      state,
    });

    const authUrl = `https://id.twitch.tv/oauth2/authorize?${params}`;

    // On mobile, popups are not supported — navigate the current tab instead.
    const isMobileDevice = /Android|iPhone|iPad|iPod|Mobile/i.test(
      navigator.userAgent,
    );
    if (isMobileDevice) {
      window.location.href = authUrl;
      return;
    }

    // Desktop: open OAuth in a popup so the main window's React state is preserved.
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      authUrl,
      "twitch_oauth",
      `width=${width},height=${height},left=${left},top=${top}`,
    );

    if (isPopupClosed(popup)) {
      window.location.href = authUrl;
      return;
    }

    setIsLoggingIn(true);

    const removeMessageListener = listenForOAuthSession(
      "twitch",
      popup,
      (session) =>
        setSessions((prev) => ({
          ...prev,
          twitch: session as PlatformSession,
        })),
      () => setIsLoggingIn(false),
    );

    // Storage event listener covers cross-origin popups and new-tab/mobile
    // flows where the callback can't postMessage back to this window.
    const onStorage = (e: StorageEvent) => {
      if (e.key === "mixchat_youtube_auth" && e.newValue) {
        try {
          const { session } = JSON.parse(e.newValue);
          if (session && session.platform === "youtube") {
            setSessions((prev) => ({ ...prev, youtube: session }));
            localStorage.removeItem("mixchat_youtube_auth");
          }
        } catch (err) {
          console.error("Failed to parse youtube auth storage event", err);
        }
      }
      if (e.key === "mixchat_sessions" && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          if (parsed && parsed.twitch) {
            setSessions((prev) => ({ ...prev, twitch: parsed.twitch }));
            setIsLoggingIn(false);
            if (!isPopupClosed(popup)) popup!.close();
            removeMessageListener();
            window.removeEventListener("storage", onStorage);
          }
        } catch (err) {
          console.error("Failed to parse sessions storage event", err);
        }
      }
    };
    window.addEventListener("storage", onStorage);

    // Clean up if popup is closed without completing auth.
    // Wrapped in try-catch via isPopupClosed to suppress COOP warnings
    // from Google's OAuth pages which set Cross-Origin-Opener-Policy.
    const pollClosed = setInterval(() => {
      if (isPopupClosed(popup)) {
        clearInterval(pollClosed);
        setIsLoggingIn(false);
        removeMessageListener();
        window.removeEventListener("storage", onStorage);
      }
    }, 500);

    return () => {
      clearInterval(pollClosed);
      removeMessageListener();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  /**
   * Fire-and-forget POST to /api/auth/logout so the server clears the
   * httpOnly auth cookies for the given platforms. Uses `keepalive: true`
   * so the request still completes if the user navigates away immediately
   * after clicking sign out. The trailing `.catch` neutralises the async
   * rejection so it isn't logged as an unhandled promise warning.
   */
  const postLogout = useCallback((platforms: string[]) => {
    fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platforms }),
      keepalive: true,
    }).catch(() => {
      /* network unavailable — local state still clears */
    });
  }, []);

  const twitchLogout = useCallback(() => {
    setSessions((prev) => {
      const next = { ...prev };
      delete next.twitch;
      return next;
    });
    postLogout(["twitch"]);
  }, [postLogout]);

  /**
   * Open the YouTube OAuth popup. Falls back to a full-page redirect when
   * the popup is blocked. The popup posts `mixchat_session` back to the
   * opener, which `listenForOAuthSession` handles and is the canonical
   * trigger for `setIsLoggingIn(false)`.
   */
  const openYoutubeOAuth = useCallback(() => {
    if (!import.meta.env.PUBLIC_YOUTUBE_CLIENT_ID) {
      alert("YouTube Client ID not configured");
      return;
    }
    const url = buildGoogleAuthUrl(
      "https://www.googleapis.com/auth/youtube.force-ssl",
      false,
    );
    const popup = openCenteredPopup("youtube_oauth", url);

    if (isPopupClosed(popup)) {
      window.location.href = url;
      return;
    }

    setIsLoggingIn(true);

    const removeMessageListener = listenForOAuthSession(
      "youtube",
      popup,
      (session) =>
        setSessions((prev) => ({
          ...prev,
          youtube: session as PlatformSession,
        })),
      () => setIsLoggingIn(false),
    );

    const pollClosed = setInterval(() => {
      if (isPopupClosed(popup)) {
        clearInterval(pollClosed);
        popupPollRef.current = null;
        setIsLoggingIn(false);
        removeMessageListener();
      }
    }, 500);
    popupPollRef.current = pollClosed;
  }, []);

  /**
   * Open the Drive-only OAuth popup. Falls back to a full-page redirect
   * when the popup is blocked. Intentionally does NOT register
   * `listenForOAuthSession("youtube", …)` because Drive posts
   * `mixchat_drive_granted` (handled by the top-level useEffect below),
   * and that listener would never fire for this flow. `isLoggingIn` is
   * cleared by the postMessage handler on success or by the close
   * poller if the user abandons the popup.
   */
  const openDriveOAuth = useCallback(() => {
    if (!import.meta.env.PUBLIC_YOUTUBE_CLIENT_ID) {
      alert("YouTube Client ID not configured");
      return;
    }
    const url = buildGoogleAuthUrl(
      "https://www.googleapis.com/auth/drive.file",
      true,
    );
    const popup = openCenteredPopup("youtube_drive_oauth", url);

    if (isPopupClosed(popup)) {
      window.location.href = url;
      return;
    }

    setIsLoggingIn(true);

    const pollClosed = setInterval(() => {
      if (isPopupClosed(popup)) {
        clearInterval(pollClosed);
        popupPollRef.current = null;
        setIsLoggingIn(false);
      }
    }, 500);
    popupPollRef.current = pollClosed;
  }, []);

  const youtubeLogin = useCallback(
    () => openYoutubeOAuth(),
    [openYoutubeOAuth],
  );

  const youtubeDriveLogin = useCallback(
    () => openDriveOAuth(),
    [openDriveOAuth],
  );

  // Listen for the Drive OAuth popup completing. The callback sends a
  // 'mixchat_drive_granted' postMessage so we can update hasDriveScope
  // without requiring a full YouTube re-auth.
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      if (ev.data?.type === "mixchat_drive_granted") {
        setSessions((prev) => {
          if (!prev.youtube) return prev;
          return {
            ...prev,
            youtube: { ...prev.youtube, hasDriveScope: true },
          };
        });
        setIsLoggingIn(false);
      }
    };
    window.addEventListener("message", onMessage);

    // Also handle storage event fallback for mobile/new-tab flows.
    const onStorage = (e: StorageEvent) => {
      if (e.key === "mixchat_drive_granted" && e.newValue) {
        setSessions((prev) => {
          if (!prev.youtube) return prev;
          return {
            ...prev,
            youtube: { ...prev.youtube, hasDriveScope: true },
          };
        });
        setIsLoggingIn(false);
        try {
          localStorage.removeItem("mixchat_drive_granted");
        } catch { /* ignore */ }
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const youtubeLogout = useCallback(() => {
    setSessions((prev) => {
      const next = { ...prev };
      delete next.youtube;
      return next;
    });
    // Drive tokens are tied to the same Google account as the YouTube
    // tokens, so signing out of YouTube must also clear the Drive
    // cookies — otherwise a stale drive_token could be applied to a
    // future Drive request when the same browser signs in to a
    // *different* Google account on a later date.
    postLogout(["youtube", "drive"]);
  }, [postLogout]);

  const clearTwitchSession = useCallback(() => {
    setSessions({});
    localStorage.removeItem(SESSIONS_KEY);
  }, []);

  return {
    sessions,
    isLoggingIn,
    isLoading,
    setIsLoading,
    twitchLogin,
    twitchLogout,
    youtubeLogin,
    youtubeDriveLogin,
    youtubeLogout,
    clearTwitchSession,
  };
}
