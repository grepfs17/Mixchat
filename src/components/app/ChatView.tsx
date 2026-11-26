import { useCallback, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import {
  FaTimes,
  FaChevronLeft,
  FaChevronRight,
  FaTwitch,
  FaYoutube,
  FaPlayCircle,
  FaExternalLinkAlt,
  FaFilm,
} from "react-icons/fa";
import ChatApp from "../chat/ChatApp";
import YoutubeStreamSelect from "../chat/shared/YoutubeStreamSelect";
import StreamEmbed from "../StreamEmbed";
import type { TwitchPlayer } from "../StreamEmbed";
import TwitchVods, {
  clipExplorerUrl,
  type ActiveMedia,
} from "../TwitchVods";
import type { StreamTransitionInfo } from "../StreamGrid";
import type { PlatformSession } from "../../lib/types";
import type { UseChatSettingsResult } from "../../hooks/app/useChatSettings";
import type { YoutubeStreamsState } from "../../hooks/app/useYoutubeStreams";
import type { HlsQuality, PlayerType } from "../../hooks/app/useEmbedState";
import type { VodChatPlayerLike } from "../../hooks/chat/useVodChat";

interface ChatViewProps {
  twitchSession?: PlatformSession;
  youtubeSession?: PlatformSession;
  selectedTwitchChannel: string;
  selectedTwitchChannelName: string;
  selectedTwitchChannelDisplayName: string;
  showStreamEmbed: boolean;
  setShowStreamEmbed: Dispatch<SetStateAction<boolean>>;
  viewerCount: number | null;
  channelIsLive: boolean | null;
  leftColumnVisible: boolean | undefined;
  setLeftColumnVisible: Dispatch<SetStateAction<boolean | undefined>>;
  linkedYoutubeUrl: string | null;
  youtubeStreams: YoutubeStreamsState;
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

function resolveChannelOwnership(
  twitchSession: PlatformSession | undefined,
  selectedTwitchChannel: string,
  selectedTwitchChannelName: string,
  hideViewerCount: boolean,
) {
  const isOnOwnChannel = Boolean(
    twitchSession &&
      selectedTwitchChannel &&
      (selectedTwitchChannel === twitchSession.userId ||
        (twitchSession.username &&
          selectedTwitchChannelName.toLowerCase() ===
            twitchSession.username.toLowerCase())),
  );
  return {
    isOnOwnChannel,
    shouldHideViewerCount: hideViewerCount && isOnOwnChannel,
  };
}

function resolveArchiveState(
  archiveChannel: string | null,
  selectedTwitchChannelName: string,
  channelIsLive: boolean | null,
) {
  const showArchive = archiveChannel === selectedTwitchChannelName;
  return {
    showArchive,
    archiveAvailable: channelIsLive === false || showArchive,
  };
}

function resolveActiveMedia(
  activeMediaState: { channel: string; media: ActiveMedia } | null,
  selectedTwitchChannelName: string,
  archiveAvailable: boolean,
): ActiveMedia | null {
  if (
    !activeMediaState ||
    activeMediaState.channel !== selectedTwitchChannelName ||
    !archiveAvailable
  ) {
    return null;
  }
  return activeMediaState.media;
}

function resolveActiveVodId(
  showStreamEmbed: boolean,
  activeMedia: ActiveMedia | null,
): string | null {
  if (!showStreamEmbed || activeMedia?.type !== "vod") return null;
  return activeMedia.id;
}

function resolveResizerClassName(isDragging: boolean): string {
  return `panel-resizer${isDragging ? " panel-resizer--dragging" : ""}`;
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
  channelIsLive,
  leftColumnVisible,
  setLeftColumnVisible,
  linkedYoutubeUrl,
  youtubeStreams,
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
    markFirstMessages,
    markFirstMessageChannels,
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
    showEmoteAutocompleteOnYoutube,
    emoteAutocompleteMode,
  } = chatSettings;

  const { isOnOwnChannel, shouldHideViewerCount } = resolveChannelOwnership(
    twitchSession,
    selectedTwitchChannel,
    selectedTwitchChannelName,
    hideViewerCount,
  );

  const [activeMediaState, setActiveMediaState] = useState<{
    channel: string;
    media: ActiveMedia;
  } | null>(null);
  const [archiveChannel, setArchiveChannel] = useState<string | null>(null);
  const vodPlayerRef = useRef<VodChatPlayerLike | null>(null);

  // Browsing VODs/clips is available automatically when offline, or manually
  // while live through the archive toggle in the embed header.
  const { showArchive, archiveAvailable } = resolveArchiveState(
    archiveChannel,
    selectedTwitchChannelName,
    channelIsLive,
  );

  // Only keep the selection while the archive is available for this channel.
  const activeMedia = resolveActiveMedia(
    activeMediaState,
    selectedTwitchChannelName,
    archiveAvailable,
  );

  const selectMedia = useCallback(
    (media: ActiveMedia | null) => {
      setActiveMediaState(
        media ? { channel: selectedTwitchChannelName, media } : null,
      );
    },
    [selectedTwitchChannelName],
  );

  const closeArchive = useCallback(() => {
    setActiveMediaState(null);
    setArchiveChannel(null);
  }, []);

  const toggleArchive = useCallback(() => {
    setActiveMediaState(null);
    setArchiveChannel((previous) =>
      previous === selectedTwitchChannelName ? null : selectedTwitchChannelName,
    );
  }, [selectedTwitchChannelName]);

  const selectPlayerType = useCallback(
    (type: PlayerType) => {
      closeArchive();
      setPlayerType(type);
    },
    [closeArchive, setPlayerType],
  );

  const handleVodPlayerReady = useCallback(
    (player: TwitchPlayer | null) => {
      vodPlayerRef.current = player;
    },
    [],
  );

  const activeVodId = resolveActiveVodId(showStreamEmbed, activeMedia);
  const resizerClassName = resolveResizerClassName(isDragging);
  const youtubeStreamVideoId = youtubeStreams.selectedVideoId;

  return (
    <>
      {showStreamEmbed && (
        <>
          <StreamEmbedPanel
            leftColumnVisible={leftColumnVisible}
            setLeftColumnVisible={setLeftColumnVisible}
            playerType={playerType}
            onSelectPlayerType={selectPlayerType}
            hlsQualities={hlsQualities}
            selectedHlsQualityIdx={selectedHlsQualityIdx}
            setSelectedHlsQualityIdx={setSelectedHlsQualityIdx}
            showHlsQualityMenu={showHlsQualityMenu}
            setShowHlsQualityMenu={setShowHlsQualityMenu}
            setShowStreamEmbed={setShowStreamEmbed}
            embedRef={embedRef}
            youtubeStreamVideoId={youtubeStreamVideoId}
            youtubeVideos={youtubeStreams.videos}
            onSelectYoutubeVideo={youtubeStreams.selectVideo}
            selectedTwitchChannelName={selectedTwitchChannelName}
            channelIsLive={channelIsLive}
            twitchSession={twitchSession}
            onTwitchLogin={onTwitchLogin}
            setHlsQualities={setHlsQualities}
            streamTransition={streamTransition}
            setStreamTransition={setStreamTransition}
            showArchive={showArchive}
            activeMedia={activeMedia}
            onSelectMedia={selectMedia}
            onToggleArchive={toggleArchive}
            onCloseArchive={closeArchive}
            onVodPlayerReady={handleVodPlayerReady}
          />
          <div
            data-resizer
            className={resizerClassName}
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
        </>
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
          activeVodId={activeVodId}
          vodPlayerRef={vodPlayerRef}
          viewerCount={viewerCount}
          linkedYoutubeUrl={linkedYoutubeUrl || undefined}
          youtubeStreams={youtubeStreams}
          youtubeSession={youtubeSession}
          unifyChatEnabled={unifyChatEnabled}
          useYoutubeEmbed={useYoutubeEmbed}
          fontSize={fontSize}
          chatFont={chatFont}
          mentionSoundEnabled={mentionSoundEnabled}
          mentionVolume={mentionVolume}
          mentionSoundType={mentionSoundType}
          showDeletedMessages={showDeletedMessages}
          markFirstMessages={markFirstMessages}
          markFirstMessageChannels={markFirstMessageChannels}
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
          showEmoteAutocompleteOnYoutube={showEmoteAutocompleteOnYoutube}
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
  onSelectPlayerType: (type: PlayerType) => void;
  hlsQualities: HlsQuality[];
  selectedHlsQualityIdx: number;
  setSelectedHlsQualityIdx: Dispatch<SetStateAction<number>>;
  showHlsQualityMenu: boolean;
  setShowHlsQualityMenu: Dispatch<SetStateAction<boolean>>;
  setShowStreamEmbed: Dispatch<SetStateAction<boolean>>;
  embedRef: RefObject<HTMLDivElement | null>;
  youtubeStreamVideoId: string | null;
  youtubeVideos: YoutubeStreamsState["videos"];
  onSelectYoutubeVideo: (videoId: string) => void;
  selectedTwitchChannelName: string;
  channelIsLive: boolean | null;
  twitchSession?: PlatformSession;
  onTwitchLogin: () => void;
  setHlsQualities: Dispatch<SetStateAction<HlsQuality[]>>;
  streamTransition: StreamTransitionInfo | null;
  setStreamTransition: Dispatch<SetStateAction<StreamTransitionInfo | null>>;
  showArchive: boolean;
  activeMedia: ActiveMedia | null;
  onSelectMedia: (media: ActiveMedia | null) => void;
  onToggleArchive: () => void;
  onCloseArchive: () => void;
  onVodPlayerReady: (player: TwitchPlayer | null) => void;
}

function StreamEmbedPanel({
  leftColumnVisible,
  setLeftColumnVisible,
  playerType,
  onSelectPlayerType,
  hlsQualities,
  selectedHlsQualityIdx,
  setSelectedHlsQualityIdx,
  showHlsQualityMenu,
  setShowHlsQualityMenu,
  setShowStreamEmbed,
  embedRef,
  youtubeStreamVideoId,
  youtubeVideos,
  onSelectYoutubeVideo,
  selectedTwitchChannelName,
  channelIsLive,
  twitchSession,
  onTwitchLogin,
  setHlsQualities,
  streamTransition,
  setStreamTransition,
  showArchive,
  activeMedia,
  onSelectMedia,
  onToggleArchive,
  onCloseArchive,
  onVodPlayerReady,
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
        onSelectPlayerType={onSelectPlayerType}
        channelIsLive={channelIsLive}
        showArchive={showArchive}
        onToggleArchive={onToggleArchive}
        hlsQualities={hlsQualities}
        selectedHlsQualityIdx={selectedHlsQualityIdx}
        setSelectedHlsQualityIdx={setSelectedHlsQualityIdx}
        showHlsQualityMenu={showHlsQualityMenu}
        setShowHlsQualityMenu={setShowHlsQualityMenu}
        setShowStreamEmbed={setShowStreamEmbed}
        activeMedia={activeMedia}
        onBackToLists={() => onSelectMedia(null)}
        onBackToLive={onCloseArchive}
        youtubeVideos={youtubeVideos}
        youtubeSelectedVideoId={youtubeStreamVideoId}
        onSelectYoutubeVideo={onSelectYoutubeVideo}
      />
      <EmbedPlayer
        playerType={playerType}
        youtubeStreamVideoId={youtubeStreamVideoId}
        selectedTwitchChannelName={selectedTwitchChannelName}
        channelIsLive={channelIsLive}
        showArchive={showArchive}
        activeMedia={activeMedia}
        onSelectMedia={onSelectMedia}
        onVodPlayerReady={onVodPlayerReady}
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
  onSelectPlayerType: (type: PlayerType) => void;
  channelIsLive: boolean | null;
  showArchive: boolean;
  onToggleArchive: () => void;
  hlsQualities: HlsQuality[];
  selectedHlsQualityIdx: number;
  setSelectedHlsQualityIdx: Dispatch<SetStateAction<number>>;
  showHlsQualityMenu: boolean;
  setShowHlsQualityMenu: Dispatch<SetStateAction<boolean>>;
  setShowStreamEmbed: Dispatch<SetStateAction<boolean>>;
  activeMedia: ActiveMedia | null;
  onBackToLists: () => void;
  onBackToLive: () => void;
  youtubeVideos: YoutubeStreamsState["videos"];
  youtubeSelectedVideoId: string | null;
  onSelectYoutubeVideo: (videoId: string) => void;
}

function EmbedHeader({
  leftColumnVisible,
  setLeftColumnVisible,
  playerType,
  onSelectPlayerType,
  channelIsLive,
  showArchive,
  onToggleArchive,
  hlsQualities,
  selectedHlsQualityIdx,
  setSelectedHlsQualityIdx,
  showHlsQualityMenu,
  setShowHlsQualityMenu,
  setShowStreamEmbed,
  activeMedia,
  onBackToLists,
  onBackToLive,
  youtubeVideos,
  youtubeSelectedVideoId,
  onSelectYoutubeVideo,
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
      <EmbedTitleOrBack
        activeMedia={activeMedia}
        showArchive={showArchive}
        playerType={playerType}
        onBackToLists={onBackToLists}
        onBackToLive={onBackToLive}
      />
      <PlayerTypeSwitch
        playerType={playerType}
        onSelectPlayerType={onSelectPlayerType}
        channelIsLive={channelIsLive}
        showArchive={showArchive}
        youtubeHasLive={youtubeVideos.length > 0}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          marginLeft: "auto",
        }}
      >
        {playerType === "youtube" && !showArchive && (
          <YoutubeStreamSelect
            videos={youtubeVideos}
            selectedVideoId={youtubeSelectedVideoId}
            onSelect={onSelectYoutubeVideo}
          />
        )}
        {playerType === "m3u8" && hlsQualities.length > 1 && (
          <HlsQualitySelector
            hlsQualities={hlsQualities}
            selectedHlsQualityIdx={selectedHlsQualityIdx}
            setSelectedHlsQualityIdx={setSelectedHlsQualityIdx}
            showHlsQualityMenu={showHlsQualityMenu}
            setShowHlsQualityMenu={setShowHlsQualityMenu}
          />
        )}
        <ArchiveButton
          channelIsLive={channelIsLive}
          showArchive={showArchive}
          playerType={playerType}
          onToggleArchive={onToggleArchive}
        />
        <EmbedClipExplorerLink activeMedia={activeMedia} />
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

function EmbedTitleOrBack({
  activeMedia,
  showArchive,
  playerType,
  onBackToLists,
  onBackToLive,
}: {
  activeMedia: ActiveMedia | null;
  showArchive: boolean;
  playerType: PlayerType;
  onBackToLists: () => void;
  onBackToLive: () => void;
}) {
  if (activeMedia) {
    const isClip = activeMedia.type === "clip";
    return (
      <button
        type="button"
        className="stream-embed-back"
        onClick={onBackToLists}
        title={isClip ? "Back to featured clips" : "Back to latest VODs"}
      >
        <FaChevronLeft size={11} />
        {isClip ? "Featured Clips" : "Latest VODs"}
      </button>
    );
  }
  if (showArchive) {
    return (
      <button
        type="button"
        className="stream-embed-back"
        onClick={onBackToLive}
        title="Back to live"
      >
        <FaChevronLeft size={11} />
        Live
      </button>
    );
  }
  return (
    <span className="stream-embed-title">
      {playerType === "youtube" ? "YouTube" : "Twitch"}
    </span>
  );
}

function PlayerTypeSwitch({
  playerType,
  onSelectPlayerType,
  channelIsLive,
  showArchive,
  youtubeHasLive,
}: {
  playerType: PlayerType;
  onSelectPlayerType: (type: PlayerType) => void;
  channelIsLive: boolean | null;
  showArchive: boolean;
  youtubeHasLive: boolean;
}) {
  if (showArchive || (channelIsLive === false && playerType !== "youtube")) {
    return null;
  }
  // Keep the YouTube button while it is the active player so an ended stream
  // does not trap the viewer without a way back to Twitch.
  const showYoutube = youtubeHasLive || playerType === "youtube";
  return (
    <div className="player-type-center">
      <div className="player-type-buttons">
        <button
          type="button"
          onClick={() => onSelectPlayerType("embed")}
          className={`player-type-btn${playerType === "embed" ? " active-twitch" : ""}`}
          title="Twitch embed player"
          aria-label="Twitch embed player"
        >
          <FaTwitch size={13} />
        </button>
        <button
          type="button"
          onClick={() => onSelectPlayerType("m3u8")}
          className={`player-type-btn${playerType === "m3u8" ? " active-m3u8" : ""}`}
          title="M3U8 HLS player"
          aria-label="M3U8 HLS player"
        >
          <FaPlayCircle size={13} />
        </button>
        {showYoutube && (
          <button
            type="button"
            onClick={() => onSelectPlayerType("youtube")}
            className={`player-type-btn${playerType === "youtube" ? " active-youtube" : ""}`}
            title="YouTube live stream"
            aria-label="YouTube live stream"
          >
            <FaYoutube size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

function ArchiveButton({
  channelIsLive,
  showArchive,
  playerType,
  onToggleArchive,
}: {
  channelIsLive: boolean | null;
  showArchive: boolean;
  playerType: PlayerType;
  onToggleArchive: () => void;
}) {
  if (showArchive || (channelIsLive === false && playerType !== "youtube")) {
    return null;
  }
  return (
    <button
      type="button"
      className="stream-embed-icon-action"
      onClick={onToggleArchive}
      title="Watch VODs and clips"
      aria-label="Watch VODs and clips"
    >
      <FaFilm size={12} />
    </button>
  );
}

function EmbedClipExplorerLink({
  activeMedia,
}: {
  activeMedia: ActiveMedia | null;
}) {
  if (activeMedia?.type !== "clip" || !activeMedia.url) return null;
  return (
    <a
      className="stream-embed-icon-action"
      href={clipExplorerUrl(activeMedia.url)}
      target="_blank"
      rel="noopener noreferrer"
      title="Open in Clip Explorer"
      aria-label="Open in Clip Explorer"
    >
      <FaExternalLinkAlt size={12} />
    </a>
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
  channelIsLive: boolean | null;
  showArchive: boolean;
  activeMedia: ActiveMedia | null;
  onSelectMedia: (media: ActiveMedia | null) => void;
  onVodPlayerReady: (player: TwitchPlayer | null) => void;
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
  channelIsLive,
  showArchive,
  activeMedia,
  onSelectMedia,
  onVodPlayerReady,
  twitchSession,
  onTwitchLogin,
  setHlsQualities,
  selectedHlsQualityIdx,
  streamTransition,
  setStreamTransition,
  embedRef,
}: EmbedPlayerProps) {
  const showArchivePanel =
    showArchive || (channelIsLive === false && playerType !== "youtube");

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
      {playerType === "youtube" && !showArchive ? (
        youtubeStreamVideoId ? (
          <iframe
            key={youtubeStreamVideoId}
            width="100%"
            height="100%"
            src={`https://www.youtube.com/embed/${youtubeStreamVideoId}?autoplay=1`}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
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
      ) : showArchivePanel && selectedTwitchChannelName ? (
        <TwitchVods
          key={selectedTwitchChannelName}
          channelName={selectedTwitchChannelName}
          channelIsLive={channelIsLive}
          twitchAccessToken={twitchSession?.accessToken}
          activeMedia={activeMedia}
          onSelectMedia={onSelectMedia}
          onPlayerReady={onVodPlayerReady}
        />
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
