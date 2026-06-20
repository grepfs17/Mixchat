import { createContext, useContext } from "react";

export interface ModerationContextValue {
  isModerator: boolean;
  modModeActive: boolean;
  compactActions: boolean;
  isYouTubeModerator?: boolean;
  youtubeModModeActive?: boolean;
  youtubeVideoId?: string | null;
  /** Signed-in YouTube channel id; used to skip mod actions on the user's own messages. */
  youtubeOwnChannelId?: string | null;
  onDeleteMessage?: (messageId: string) => void;
  onBanUser?: (userId: string, displayName?: string) => void;
  onTimeoutUser?: (
    userId: string,
    seconds: number,
    displayName?: string,
  ) => void;
  onUntimeoutUser?: (userName: string) => void;
  onWarnUser?: (userName: string) => void;
  onDeleteYouTubeMessage?: (messageId: string) => void;
  onBanYouTubeUser?: (channelId: string, displayName?: string) => void;
  onTimeoutYouTubeUser?: (
    channelId: string,
    seconds: number,
    displayName?: string,
  ) => void;
  onToggleModMode?: () => void;
  onToggleYouTubeModMode?: () => void;
}

export const ModerationContext = createContext<ModerationContextValue>({
  isModerator: false,
  modModeActive: false,
  compactActions: false,
  isYouTubeModerator: false,
  youtubeModModeActive: false,
  youtubeVideoId: null,
  youtubeOwnChannelId: null,
});

export function useModerationContext() {
  return useContext(ModerationContext);
}
