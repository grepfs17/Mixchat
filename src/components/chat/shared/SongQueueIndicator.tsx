import { useRef, useState, useCallback } from "react";
import {
  FaChevronUp,
  FaChevronDown,
  FaStepBackward,
  FaStepForward,
  FaPlay,
  FaPause,
  FaTimes,
  FaTwitch,
  FaYoutube,
  FaVolumeUp,
  FaVolumeMute,
} from "react-icons/fa";
import type { UseSongQueueResult } from "../../../hooks/chat/useSongQueue";
import SongQueuePlayer, {
  type SongQueuePlayerHandle,
  type SongQueuePlayerState,
} from "./SongQueuePlayer";

type LinkCopiedState = "idle" | "copied" | "failed";

function PlatformIcon({
  platform,
  size,
}: {
  platform: "twitch" | "youtube";
  size: number;
}) {
  return platform === "twitch" ? (
    <FaTwitch size={size} />
  ) : (
    <FaYoutube size={size} />
  );
}

function SongQueueBarNowPlaying({
  current,
}: {
  current: NonNullable<UseSongQueueResult["currentItem"]>;
}) {
  return (
    <div className="song-queue-bar-now-playing">
      <span className="song-queue-bar-now-playing-channel">
        {current.channelTitle}
      </span>
      <span className="song-queue-bar-now-playing-title">{current.title}</span>
      <span className="song-queue-bar-now-playing-sub">
        <PlatformIcon platform={current.submitter.platform} size={9} />{" "}
        {current.submitter.author}
      </span>
    </div>
  );
}

function SongQueueBarListItem({
  item,
  isActive,
  onPlayNow,
}: {
  item: UseSongQueueResult["items"][number];
  isActive: boolean;
  onPlayNow: (id: string) => void;
}) {
  return (
    <li
      className={`song-queue-bar-item${isActive ? " song-queue-bar-item--active" : ""}`}
      data-status={item.status}
    >
      <img
        className="song-queue-bar-item-thumb"
        src={item.thumbnail}
        alt=""
      />
      <div className="song-queue-bar-item-meta">
        <span className="song-queue-bar-item-title">
          {truncate(item.title, 36)}
        </span>
        <span className="song-queue-bar-item-sub">
          <PlatformIcon platform={item.submitter.platform} size={9} />{" "}
          {item.submitter.author}
        </span>
      </div>
      <button
        type="button"
        className="song-queue-bar-item-btn"
        onClick={() => onPlayNow(item.id)}
        title="Play now"
        aria-label={`Play ${item.title} now`}
      >
        Play
      </button>
    </li>
  );
}

function SongQueueBarList({
  current,
  items,
  onPlayNow,
}: {
  current: UseSongQueueResult["currentItem"];
  items: UseSongQueueResult["items"];
  onPlayNow: (id: string) => void;
}) {
  return (
    <div className="song-queue-bar-list-wrap">
      {current && <SongQueueBarNowPlaying current={current} />}
      {items.length > 0 && (
        <ul className="song-queue-bar-list" aria-label="Queue">
          {items.map((item) => (
            <SongQueueBarListItem
              key={item.id}
              item={item}
              isActive={item.id === current?.id}
              onPlayNow={onPlayNow}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function SongQueueBarPlayer({
  playerRef,
  queue,
  onStateChange,
}: {
  playerRef: React.RefObject<SongQueuePlayerHandle | null>;
  queue: UseSongQueueResult;
  onStateChange: (state: SongQueuePlayerState) => void;
}) {
  const onDurationKnown = (itemId: string, dur: number) => {
    if (dur > queue.config.maxSongDurationSec) {
      const item = queue.items.find((it) => it.id === itemId);
      if (item) void queue.notifyTooLong(item);
      void queue.skip(itemId);
      void queue.next();
    } else {
      void queue.reportDuration(itemId, dur);
    }
  };
  return (
    <SongQueuePlayer
      ref={playerRef}
      items={queue.items}
      currentIndex={Math.max(
        0,
        queue.items.findIndex((it) => it.id === queue.currentItem?.id),
      )}
      onAdvance={() => void queue.next()}
      onStateChange={onStateChange}
      onDurationKnown={onDurationKnown}
      className="song-queue-bar-player"
    />
  );
}

function SongQueueBarBody({
  playerRef,
  queue,
  onStateChange,
}: {
  playerRef: React.RefObject<SongQueuePlayerHandle | null>;
  queue: UseSongQueueResult;
  onStateChange: (state: SongQueuePlayerState) => void;
}) {
  return (
    <div className="song-queue-bar-body">
      <div className="song-queue-bar-player-wrap">
        <SongQueueBarPlayer
          playerRef={playerRef}
          queue={queue}
          onStateChange={onStateChange}
        />
      </div>
      <SongQueueBarList
        current={queue.currentItem}
        items={queue.items}
        onPlayNow={(id) => void queue.playNow(id)}
      />
    </div>
  );
}

function SongQueueBarTitleButton({
  onOpen,
  current,
  hasItems,
  pendingCount,
  historyCount,
  playerState,
}: {
  onOpen: () => void;
  current: UseSongQueueResult["currentItem"];
  hasItems: boolean;
  pendingCount: number;
  historyCount: number;
  playerState: SongQueuePlayerState;
}) {
  return (
    <button
      type="button"
      className="song-queue-bar-title"
      onClick={onOpen}
      title="Open song queue in Streamer tools"
    >
      <span className="song-queue-bar-icon" aria-hidden="true">
        ♪
      </span>
      <span className="song-queue-bar-meta">
        <span className="song-queue-bar-title-text">
          {current
            ? truncate(current.title, 50)
            : hasItems
              ? "Ready — press play"
              : "Waiting for the first song…"}
        </span>
        <span className="song-queue-bar-sub">
          {pendingCount} queued · {historyCount} played
          {playerState === "paused" && current ? " · paused" : ""}
          {current ? (
            <>
              {" · "}
              <PlatformIcon platform={current.submitter.platform} size={8} />{" "}
              {current.submitter.author}
            </>
          ) : null}
        </span>
      </span>
    </button>
  );
}

function SongQueueBarVolume({
  volume,
  setVolume,
  playerRef,
  onVolumeChange,
}: {
  volume: number;
  setVolume: (volume: number) => void;
  playerRef: React.RefObject<SongQueuePlayerHandle | null>;
  onVolumeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const onToggleMute = () => {
    const next = volume === 0 ? 100 : 0;
    setVolume(next);
    playerRef.current?.setVolume(next);
  };
  return (
    <span className="song-queue-bar-volume">
      <button
        type="button"
        className="song-queue-bar-btn song-queue-bar-volume-icon"
        onClick={onToggleMute}
        title={volume === 0 ? "Unmute" : "Mute"}
        aria-label={volume === 0 ? "Unmute" : "Mute"}
      >
        {volume === 0 ? <FaVolumeMute size={11} /> : <FaVolumeUp size={11} />}
      </button>
      <input
        type="range"
        min={0}
        max={100}
        value={volume}
        onChange={onVolumeChange}
        className="song-queue-bar-volume-slider"
        aria-label="Volume"
        title={`Volume: ${volume}%`}
      />
    </span>
  );
}

function SongQueueBarCopyButton({
  publicUrl,
  linkCopied,
  setLinkCopied,
}: {
  publicUrl: string;
  linkCopied: LinkCopiedState;
  setLinkCopied: (state: LinkCopiedState) => void;
}) {
  const onCopyLink = () => {
    if (!publicUrl) return;
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      setLinkCopied("failed");
      return;
    }
    const full =
      typeof window === "undefined"
        ? publicUrl
        : `${window.location.origin}${publicUrl}`;
    navigator.clipboard
      .writeText(full)
      .then(() => setLinkCopied("copied"))
      .catch(() => setLinkCopied("failed"));
  };
  return (
    <button
      type="button"
      className="song-queue-bar-btn"
      onClick={onCopyLink}
      title="Copy public link"
      aria-label="Copy public link"
    >
      {linkCopied === "copied"
        ? "Copied"
        : linkCopied === "failed"
          ? "Failed"
          : "Copy link"}
    </button>
  );
}

function SongQueueBarPlayPauseButton({
  isPlaying,
  canResume,
  canStartFresh,
  firstPendingId,
  playerRef,
  onPlayNow,
}: {
  isPlaying: boolean;
  canResume: boolean;
  canStartFresh: boolean;
  firstPendingId: string | undefined;
  playerRef: React.RefObject<SongQueuePlayerHandle | null>;
  onPlayNow: (id: string) => void;
}) {
  const onPlayPause = () => {
    if (isPlaying) {
      playerRef.current?.pause();
    } else {
      if (canResume) {
        playerRef.current?.play();
      } else if (firstPendingId) {
        void onPlayNow(firstPendingId);
      }
    }
  };
  return (
    <button
      type="button"
      className="song-queue-bar-btn song-queue-bar-btn--primary"
      onClick={onPlayPause}
      disabled={!canResume && !canStartFresh}
      title={
        isPlaying
          ? "Pause"
          : canResume
            ? "Resume"
            : canStartFresh
              ? "Start playing the queue"
              : "Nothing to play yet"
      }
      aria-label={isPlaying ? "Pause" : "Play"}
      data-testid="song-queue-bar-play"
    >
      {isPlaying ? <FaPause size={11} /> : <FaPlay size={11} />}
    </button>
  );
}

function SongQueueBarControls({
  isPlaying,
  canResume,
  canStartFresh,
  playerRef,
  queue,
  current,
  volume,
  setVolume,
  onVolumeChange,
  publicUrl,
  linkCopied,
  setLinkCopied,
  onEnd,
}: {
  isPlaying: boolean;
  canResume: boolean;
  canStartFresh: boolean;
  playerRef: React.RefObject<SongQueuePlayerHandle | null>;
  queue: UseSongQueueResult;
  current: UseSongQueueResult["currentItem"];
  volume: number;
  setVolume: (volume: number) => void;
  onVolumeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  publicUrl: string | null;
  linkCopied: LinkCopiedState;
  setLinkCopied: (state: LinkCopiedState) => void;
  onEnd: () => Promise<void> | void;
}) {
  return (
    <div className="song-queue-bar-controls">
      <SongQueueBarPlayPauseButton
        isPlaying={isPlaying}
        canResume={canResume}
        canStartFresh={canStartFresh}
        firstPendingId={queue.pending[0]?.id}
        playerRef={playerRef}
        onPlayNow={(id) => void queue.playNow(id)}
      />
      <button
        type="button"
        className="song-queue-bar-btn"
        onClick={() => void queue.previous()}
        disabled={queue.loading || !current}
        title="Previous"
        aria-label="Previous"
      >
        <FaStepBackward size={11} />
      </button>
      <button
        type="button"
        className="song-queue-bar-btn"
        onClick={() => void queue.next()}
        disabled={queue.loading || !current}
        title="Next"
        aria-label="Next"
      >
        <FaStepForward size={11} />
      </button>
      <SongQueueBarVolume
        volume={volume}
        setVolume={setVolume}
        playerRef={playerRef}
        onVolumeChange={onVolumeChange}
      />
      {publicUrl && (
        <SongQueueBarCopyButton
          publicUrl={publicUrl}
          linkCopied={linkCopied}
          setLinkCopied={setLinkCopied}
        />
      )}
      <button
        type="button"
        className="song-queue-bar-btn song-queue-bar-btn--end"
        onClick={() => void onEnd()}
        disabled={queue.loading}
        title="End queue"
        aria-label="End queue"
      >
        <FaTimes size={11} />
      </button>
    </div>
  );
}

function SongQueueBarHeader({
  expanded,
  setExpanded,
  onOpen,
  queue,
  current,
  hasItems,
  playerState,
  isPlaying,
  canResume,
  canStartFresh,
  playerRef,
  volume,
  setVolume,
  onVolumeChange,
  publicUrl,
  linkCopied,
  setLinkCopied,
  onEnd,
}: {
  expanded: boolean;
  setExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  onOpen: () => void;
  queue: UseSongQueueResult;
  current: UseSongQueueResult["currentItem"];
  hasItems: boolean;
  playerState: SongQueuePlayerState;
  isPlaying: boolean;
  canResume: boolean;
  canStartFresh: boolean;
  playerRef: React.RefObject<SongQueuePlayerHandle | null>;
  volume: number;
  setVolume: (volume: number) => void;
  onVolumeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  publicUrl: string | null;
  linkCopied: LinkCopiedState;
  setLinkCopied: (state: LinkCopiedState) => void;
  onEnd: () => Promise<void> | void;
}) {
  return (
    <div className="song-queue-bar-header">
      <button
        type="button"
        className="song-queue-bar-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-label={expanded ? "Collapse queue bar" : "Expand queue bar"}
        title={expanded ? "Collapse" : "Expand"}
      >
        {expanded ? <FaChevronDown size={11} /> : <FaChevronUp size={11} />}
      </button>
      <SongQueueBarTitleButton
        onOpen={onOpen}
        current={current}
        hasItems={hasItems}
        pendingCount={queue.pending.length}
        historyCount={queue.history.length}
        playerState={playerState}
      />
      <SongQueueBarControls
        isPlaying={isPlaying}
        canResume={canResume}
        canStartFresh={canStartFresh}
        playerRef={playerRef}
        queue={queue}
        current={current}
        volume={volume}
        setVolume={setVolume}
        onVolumeChange={onVolumeChange}
        publicUrl={publicUrl}
        linkCopied={linkCopied}
        setLinkCopied={setLinkCopied}
        onEnd={onEnd}
      />
    </div>
  );
}

export default function SongQueueMinimizedBar({
  queue,
  hidden,
  onOpen,
  onEnd,
}: {
  queue: UseSongQueueResult;
  hidden?: boolean;
  onOpen: () => void;
  onEnd: () => Promise<void> | void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [linkCopied, setLinkCopied] = useState<LinkCopiedState>("idle");
  const [playerState, setPlayerState] =
    useState<SongQueuePlayerState>("unstarted");
  const [volume, setVolume] = useState(100);
  const publicUrl = queue.bootstrap?.publicUrl ?? null;
  const current = queue.currentItem;
  const playerRef = useRef<SongQueuePlayerHandle | null>(null);

  const onVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number(e.target.value);
      setVolume(val);
      playerRef.current?.setVolume(val);
    },
    [],
  );

  const hasItems = queue.items.length > 0;
  const isPlaying = playerState === "playing";
  const canResume = hasItems && (current !== undefined);
  const canStartFresh =
    !current && queue.pending.length > 0 && playerState !== "playing";

  return (
    <div
      className={`song-queue-bar${hidden ? " song-queue-bar--hidden" : ""}${expanded ? "" : " song-queue-bar--collapsed"}`}
      data-testid="song-queue-bar"
    >
      <SongQueueBarHeader
        expanded={expanded}
        setExpanded={setExpanded}
        onOpen={onOpen}
        queue={queue}
        current={current}
        hasItems={hasItems}
        playerState={playerState}
        isPlaying={isPlaying}
        canResume={canResume}
        canStartFresh={canStartFresh}
        playerRef={playerRef}
        volume={volume}
        setVolume={setVolume}
        onVolumeChange={onVolumeChange}
        publicUrl={publicUrl}
        linkCopied={linkCopied}
        setLinkCopied={setLinkCopied}
        onEnd={onEnd}
      />
      <SongQueueBarBody
        playerRef={playerRef}
        queue={queue}
        onStateChange={setPlayerState}
      />
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
