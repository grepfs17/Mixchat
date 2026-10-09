import { useCallback, useEffect, useState } from "react";
import type { PlatformSession } from "../../lib/types";

const ONBOARDING_COMPLETE_KEY = "mixchat_onboarding_complete";

/**
 * Owns the app-level modal flags that aren't part of the UI-state hook:
 * the first-run onboarding wizard and the favorite-channels modal.
 */
export function useAppModals(twitchSession: PlatformSession | undefined) {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showFavoriteChannels, setShowFavoriteChannels] = useState(false);

  useEffect(() => {
    if (!twitchSession) return;
    if (typeof localStorage === "undefined") return;
    if (localStorage.getItem(ONBOARDING_COMPLETE_KEY) === "1") return;
    setShowOnboarding(true);
  }, [twitchSession]);

  useEffect(() => {
    const handler = () => {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(ONBOARDING_COMPLETE_KEY);
      }
      setShowOnboarding(true);
    };
    window.addEventListener("mixchat:show-onboarding", handler);
    return () =>
      window.removeEventListener("mixchat:show-onboarding", handler);
  }, []);

  const handleOnboardingComplete = useCallback(() => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(ONBOARDING_COMPLETE_KEY, "1");
    }
    setShowOnboarding(false);
  }, []);

  return {
    showOnboarding,
    showFavoriteChannels,
    setShowFavoriteChannels,
    handleOnboardingComplete,
  };
}
