import type { Dispatch, RefObject, SetStateAction } from "react";
import {
  FaTimes,
  FaChevronLeft,
  FaChevronRight,
} from "react-icons/fa";
import ChatApp from "../chat/ChatApp";
import StreamEmbed from "../StreamEmbed";
import type { StreamTransitionInfo } from "../StreamGrid";
import type { PlatformSession } from "../../lib/types";
import type { UseChatSettingsResult } from "../../hooks/app/useChatSettings";
import type { HlsQuality, PlayerType } from "../../hooks/app/useEmbedState";

interface ChatViewProps {
  twitchSession?: PlatformSession;
  youtubeSession?: PlatformSession;
  selectedTwitchChannel: string;
  selectedTwitchChannelName: string;
  selectedTwitchChannelDisplayName: string;
  showStreamEmbed: boolean;
  setShowStreamEmbed: Dispatch<SetStateAction<boolean>>;
  viewerCount: number | null;
  leftColumnVisible: boolean | undefined;
  setLeftColumnVisible: Dispatch<SetStateAction<boolean | undefined>>;
  linkedYoutubeUrl: string | null;
  youtubeStreamVideoId: string | null;
  playerType: PlayerType;
  setPlayerType: Dispatch<SetStateAction<PlayerType>>;
  hlsQualities: HlsQuality[];
  setHlsQualities: Dispatch<SetStateAction<HlsQuality[]>>;
  selectedHlsQualityIdx: number;
  setSelectedHlsQualityIdx: Dispatch<SetStateAction<number>>;
  showHlsQualityMenu: boolean;
  setShowHlsQualityMenu: Dispatch<SetStateAction<boolean>>;
  embedRef: RefObject<HTMLDivElement | null>;
  isDragging: boolean;
  setIsDragging: Dispatch<SetStateAction<boolean>>;
  streamTransition: StreamTransitionInfo | null;
  setStreamTransition: Dispatch<SetStateAction<StreamTransitionInfo | null>>;
  onTwitchLogin: () => void;
  onChannelSelect: (channelId: string) => void;
  chatSettings: UseChatSettingsResult;
}

export default function ChatView({
  twitchSession,
  youtubeSession,
  selectedTwitchChannel,
  selectedTwitchChannelName,
  selectedTwitchChannelDisplayName,
  showStreamEmbed,
  setShowStreamEmbed,
  viewerCount,
  leftColumnVisible,
  setLeftColumnVisible,
  linkedYoutubeUrl,
  youtubeStreamVideoId,
  playerType,
  setPlayerType,
  hlsQualities,
  setHlsQualities,
  selectedHlsQualityIdx,
  setSelectedHlsQualityIdx,
  showHlsQualityMenu,
  setShowHlsQualityMenu,
  embedRef,
  isDragging,
  setIsDragging,
  streamTransition,
  setStreamTransition,
  onTwitchLogin,
  onChannelSelect,
  chatSettings,
}: ChatViewProps) {
  const {
    unifyChatEnabled,
    useYoutubeEmbed,
    fontSize,
    chatFont,
    mentionSoundEnabled,
    mentionVolume,
    mentionSoundType,
    showDeletedMessages,
    maxDisplayedMessages,
    compactActions,
    keepModActionsVisible,
    modActionsFirst,
    doubleClickConfirmModActions,
    splitChatEnabled,
    chatTheme,
    hideViewerCount,
    modModeTargets,
    setModModeTargetForChannel,
    eventSounds,
    eventSoundVolume,
    ignoredUsers,
    streamerToolsEnabled,
    renderThirdPartyEmotesOnYoutube,
    emoteAutocompleteMode,
  } = chatSettings;

  const isOnOwnChannel = !!(
    twitchSession &&
    selectedTwitchChannel &&
    (selectedTwitchChannel === twitchSession.userId ||
      (twitchSession.username &&
        selectedTwitchChannelName.toLowerCase() ===
          twitchSession.username.toLowerCase()))
  );
  const shouldHideViewerCount = hideViewerCount && isOnOwnChannel;

  return (
    <>
      {showStreamEmbed && (
        <StreamEmbedPanel
          leftColumnVisible={leftColumnVisible}
          setLeftColumnVisible={setLeftColumnVisible}
          playerType={playerType}
          setPlayerType={setPlayerType}
          linkedYoutubeUrl={linkedYoutubeUrl}
          hlsQualities={hlsQualities}
          selectedHlsQualityIdx={selectedHlsQualityIdx}
          setSelectedHlsQualityIdx={setSelectedHlsQualityIdx}
          showHlsQualityMenu={showHlsQualityMenu}
          setShowHlsQualityMenu={setShowHlsQualityMenu}
          setShowStreamEmbed={setShowStreamEmbed}
          embedRef={embedRef}
          youtubeStreamVideoId={youtubeStreamVideoId}
          selectedTwitchChannelName={selectedTwitchChannelName}
          twitchSession={twitchSession}
          onTwitchLogin={onTwitchLogin}
          setHlsQualities={setHlsQualities}
          streamTransition={streamTransition}
          setStreamTransition={setStreamTransition}
        />
      )}
      {showStreamEmbed && (
        <div
          data-resizer
          className={`panel-resizer${
            isDragging ? " panel-resizer--dragging" : ""
          }`}
          style={{
            width: "8px",
            cursor: "col-resize",
            userSelect: "none",
          }}
          role="separator"
          aria-orientation="vertical"
          aria-label="Panel resizer"
          tabIndex={0}
          onMouseDown={() => setIsDragging(true)}
          title="Drag to resize"
        />
      )}
      <div
        data-chat-section
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0",
          overflow: "hidden",
          minHeight: "0",
        }}
      >
        <ChatApp
          twitchConnected={!!twitchSession}
          selectedTwitchChannel={selectedTwitchChannel}
          selectedTwitchChannelName={selectedTwitchChannelName}
          selectedTwitchChannelDisplayName={selectedTwitchChannelDisplayName}
          twitchSession={twitchSession}
          onToggleSidebar={() => setLeftColumnVisible(!leftColumnVisible)}
          sidebarVisible={leftColumnVisible}
          showStreamEmbed={showStreamEmbed}
          onToggleStreamEmbed={() => setShowStreamEmbed(!showStreamEmbed)}
          viewerCount={viewerCount}
          linkedYoutubeUrl={linkedYoutubeUrl || undefined}
          youtubeSession={youtubeSession}
          unifyChatEnabled={unifyChatEnabled}
          useYoutubeEmbed={useYoutubeEmbed}
          fontSize={fontSize}
          chatFont={chatFont}
          mentionSoundEnabled={mentionSoundEnabled}
          mentionVolume={mentionVolume}
          mentionSoundType={mentionSoundType}
          showDeletedMessages={showDeletedMessages}
          maxDisplayedMessages={maxDisplayedMessages}
          compactActions={compactActions}
          keepModActionsVisible={keepModActionsVisible}
          modActionsFirst={modActionsFirst}
          doubleClickConfirmModActions={doubleClickConfirmModActions}
          splitChatEnabled={splitChatEnabled}
          chatTheme={chatTheme}
          hideViewerCount={shouldHideViewerCount}
          modModeTargets={modModeTargets}
          setModModeTargetForChannel={setModModeTargetForChannel}
          eventSounds={eventSounds}
          eventSoundVolume={eventSoundVolume}
          ignoredUsers={ignoredUsers}
          onFollowRaid={(channelLogin) => onChannelSelect(channelLogin)}
          streamerToolsEnabled={streamerToolsEnabled}
          isOnOwnChannel={isOnOwnChannel}
          renderThirdPartyEmotesOnYoutube={renderThirdPartyEmotesOnYoutube}
          emoteAutocompleteMode={emoteAutocompleteMode}
        />
      </div>
    </>
  );
}

interface StreamEmbedPanelProps {
  leftColumnVisible: boolean | undefined;
  setLeftColumnVisible: Dispatch<SetStateAction<boolean | undefined>>;
  playerType: PlayerType;
  setPlayerType: Dispatch<SetStateAction<PlayerType>>;
  linkedYoutubeUrl: string | null;
  hlsQualities: HlsQuality[];
  selectedHlsQualityIdx: number;
  setSelectedHlsQualityIdx: Dispatch<SetStateAction<number>>;
  showHlsQualityMenu: boolean;
  setShowHlsQualityMenu: Dispatch<SetStateAction<boolean>>;
  setShowStreamEmbed: Dispatch<SetStateAction<boolean>>;
  embedRef: RefObject<HTMLDivElement | null>;
  youtubeStreamVideoId: string | null;
  selectedTwitchChannelName: string;
  twitchSession?: PlatformSession;
  onTwitchLogin: () => void;
  setHlsQualities: Dispatch<SetStateAction<HlsQuality[]>>;
  streamTransition: StreamTransitionInfo | null;
  setStreamTransition: Dispatch<SetStateAction<StreamTransitionInfo | null>>;
}

function StreamEmbedPanel({
  leftColumnVisible,
  setLeftColumnVisible,
  playerType,
  setPlayerType,
  linkedYoutubeUrl,
  hlsQualities,
  selectedHlsQualityIdx,
  setSelectedHlsQualityIdx,
  showHlsQualityMenu,
  setShowHlsQualityMenu,
  setShowStreamEmbed,
  embedRef,
  youtubeStreamVideoId,
  selectedTwitchChannelName,
  twitchSession,
  onTwitchLogin,
  setHlsQualities,
  streamTransition,
  setStreamTransition,
}: StreamEmbedPanelProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        minHeight: "0",
      }}
      data-stream-embed
    >
      <EmbedHeader
        leftColumnVisible={leftColumnVisible}
        setLeftColumnVisible={setLeftColumnVisible}
        playerType={playerType}
        setPlayerType={setPlayerType}
        linkedYoutubeUrl={linkedYoutubeUrl}
        hlsQualities={hlsQualities}
        selectedHlsQualityIdx={selectedHlsQualityIdx}
        setSelectedHlsQualityIdx={setSelectedHlsQualityIdx}
        showHlsQualityMenu={showHlsQualityMenu}
        setShowHlsQualityMenu={setShowHlsQualityMenu}
        setShowStreamEmbed={setShowStreamEmbed}
      />
      <EmbedPlayer
        playerType={playerType}
        youtubeStreamVideoId={youtubeStreamVideoId}
        selectedTwitchChannelName={selectedTwitchChannelName}
        twitchSession={twitchSession}
        onTwitchLogin={onTwitchLogin}
        setHlsQualities={setHlsQualities}
        selectedHlsQualityIdx={selectedHlsQualityIdx}
        streamTransition={streamTransition}
        setStreamTransition={setStreamTransition}
        embedRef={embedRef}
      />
    </div>
  );
}

interface EmbedHeaderProps {
  leftColumnVisible: boolean | undefined;
  setLeftColumnVisible: Dispatch<SetStateAction<boolean | undefined>>;
  playerType: PlayerType;
  setPlayerType: Dispatch<SetStateAction<PlayerType>>;
  linkedYoutubeUrl: string | null;
  hlsQualities: HlsQuality[];
  selectedHlsQualityIdx: number;
  setSelectedHlsQualityIdx: Dispatch<SetStateAction<number>>;
  showHlsQualityMenu: boolean;
  setShowHlsQualityMenu: Dispatch<SetStateAction<boolean>>;
  setShowStreamEmbed: Dispatch<SetStateAction<boolean>>;
}

function EmbedHeader({
  leftColumnVisible,
  setLeftColumnVisible,
  playerType,
  setPlayerType,
  linkedYoutubeUrl,
  hlsQualities,
  selectedHlsQualityIdx,
  setSelectedHlsQualityIdx,
  showHlsQualityMenu,
  setShowHlsQualityMenu,
  setShowStreamEmbed,
}: EmbedHeaderProps) {
  return (
    <div className="stream-embed-header">
      <button
        type="button"
        onClick={() => setLeftColumnVisible((v) => !v)}
        className="sidebar-toggle-button sidebar-toggle-button--in-embed"
        title={leftColumnVisible ? "Fold sidebar" : "Unfold sidebar"}
      >
        {leftColumnVisible ? <FaChevronLeft /> : <FaChevronRight />}
      </button>
      <span className="stream-embed-title">
        {playerType === "youtube" ? "YouTube" : "Twitch"}
      </span>
      <div className="player-type-center">
        <div className="player-type-buttons">
          <button
            type="button"
            onClick={() => setPlayerType("embed")}
            className={`player-type-btn${playerType === "embed" ? " active-twitch" : ""}`}
            title="Twitch embed player"
          >
            Twitch
          </button>
          <button
            type="button"
            onClick={() => setPlayerType("m3u8")}
            className={`player-type-btn${playerType === "m3u8" ? " active-m3u8" : ""}`}
            title="M3U8 HLS player"
          >
            M3U8 (experimental)
          </button>
          {linkedYoutubeUrl && (
            <button
              type="button"
              onClick={() => setPlayerType("youtube")}
              className={`player-type-btn${playerType === "youtube" ? " active-youtube" : ""}`}
              title="YouTube live stream"
            >
              YouTube
            </button>
          )}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          marginLeft: "auto",
        }}
      >
        {playerType === "m3u8" && hlsQualities.length > 1 && (
          <HlsQualitySelector
            hlsQualities={hlsQualities}
            selectedHlsQualityIdx={selectedHlsQualityIdx}
            setSelectedHlsQualityIdx={setSelectedHlsQualityIdx}
            showHlsQualityMenu={showHlsQualityMenu}
            setShowHlsQualityMenu={setShowHlsQualityMenu}
          />
        )}
        <button
          type="button"
          onClick={() => setShowStreamEmbed(false)}
          className="stream-embed-close"
          title="Hide stream embed"
        >
          <FaTimes size={15} />
        </button>
      </div>
    </div>
  );
}

interface HlsQualitySelectorProps {
  hlsQualities: HlsQuality[];
  selectedHlsQualityIdx: number;
  setSelectedHlsQualityIdx: Dispatch<SetStateAction<number>>;
  showHlsQualityMenu: boolean;
  setShowHlsQualityMenu: Dispatch<SetStateAction<boolean>>;
}

function HlsQualitySelector({
  hlsQualities,
  selectedHlsQualityIdx,
  setSelectedHlsQualityIdx,
  showHlsQualityMenu,
  setShowHlsQualityMenu,
}: HlsQualitySelectorProps) {
  return (
    <div className="quality-selector quality-selector--header">
      {showHlsQualityMenu && (
        <div
          role="presentation"
          className="quality-selector__backdrop"
          onClick={() => setShowHlsQualityMenu(false)}
        />
      )}
      <div className="quality-selector__inner">
        <button
          type="button"
          className="quality-selector__toggle"
          onClick={() => setShowHlsQualityMenu((q) => !q)}
          title={hlsQualities[selectedHlsQualityIdx]?.label ?? "Quality"}
        >
          ⚙{" "}
          <span className="quality-selector__label">
            {hlsQualities[selectedHlsQualityIdx]?.label ?? "Quality"}
          </span>
        </button>
        {showHlsQualityMenu && (
          <div className="quality-selector__menu">
            {hlsQualities.map((q, i) => (
              <button
                type="button"
                key={q.label}
                onClick={() => {
                  setSelectedHlsQualityIdx(i);
                  setShowHlsQualityMenu(false);
                }}
                className={`quality-selector__option${i === selectedHlsQualityIdx ? " quality-selector__option--active" : ""}`}
              >
                {i === selectedHlsQualityIdx ? "✓ " : "  "}
                {q.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface EmbedPlayerProps {
  playerType: PlayerType;
  youtubeStreamVideoId: string | null;
  selectedTwitchChannelName: string;
  twitchSession?: PlatformSession;
  onTwitchLogin: () => void;
  setHlsQualities: Dispatch<SetStateAction<HlsQuality[]>>;
  selectedHlsQualityIdx: number;
  streamTransition: StreamTransitionInfo | null;
  setStreamTransition: Dispatch<SetStateAction<StreamTransitionInfo | null>>;
  embedRef: RefObject<HTMLDivElement | null>;
}

function EmbedPlayer({
  playerType,
  youtubeStreamVideoId,
  selectedTwitchChannelName,
  twitchSession,
  onTwitchLogin,
  setHlsQualities,
  selectedHlsQualityIdx,
  streamTransition,
  setStreamTransition,
  embedRef,
}: EmbedPlayerProps) {
  return (
    <div
      ref={embedRef}
      style={{
        flex: 1,
        overflow: "hidden",
        backgroundColor: "#0a0a0a",
        position: "relative",
      }}
    >
      {playerType === "youtube" ? (
        youtubeStreamVideoId ? (
          <iframe
            width="100%"
            height="100%"
            src={`https://www.youtube.com/embed/${youtubeStreamVideoId}?autoplay=1`}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="YouTube Stream"
            style={{ border: "none" }}
          />
        ) : (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "#999",
              fontSize: "13px",
            }}
          >
            No YouTube live stream found for this channel
          </div>
        )
      ) : (
        <StreamEmbed
          channelName={selectedTwitchChannelName}
          playerType={playerType as "embed" | "m3u8"}
          twitchConnected={!!twitchSession}
          onTwitchLogin={onTwitchLogin}
          twitchAccessToken={twitchSession?.accessToken}
          onQualitiesLoaded={setHlsQualities}
          externalSelectedQualityIdx={selectedHlsQualityIdx}
          placeholderThumbnailUrl={streamTransition?.thumbnailUrl}
          onPlaceholderFadeOut={() => setStreamTransition(null)}
        />
      )}
    </div>
  );
}
