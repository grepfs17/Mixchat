import { useEffect } from "react";
import type { PlatformSession } from "../../lib/types";

/**
 * Marks app-level loading complete once the initial channel fetch settles.
 * Mirrors the pre-extraction behavior: if there's no session or the session
 * already has a token, the channel fetch is the last gate before rendering.
 */
export function useInitialLoading(
  channelsLoading: boolean,
  twitchSession: PlatformSession | undefined,
  setIsLoading: (value: boolean) => void,
) {
  useEffect(() => {
    if (!channelsLoading && (!twitchSession || twitchSession.accessToken)) {
      setIsLoading(false);
    }
  }, [channelsLoading, twitchSession, setIsLoading]);
}
