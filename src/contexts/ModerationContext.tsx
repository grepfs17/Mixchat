import { createContext, useContext } from "react";

export interface ModerationContextValue {
  isModerator: boolean;
  modModeActive: boolean;
  compactActions: boolean;
  onDeleteMessage?: (messageId: string) => void;
  onBanUser?: (userId: string, displayName?: string) => void;
  onTimeoutUser?: (
    userId: string,
    seconds: number,
    displayName?: string,
  ) => void;
  onUntimeoutUser?: (userName: string) => void;
  onWarnUser?: (userName: string) => void;
  onToggleModMode?: () => void;
}

export const ModerationContext = createContext<ModerationContextValue>({
  isModerator: false,
  modModeActive: false,
  compactActions: false,
});

export function useModerationContext() {
  return useContext(ModerationContext);
}
