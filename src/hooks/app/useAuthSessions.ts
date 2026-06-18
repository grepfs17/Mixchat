import { useCallback, useEffect, useRef, useState } from "react";
import type { PlatformSession } from "../../lib/types";
import { listenForOAuthSession } from "../../lib/oauthSession";
import { useTokenRefresh } from "./useTokenRefresh";

const SESSIONS_KEY = "mixchat_sessions";

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
      setSessions((prev) => ({ ...prev, youtube: updatedSession }));
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
        "chat:read chat:edit user:read:email user:read:follows user:read:emotes channel:read:redemptions channel:read:hype_train channel:read:polls moderator:manage:chat_messages moderator:manage:banned_users moderator:manage:announcements moderator:manage:shoutouts moderator:manage:warnings moderator:manage:automod user:read:moderated_channels user:write:chat channel:manage:broadcast channel:manage:raids",
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

    if (!popup || popup.closed) {
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
            if (popup && !popup.closed) popup.close();
            removeMessageListener();
            window.removeEventListener("storage", onStorage);
          }
        } catch (err) {
          console.error("Failed to parse sessions storage event", err);
        }
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      removeMessageListener();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const twitchLogout = useCallback(() => {
    setSessions((prev) => {
      const next = { ...prev };
      delete next.twitch;
      return next;
    });
  }, []);

  const youtubeLogin = useCallback(() => {
    const clientId = import.meta.env.PUBLIC_YOUTUBE_CLIENT_ID;
    const redirectUri = import.meta.env.PUBLIC_YOUTUBE_REDIRECT_URI;

    if (!clientId) {
      alert("YouTube Client ID not configured");
      return;
    }

    const state = crypto.randomUUID();
    sessionStorage.setItem("youtube_oauth_state", state);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope:
        "https://www.googleapis.com/auth/youtube.force-ssl https://www.googleapis.com/auth/drive.file",
      access_type: "offline",
      prompt: "consent",
      state,
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      authUrl,
      "youtube_oauth",
      `width=${width},height=${height},left=${left},top=${top}`,
    );

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

    // Clean up listener if popup is closed without completing auth.
    const pollClosed = setInterval(() => {
      if (popup && popup.closed) {
        clearInterval(pollClosed);
        setIsLoggingIn(false);
        removeMessageListener();
      }
    }, 500);
  }, []);

  const youtubeLogout = useCallback(() => {
    setSessions((prev) => {
      const next = { ...prev };
      delete next.youtube;
      return next;
    });
  }, []);

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
    youtubeLogout,
    clearTwitchSession,
  };
}
