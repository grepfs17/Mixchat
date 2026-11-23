import type { CSSProperties } from "react";
import { useRef, useState } from "react";
import YouTubeChat from "./YouTubeChat";
import YouTubeMessageInput, {
  type YouTubeMessageInputHandle,
} from "./YouTubeMessageInput";
import type { PlatformSession, ChatFont } from "../../../lib/types";
import type { YTMessage } from "../unified/types";
import { parseDirectVideoId } from "../../../lib/youtubeStreamSelection";

interface YouTubePanelProps {
  linkedYoutubeUrl: string;
  youtubeVideoId: string | null;
  ytNotice: string | null;
  channel?: string;
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
  onYtMessages: (msgs: YTMessage[]) => void;
  youtubeSession?: PlatformSession;
  onOptimisticMessage: (id: string, text: string) => void;
  onOptimisticFailed: (id: string) => void;
  onError: (msg: string) => void;
  onConnectionChange?: (state: {
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
  style?: CSSProperties;
  renderThirdPartyEmotes?: boolean;
  markFirstMessages?: boolean;
  streamStartedAt?: Date | null;
}

function ManualVideoForm({
  initialValue = "",
  onSubmit,
  onCancel,
}: {
  initialValue?: string;
  onSubmit: (videoId: string) => void;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState(initialValue);

  const submit = () => {
    const videoId = parseDirectVideoId(value);
    if (!videoId) return;
    onSubmit(videoId);
    setValue("");
  };

  return (
    <div
      style={{
        display: "flex",
        gap: "6px",
        padding: "6px",
        background: "#141414",
        borderBottom: "1px solid #333",
        flexShrink: 0,
      }}
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Video ID or YouTube URL"
        className="channel-search"
        aria-label="YouTube video ID or URL"
        style={{
          flex: 1,
          minWidth: 0,
          padding: "5px 8px",
          fontSize: "12px",
          backgroundColor: "#222",
          border: "1px solid #444",
          color: "#fff",
          borderRadius: "0px",
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            submit();
          }
        }}
      />
      <button
        type="button"
        onClick={submit}
        disabled={!parseDirectVideoId(value)}
        style={{
          background: "#FF0000",
          color: "#fff",
          border: "none",
          borderRadius: "0px",
          padding: "5px 10px",
          cursor: "pointer",
          fontSize: "12px",
        }}
      >
        Load
      </button>
      {onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: "#333",
            color: "#fff",
            border: "none",
            borderRadius: "0px",
            padding: "5px 10px",
            cursor: "pointer",
            fontSize: "12px",
          }}
        >
          Cancel
        </button>
      ) : null}
    </div>
  );
}

export default function YouTubePanel({
  linkedYoutubeUrl,
  youtubeVideoId,
  ytNotice,
  channel,
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
  onError,
  onConnectionChange,
  onUsernameClick,
  style,
  renderThirdPartyEmotes,
  markFirstMessages = false,
  streamStartedAt = null,
}: YouTubePanelProps) {
  const messageInputRef = useRef<YouTubeMessageInputHandle>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleUsernameClick = (
    e: React.MouseEvent,
    author: string,
    avatar?: string,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    messageInputRef.current?.insertMention(author);
    onUsernameClick?.(e, author, avatar);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderBottom: "1px solid #333",
        ...style,
      }}
    >
      {ytNotice ? (
        <div
          role="status"
          style={{
            padding: "4px 8px",
            background: "#2a1f10",
            color: "#fbbf24",
            fontSize: "11px",
            borderBottom: "1px solid #333",
            flexShrink: 0,
          }}
        >
          {ytNotice}
        </div>
      ) : null}

      {pickerOpen && youtubeVideoId ? (
        <ManualVideoForm
          onSubmit={(videoId) => {
            onSetManualVideoId(videoId);
            setPickerOpen(false);
          }}
          onCancel={() => setPickerOpen(false)}
        />
      ) : null}

      {youtubeVideoId ? (
        <>
          <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
            {useYoutubeEmbed ? (
              <iframe
                src={`https://www.youtube.com/live_chat?v=${youtubeVideoId}&embed_domain=${window.location.hostname}&dark_theme=1`}
                style={{ width: "100%", height: "100%", border: "none" }}
                title="YouTube Live Chat"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="origin"
              />
            ) : (
              <YouTubeChat
                videoId={youtubeVideoId}
                channel={channel}
                authUserId={youtubeSession?.userId}
                onMessages={onYtMessages}
                optimisticMessages={ytOptimisticMessages}
                fontSize={fontSize}
                chatFont={chatFont}
                splitChatEnabled={splitChatEnabled}
                showDeletedMessages={showDeletedMessages}
                onConnectionChange={onConnectionChange}
                onUsernameClick={handleUsernameClick}
                renderThirdPartyEmotes={renderThirdPartyEmotes}
                markFirstMessages={markFirstMessages}
                streamStartedAt={streamStartedAt}
              />
            )}
            <div
              style={{
                position: "absolute",
                top: "4px",
                right: "4px",
                display: "flex",
                gap: "4px",
              }}
            >
              <button
                type="button"
                onClick={() => setPickerOpen((open) => !open)}
                style={{
                  background: "rgba(0,0,0,0.6)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "0px",
                  padding: "2px 6px",
                  fontSize: "10px",
                  cursor: "pointer",
                }}
              >
                Change Video
              </button>
              <button
                type="button"
                onClick={() => onSetShowYoutubeSection(false)}
                style={{
                  background: "rgba(0,0,0,0.6)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "0px",
                  padding: "2px 6px",
                  fontSize: "10px",
                  cursor: "pointer",
                }}
                title="Hide YouTube chat"
              >
                Remove Chat
              </button>
            </div>
          </div>
          {!useYoutubeEmbed &&
            (youtubeSession ? (
              <YouTubeMessageInput
                ref={messageInputRef}
                youtubeVideoId={youtubeVideoId}
                chatMessages={ytMessages}
                onOptimisticMessage={onOptimisticMessage}
                onOptimisticFailed={onOptimisticFailed}
                onError={onError}
              />
            ) : (
              <div
                style={{
                  padding: "8px 12px",
                  fontSize: "12px",
                  color: "#aaa",
                  textAlign: "center",
                  backgroundColor: "#0f0f0f",
                }}
              >
                <button
                  type="button"
                  onClick={() =>
                    (
                      document.querySelector<HTMLElement>(
                        ".login-btn.youtube-btn",
                      ) as HTMLElement | null
                    )?.click()
                  }
                  style={{
                    color: "#ff6b6b",
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    fontSize: "inherit",
                  }}
                >
                  Login with YouTube
                </button>{" "}
                to send messages
              </div>
            ))}
        </>
      ) : (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#0f0f0f",
            padding: "20px",
            gap: "10px",
          }}
        >
          {ytLoading ? (
            <p style={{ color: "#aaa", fontSize: "13px", textAlign: "center" }}>
              🔍 Looking for live stream on YouTube…
            </p>
          ) : (
            <>
              <p
                style={{ color: "#aaa", fontSize: "13px", textAlign: "center" }}
              >
                YouTube linked: {linkedYoutubeUrl}
                <br />
                {ytError ? (
                  <span style={{ color: "#f87171" }}>
                    {ytError}. You can enter a video ID manually:
                  </span>
                ) : (
                  <span>
                    No live stream detected. Enter a video ID manually:
                  </span>
                )}
              </p>
              <ManualVideoForm onSubmit={onSetManualVideoId} />
              <button
                type="button"
                onClick={() => onSetShowYoutubeSection(false)}
                style={{
                  background: "#333",
                  color: "#fff",
                  border: "none",
                  borderRadius: "0px",
                  padding: "6px 12px",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                Remove
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
