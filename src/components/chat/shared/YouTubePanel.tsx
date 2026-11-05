import type { CSSProperties } from "react";
import { useRef } from "react";
import YouTubeChat from "./YouTubeChat";
import YouTubeMessageInput, {
  type YouTubeMessageInputHandle,
} from "./YouTubeMessageInput";
import type { PlatformSession, ChatFont } from "../../../lib/types";
import type { YTMessage } from "../unified/types";

interface YouTubePanelProps {
  linkedYoutubeUrl: string;
  youtubeVideoId: string | null;
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
}

function extractVideoId(val: string): string {
  let vid = val;
  try {
    if (val.includes("v=")) {
      vid = new URLSearchParams(new URL(val).search).get("v") || val;
    } else if (val.includes("youtu.be/")) {
      vid = val.split("youtu.be/")[1].split("?")[0];
    } else if (val.includes("/live/")) {
      vid = val.split("/live/")[1].split("?")[0];
    }
  } catch {
    // keep original value
  }
  return vid;
}

export default function YouTubePanel({
  linkedYoutubeUrl,
  youtubeVideoId,
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
}: YouTubePanelProps) {
  const messageInputRef = useRef<YouTubeMessageInputHandle>(null);

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
              <button type="button"
                onClick={() => {
                  onSetManualVideoId("");
                }}
                style={{
                  background: "rgba(0,0,0,0.6)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  padding: "2px 6px",
                  fontSize: "10px",
                  cursor: "pointer",
                }}
              >
                Change Video
              </button>
              <button type="button"
                onClick={() => onSetShowYoutubeSection(false)}
                style={{
                  background: "rgba(0,0,0,0.6)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
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
                <button type="button"
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
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  flexWrap: "wrap",
                  justifyContent: "center",
                }}
              >
                <input
                  type="text"
                  placeholder="e.g. zFQFquAw74o"
                  className="channel-search"
                  aria-label="YouTube video ID or URL"
                  style={{
                    padding: "6px 10px",
                    fontSize: "13px",
                    width: "220px",
                    backgroundColor: "#222",
                    border: "1px solid #444",
                    color: "#fff",
                    borderRadius: "4px",
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      onSetManualVideoId(extractVideoId(e.currentTarget.value));
                    }
                  }}
                />
                <button type="button"
                  onClick={(e) => {
                    const input = e.currentTarget
                      .previousElementSibling as HTMLInputElement;
                    onSetManualVideoId(extractVideoId(input.value));
                  }}
                  style={{
                    background: "#FF0000",
                    color: "#fff",
                    border: "none",
                    borderRadius: "4px",
                    padding: "6px 12px",
                    cursor: "pointer",
                  }}
                >
                  Load
                </button>
                <button type="button"
                  onClick={() => onSetShowYoutubeSection(false)}
                  style={{
                    background: "#333",
                    color: "#fff",
                    border: "none",
                    borderRadius: "4px",
                    padding: "6px 12px",
                    cursor: "pointer",
                    fontSize: "13px",
                  }}
                >
                  Remove
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
