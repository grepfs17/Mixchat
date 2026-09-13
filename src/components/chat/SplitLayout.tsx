import YouTubePanel from "./shared/YouTubePanel";
import type { YTMessage } from "./unified/types";
import type { ChatFont, PlatformSession } from "../../lib/types";

interface SplitChatProps {
  chatSlot: React.ReactNode;
  linkedYoutubeUrl?: string;
  showYoutubeSection: boolean;
  chatSplitRatio: number;
  isDraggingChatSplit: boolean;
  onSetIsDraggingChatSplit: (dragging: boolean) => void;
  youtubeVideoId: string | null;
  useYoutubeEmbed: boolean;
  ytMessages: YTMessage[];
  ytOptimisticMessages: YTMessage[];
  ytLoading: boolean;
  ytError: string | null;
  onSetManualVideoId: (id: string) => void;
  onSetShowYoutubeSection: (show: boolean) => void;
  fontSize: number;
  chatFont: ChatFont;
  splitChatEnabled: boolean;
  showDeletedMessages: boolean;
  onYtMessages: (messages: YTMessage[]) => void;
  youtubeSession?: PlatformSession;
  onOptimisticMessage: (id: string, text: string) => void;
  onOptimisticFailed: (id: string) => void;
  onShowError: (message: string) => void;
  onYtConnectionChange?: (state: {
    connected: boolean;
    loading: boolean;
    error: string | null;
    reconnecting: boolean;
  }) => void;
  onUsernameClick?: (
    e: React.MouseEvent,
    author: string,
    avatar?: string,
  ) => void;
  channelName?: string;
  renderThirdPartyEmotesOnYoutube?: boolean;
}

export default function SplitChat({
  chatSlot,
  linkedYoutubeUrl,
  showYoutubeSection,
  chatSplitRatio,
  isDraggingChatSplit,
  onSetIsDraggingChatSplit,
  youtubeVideoId,
  useYoutubeEmbed,
  ytMessages,
  ytOptimisticMessages,
  ytLoading,
  ytError,
  onSetManualVideoId,
  onSetShowYoutubeSection,
  fontSize,
  chatFont,
  splitChatEnabled,
  showDeletedMessages,
  onYtMessages,
  youtubeSession,
  onOptimisticMessage,
  onOptimisticFailed,
  onShowError,
  onYtConnectionChange,
  onUsernameClick,
  channelName,
  renderThirdPartyEmotesOnYoutube,
}: SplitChatProps) {
  return (
    <>
      {linkedYoutubeUrl && showYoutubeSection && (
        <YouTubePanel
          style={{ height: `${chatSplitRatio}%`, minHeight: 0 }}
          linkedYoutubeUrl={linkedYoutubeUrl}
          youtubeVideoId={youtubeVideoId ?? null}
          channel={channelName}
          useYoutubeEmbed={useYoutubeEmbed}
          ytMessages={ytMessages}
          ytOptimisticMessages={ytOptimisticMessages}
          ytLoading={ytLoading}
          ytError={ytError}
          onSetManualVideoId={onSetManualVideoId}
          onSetShowYoutubeSection={onSetShowYoutubeSection}
          fontSize={fontSize}
          chatFont={chatFont}
          splitChatEnabled={splitChatEnabled}
          showDeletedMessages={showDeletedMessages}
          onYtMessages={onYtMessages}
          youtubeSession={youtubeSession}
          onOptimisticMessage={onOptimisticMessage}
          onOptimisticFailed={onOptimisticFailed}
          onError={onShowError}
          onConnectionChange={onYtConnectionChange}
          onUsernameClick={onUsernameClick}
          renderThirdPartyEmotes={renderThirdPartyEmotesOnYoutube}
        />
      )}

      {linkedYoutubeUrl && showYoutubeSection && (
        <div
          className={`panel-resizer${
            isDraggingChatSplit ? " panel-resizer--dragging" : ""
          }`}
          style={{
            height: "8px",
            cursor: "row-resize",
            userSelect: "none",
            zIndex: 10,
          }}
          role="separator"
        aria-orientation="vertical"
        aria-label="Chat split resizer"
        tabIndex={0}
        onMouseDown={() => onSetIsDraggingChatSplit(true)}
        />
      )}

      {chatSlot}

      {isDraggingChatSplit && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            cursor: "row-resize",
            background: "transparent",
          }}
        />
      )}
    </>
  );
}
