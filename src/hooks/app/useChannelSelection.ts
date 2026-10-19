import { useCallback, useEffect, useRef } from "react";
import type { StreamTransitionInfo } from "../../components/StreamGrid";

interface UseChannelSelectionOptions {
  setChannelData: (
    channelId: string,
    transitionInfo?: StreamTransitionInfo,
  ) => void;
  autoFoldSidebar: boolean;
  setLeftColumnVisible: React.Dispatch<
    React.SetStateAction<boolean | undefined>
  >;
  selectedTwitchChannel: string;
}

/**
 * Owns channel selection: the click handler plus the reload auto-fold guard.
 * When a channel is loaded from the URL on page reload (bypassing
 * handleChannelSelect), auto-fold the sidebar if the setting is on.
 */
export function useChannelSelection({
  setChannelData,
  autoFoldSidebar,
  setLeftColumnVisible,
  selectedTwitchChannel,
}: UseChannelSelectionOptions) {
  const handleChannelSelect = useCallback(
    (channelId: string, transitionInfo?: StreamTransitionInfo) => {
      setChannelData(channelId, transitionInfo);
      if (autoFoldSidebar) setLeftColumnVisible(false);
    },
    [setChannelData, autoFoldSidebar, setLeftColumnVisible],
  );

  const prevChannelRef = useRef(selectedTwitchChannel);
  useEffect(() => {
    if (autoFoldSidebar && selectedTwitchChannel && !prevChannelRef.current) {
      setLeftColumnVisible(false);
    }
    prevChannelRef.current = selectedTwitchChannel;
  }, [selectedTwitchChannel, autoFoldSidebar, setLeftColumnVisible]);

  return { handleChannelSelect };
}
