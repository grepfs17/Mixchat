import { useEffect, useRef, useCallback } from "react";
import type { PlatformSession } from "../../lib/types";

interface TokenRefreshOptions {
  warningThreshold?: number; // ms before expiry to start refresh (default: 5 min)
  checkInterval?: number; // ms between checks (default: 1 min)
  maxRetries?: number; // max refresh attempts (default: 3)
}

const DEFAULT_WARNING_THRESHOLD = 5 * 60 * 1000; // 5 minutes
const DEFAULT_CHECK_INTERVAL = 60 * 1000; // 1 minute
const DEFAULT_MAX_RETRIES = 3;

/**
 * Custom hook for automatic Twitch token refresh with retry logic
 * Monitors token expiration and proactively refreshes before expiry
 */
export const useTokenRefresh = (
  session: PlatformSession | null,
  onSessionUpdate: (session: PlatformSession) => void,
  onRefreshError: (error: Error) => void,
  options: TokenRefreshOptions = {},
) => {
  const {
    warningThreshold = DEFAULT_WARNING_THRESHOLD,
    checkInterval = DEFAULT_CHECK_INTERVAL,
    maxRetries = DEFAULT_MAX_RETRIES,
  } = options;

  const intervalRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const retryCountRef = useRef(0);
  const isRefreshingRef = useRef(false);
  const retryAfterRef = useRef(0); // epoch ms after which we may retry (429 backoff)

  const refreshToken = useCallback(async () => {
    // We need at least a session to refresh. The actual refresh token is read
    // from the httpOnly cookie server-side, so session.refreshToken is optional.
    if (!session || isRefreshingRef.current) {
      return;
    }

    isRefreshingRef.current = true;

    try {
      const response = await fetch("/api/refresh-token", {
        method: "POST",
        // Ensure httpOnly auth cookies are sent with the request so the
        // server-side refresh endpoint can read the refresh token.
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        // Only send the platform — the server reads the refresh token
        // from the httpOnly cookie, not from client-supplied data.
        body: JSON.stringify({
          platform: session.platform,
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          const retryAfterSec = parseInt(
            response.headers.get("Retry-After") || "60",
            10,
          );
          retryAfterRef.current = Date.now() + retryAfterSec * 1000;
          throw new Error(`Rate limited, retry after ${retryAfterSec}s`);
        }
        throw new Error(
          `Token refresh failed: ${response.status} ${response.statusText}`,
        );
      }

      const newTokenData = await response.json();

      const now = new Date().getTime();
      const updatedSession = {
        ...session,
        accessToken: newTokenData.accessToken,
        refreshToken: newTokenData.refreshToken || session.refreshToken,
        expiresAt: now + (newTokenData.expiresIn || 3600) * 1000,
      };

      onSessionUpdate(updatedSession);
      retryCountRef.current = 0; // Reset retry count on success

      console.log("✓ Token refreshed successfully", {
        expiresIn: newTokenData.expiresIn,
        expiresAt: new Date(updatedSession.expiresAt).toISOString(),
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      console.error("✗ Token refresh failed:", err.message);

      // A 401 from the refresh endpoint means the refresh token itself is
      // invalid/expired — retrying will never succeed, so log out immediately.
      if (err.message.includes("401")) {
        console.error(
          "Refresh token invalid or expired. Logging out immediately.",
        );
        onRefreshError(err);
        retryCountRef.current = 0;
        return;
      }

      retryCountRef.current += 1;

      if (retryCountRef.current >= maxRetries) {
        console.error(
          `Token refresh failed after ${maxRetries} retries. Logging out.`,
        );
        onRefreshError(err);
        retryCountRef.current = 0;
      }
    } finally {
      isRefreshingRef.current = false;
    }
  }, [session, onSessionUpdate, onRefreshError, maxRetries]);

  const checkAndRefresh = useCallback(() => {
    // Require at least an expiresAt to know we have a real session.
    // We do NOT require session.refreshToken here because the server reads it
    // from the httpOnly cookie — the client-side refreshToken is optional.
    if (!session?.expiresAt) {
      return;
    }

    // Respect 429 Retry-After backoff — don't attempt until the window has passed.
    if (Date.now() < retryAfterRef.current) {
      return;
    }

    const now = new Date().getTime();
    const timeUntilExpiry = session.expiresAt - now;

    // Also refresh immediately when the accessToken is absent (e.g. on page
    // reload — we no longer persist it to localStorage so it starts undefined).
    const tokenMissing = !session.accessToken;

    if (tokenMissing || timeUntilExpiry < warningThreshold) {
      if (tokenMissing) {
        console.log(
          "Access token missing (page reload), refreshing immediately...",
        );
      } else {
        console.log(
          `Token expiring in ${Math.round(timeUntilExpiry / 1000)}s, refreshing...`,
        );
      }
      refreshToken();
    }
  }, [session, warningThreshold, refreshToken]);

  useEffect(() => {
    // We need at least a session with expiresAt to schedule refreshes.
    // The actual refresh token lives in the httpOnly cookie on the server.
    if (!session?.expiresAt) {
      // Clear interval if no session
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = undefined;
      }
      return;
    }

    // Initial check
    checkAndRefresh();

    // Set up periodic check
    intervalRef.current = setInterval(checkAndRefresh, checkInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [session, checkInterval, checkAndRefresh]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    refreshToken,
    isRefreshing: isRefreshingRef.current,
    retryCount: retryCountRef.current,
  };
};
