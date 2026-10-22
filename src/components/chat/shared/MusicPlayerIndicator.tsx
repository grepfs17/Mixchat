import { useCallback, useEffect, useRef, useState } from "react";
import {
  FaChevronDown,
  FaChevronUp,
  FaPlay,
  FaPause,
  FaStepBackward,
  FaStepForward,
  FaTimes,
  FaVolumeMute,
  FaVolumeUp,
  FaMusic,
} from "react-icons/fa";
import type { UseMusicPlayerResult } from "../../../hooks/chat/useMusicPlayer";
import type {
  MusicPlayerItem,
  MusicPlaylist,
} from "../../../lib/musicPlayer/types";
import SongQueuePlayer, {
  type SongQueuePlayerHandle,
  type SongQueuePlayerState,
} from "./SongQueuePlayer";

/**
 * Minimized music-player bar in the chat column: always-visible title,
 * progress slider, and controls. Expanding reveals the iframe and playlist.
 */
export default function MusicPlayerMinimizedBar({
  player,
  hidden,
  onOpen,
}: {
  player: UseMusicPlayerResult;
  hidden?: boolean;
  onOpen: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [playerState, setPlayerState] = useState<
    "unstarted" | "playing" | "paused" | "ended" | "loading"
  >("unstarted");
  // The slider mirrors `player.volume` directly so changes from any path
  // (muting via the icon button, future panel control, persistence load)
  // stay in sync without an effect.
  const volume = player.volume;
  const playerRef = useRef<SongQueuePlayerHandle | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  // Ref that we raise while the user is actively dragging the seek
  // slider, so the polling interval doesn't fight their cursor.
  const seekingRef = useRef(false);
  // Poll the YouTube player for the current playback position.
  // Always active: the time bar is in the header and visible even
  // when collapsed.
  useEffect(() => {
    const iv = window.setInterval(() => {
      if (seekingRef.current) return;
      const t = playerRef.current?.getCurrentTime() ?? 0;
      const d = playerRef.current?.getDuration() ?? 0;
      setCurrentTime(t);
      setDuration(d);
    }, 500);
    return () => window.clearInterval(iv);
  }, []);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setCurrentTime(val);
    seekingRef.current = true;
    playerRef.current?.seekTo(val);
  }, []);

  const handleSeekEnd = useCallback(() => {
    // Allow polling to take over again once the user releases the slider.
    seekingRef.current = false;
  }, []);

  const handlePlay = useCallback(() => {
    if (playerState === "playing") {
      playerRef.current?.pause();
    } else {
      playerRef.current?.play();
    }
  }, [playerState]);

  const handleVolume = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    playerRef.current?.setVolume(val);
    player.setVolume(val);
  }, [player]);

  const handleToggleMute = useCallback(() => {
    const next = volume === 0 ? 100 : 0;
    playerRef.current?.setVolume(next);
    player.setVolume(next);
  }, [volume, player]);

  const playlistItems = player.activePlaylist?.items ?? [];
  const hasItems = playlistItems.length > 0;
  const current = player.currentItem;
  const isPlaying = playerState === "playing";

  if (!hasItems) return null;

  return (
    <div
      className={`music-player-bar${hidden ? " music-player-bar--hidden" : ""}${
        expanded ? " music-player-bar--expanded" : " music-player-bar--collapsed"
      }`}
      data-testid="music-player-bar"
    >
      <div className="music-player-bar-header">
        <button
          type="button"
          className="music-player-bar-toggle"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Collapse player" : "Expand player"}
          title={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <FaChevronDown size={11} /> : <FaChevronUp size={11} />}
        </button>
        <button
          type="button"
          className="music-player-bar-title"
          onClick={onOpen}
          title="Open Music Player in Streamer tools"
        >
          <TrackTitle
            current={current}
            playlist={player.activePlaylist}
            playerState={playerState}
          />
        </button>

        <TimeProgress
          currentTime={currentTime}
          duration={duration}
          onSeek={handleSeek}
          onSeekEnd={handleSeekEnd}
        />

        <PlaybackControls
          isPlaying={isPlaying}
          hasCurrent={!!current}
          volume={volume}
          onPlay={handlePlay}
          onPrevious={() => player.previous()}
          onNext={() => player.next()}
          onToggleMute={handleToggleMute}
          onVolumeChange={handleVolume}
          onHide={() => player.hideMiniBar()}
        />
      </div>
      <div className="music-player-bar-body">
        <div className="music-player-bar-player-wrap">
          <SongQueuePlayer
            ref={playerRef}
            items={playlistItems.map((it) => ({
              id: it.id,
              videoId: it.videoId,
            }))}
            currentIndex={player.currentIndex}
            onAdvance={() => player.next()}
            onStateChange={setPlayerState}
            onDurationKnown={(_id, dur) => {
              setDuration(dur);
            }}
            className="music-player-bar-player"
          />
        </div>
        <div className="music-player-bar-list-wrap">
          <NowPlayingInfo current={current} />
          <Playlist
            items={playlistItems}
            currentId={current?.id}
            onPlayIndex={(idx) => player.playTrackIndex(idx)}
          />
        </div>
      </div>
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}:${rs.toString().padStart(2, "0")}`;
}

interface TrackTitleProps {
  current: MusicPlayerItem | null;
  playlist: MusicPlaylist | null;
  playerState: SongQueuePlayerState;
}

function TrackTitle({ current, playlist, playerState }: TrackTitleProps) {
  return (
    <>
      <span className="music-player-bar-icon" aria-hidden="true">
        <FaMusic size={11} />
      </span>
      <span className="music-player-bar-meta">
        <span className="music-player-bar-title-text">
          {current ? truncate(current.title, 50) : "Ready: press play"}
        </span>
        <span className="music-player-bar-sub">
          {playlist?.name ?? ""}
          {current?.channelTitle ? ` · ${current.channelTitle}` : ""}
          {playerState === "paused" && current ? " · paused" : ""}
        </span>
      </span>
    </>
  );
}

interface TimeProgressProps {
  currentTime: number;
  duration: number;
  onSeek: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSeekEnd: () => void;
}

function TimeProgress({
  currentTime,
  duration,
  onSeek,
  onSeekEnd,
}: TimeProgressProps) {
  return (
    <div className="music-player-bar-time music-player-bar-time--inline">
      <span className="music-player-bar-time-current">
        {formatTime(currentTime)}
      </span>
      <input
        type="range"
        min={0}
        max={duration || 1}
        value={currentTime}
        onChange={onSeek}
        onMouseUp={onSeekEnd}
        onKeyUp={onSeekEnd}
        onTouchEnd={onSeekEnd}
        className="music-player-bar-time-slider"
        aria-label="Seek"
        title={`Seek: ${formatTime(currentTime)} / ${formatTime(duration)}`}
      />
      <span className="music-player-bar-time-duration">
        {formatTime(duration)}
      </span>
    </div>
  );
}

interface PlaybackControlsProps {
  isPlaying: boolean;
  hasCurrent: boolean;
  volume: number;
  onPlay: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onToggleMute: () => void;
  onVolumeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onHide: () => void;
}

function PlaybackControls({
  isPlaying,
  hasCurrent,
  volume,
  onPlay,
  onPrevious,
  onNext,
  onToggleMute,
  onVolumeChange,
  onHide,
}: PlaybackControlsProps) {
  return (
    <div className="music-player-bar-controls">
      <button
        type="button"
        className="music-player-bar-btn music-player-bar-btn--primary"
        onClick={onPlay}
        title={isPlaying ? "Pause" : "Play"}
        aria-label={isPlaying ? "Pause" : "Play"}
        data-testid="music-player-bar-play"
      >
        {isPlaying ? <FaPause size={11} /> : <FaPlay size={11} />}
      </button>
      <button
        type="button"
        className="music-player-bar-btn"
        onClick={onPrevious}
        disabled={!hasCurrent}
        title="Previous"
        aria-label="Previous"
      >
        <FaStepBackward size={11} />
      </button>
      <button
        type="button"
        className="music-player-bar-btn"
        onClick={onNext}
        disabled={!hasCurrent}
        title="Next"
        aria-label="Next"
      >
        <FaStepForward size={11} />
      </button>
      <span className="music-player-bar-volume">
        <button
          type="button"
          className="music-player-bar-btn music-player-bar-volume-icon"
          onClick={onToggleMute}
          title={volume === 0 ? "Unmute" : "Mute"}
          aria-label={volume === 0 ? "Unmute" : "Mute"}
        >
          {volume === 0 ? (
            <FaVolumeMute size={11} />
          ) : (
            <FaVolumeUp size={11} />
          )}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={onVolumeChange}
          className="music-player-bar-volume-slider"
          aria-label="Volume"
          title={`Volume: ${volume}%`}
        />
      </span>
      <button
        type="button"
        className="music-player-bar-btn music-player-bar-btn--close"
        onClick={onHide}
        title="Hide player"
        aria-label="Hide player"
      >
        <FaTimes size={10} />
      </button>
    </div>
  );
}

function NowPlayingInfo({ current }: { current: MusicPlayerItem | null }) {
  if (!current) return null;
  return (
    <div className="music-player-bar-now-playing">
      <span className="music-player-bar-now-playing-channel">
        {current.channelTitle}
      </span>
      <span className="music-player-bar-now-playing-title">
        {current.title}
      </span>
    </div>
  );
}

interface PlaylistProps {
  items: MusicPlayerItem[];
  currentId?: string;
  onPlayIndex: (index: number) => void;
}

function Playlist({ items, currentId, onPlayIndex }: PlaylistProps) {
  if (items.length === 0) return null;
  return (
    <ul className="music-player-bar-list" aria-label="Playlist">
      {items.map((item) => (
        <li
          key={item.id}
          className={`music-player-bar-item${item.id === currentId ? " music-player-bar-item--active" : ""}`}
        >
          <img
            className="music-player-bar-item-thumb"
            src={item.thumbnail}
            alt=""
          />
          <div className="music-player-bar-item-meta">
            <span className="music-player-bar-item-title">
              {truncate(item.title, 36)}
            </span>
            <span className="music-player-bar-item-sub">
              {item.channelTitle}
            </span>
          </div>
          <button
            type="button"
            className="music-player-bar-item-btn"
            onClick={() => {
              const idx = items.findIndex((it) => it.id === item.id);
              if (idx >= 0) onPlayIndex(idx);
            }}
            title="Play now"
            aria-label={`Play ${item.title} now`}
          >
            Play
          </button>
        </li>
      ))}
    </ul>
  );
}
