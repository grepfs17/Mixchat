import { useEffect, useState } from "react";

const WIDE_SCREEN_MIN_WIDTH = 1366;

export type UseUiStateResult = {
  leftColumnVisible: boolean | undefined;
  setLeftColumnVisible: React.Dispatch<React.SetStateAction<boolean | undefined>>;
  showWatchlistManager: boolean;
  setShowWatchlistManager: React.Dispatch<React.SetStateAction<boolean>>;
  showYoutubeLinker: boolean;
  setShowYoutubeLinker: React.Dispatch<React.SetStateAction<boolean>>;
};

export function useUiState(): UseUiStateResult {
  const [leftColumnVisible, setLeftColumnVisible] = useState<boolean | undefined>(
    undefined,
  );
  const [showWatchlistManager, setShowWatchlistManager] = useState(false);
  const [showYoutubeLinker, setShowYoutubeLinker] = useState(false);

  // Initialise and re-evaluate on resize. We only ever force the sidebar
  // open on wide screens; on narrow screens the user is left in whatever
  // state they chose (so the mobile hamburger button keeps working and the
  // virtual-keyboard resize doesn't slam the sidebar shut).
  useEffect(() => {
    setLeftColumnVisible(window.innerWidth >= WIDE_SCREEN_MIN_WIDTH);

    const handleResize = () => {
      if (window.innerWidth >= WIDE_SCREEN_MIN_WIDTH) {
        setLeftColumnVisible(true);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Pin the viewport height once on mount so the stream embed is immune to
  // the mobile virtual keyboard resizing the layout viewport.
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--initial-vh-px",
      `${window.innerHeight}px`,
    );
  }, []);

  return {
    leftColumnVisible,
    setLeftColumnVisible,
    showWatchlistManager,
    setShowWatchlistManager,
    showYoutubeLinker,
    setShowYoutubeLinker,
  };
}
