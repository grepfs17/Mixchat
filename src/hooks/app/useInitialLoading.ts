import { useEffect } from "react";
import type { PlatformSession } from "../../lib/types";

/**
 * Marks app-level loading complete once the followed-channel fetch for the
 * restored session settles. Without a session there is nothing to wait for,
 * so the landing page can render immediately.
 */
export function useInitialLoading(
  channelsReady: boolean,
  twitchSession: PlatformSession | undefined,
  isRestoringSession: boolean,
  setIsLoading: (value: boolean) => void,
) {
  useEffect(() => {
    if (isRestoringSession) return;
    if (!twitchSession || channelsReady) {
      setIsLoading(false);
    }
  }, [channelsReady, twitchSession, isRestoringSession, setIsLoading]);
}
