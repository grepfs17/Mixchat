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
} from "./SongQueuePlayer";

/**
 * Minimized song-queue bar.
 *
 * Rendered when the queue is in the "open" phase AND the Streamer Tools
 * modal is closed. Hosts the live YouTube IFrame Player so the streamer
 * can keep listening / curating while chatting. The modal itself never
 * owns the player; it only shows a "now playing" header, so toggling
 * minimize ↔ reopen does not destroy the iframe.
 *
 * The bar lives inside the chat column (between the messages and the
 * chat input) so it never overlaps the message composer. When expanded
 * it grows upward with a `max-height: 60vh` cap; the chat messages
 * scroll behind the expanded bar.
 */
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
  const [linkCopied, setLinkCopied] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const [playerState, setPlayerState] = useState<
    "unstarted" | "playing" | "paused" | "ended" | "loading"
  >("unstarted");
  const [volume, setVolume] = useState(100);
  const publicUrl = queue.bootstrap?.publicUrl ?? null;
  const current = queue.currentItem;
  const playerRef = useRef<SongQueuePlayerHandle | null>(null);

  const handleCopyLink = () => {
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

  const hasItems = queue.items.length > 0;
  const isPlaying = playerState === "playing";
  const canResume = hasItems && (current !== undefined);
  const canStartFresh =
    !current && queue.pending.length > 0 && playerState !== "playing";

  const onPlayPause = () => {
    if (isPlaying) {
      playerRef.current?.pause();
    } else {
      if (canResume) {
        playerRef.current?.play();
      } else if (queue.pending[0]) {
        void queue.playNow(queue.pending[0].id);
      }
    }
  };

  const onVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number(e.target.value);
      setVolume(val);
      playerRef.current?.setVolume(val);
    },
    [],
  );

  return (
    <div
      className={`song-queue-bar${hidden ? " song-queue-bar--hidden" : ""}${expanded ? "" : " song-queue-bar--collapsed"}`}
      data-testid="song-queue-bar"
    >
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
              {queue.pending.length} queued · {queue.history.length} played
              {playerState === "paused" && current ? " · paused" : ""}
              {current ? (
                <>
                  {" · "}
                  {current.submitter.platform === "twitch" ? (
                    <FaTwitch size={8} />
                  ) : (
                    <FaYoutube size={8} />
                  )}{" "}
                  {current.submitter.author}
                </>
              ) : null}
            </span>
          </span>
        </button>
        <div className="song-queue-bar-controls">
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
          <span className="song-queue-bar-volume">
            <button
              type="button"
              className="song-queue-bar-btn song-queue-bar-volume-icon"
              onClick={() => {
                const next = volume === 0 ? 100 : 0;
                setVolume(next);
                playerRef.current?.setVolume(next);
              }}
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
          {publicUrl && (
            <button
              type="button"
              className="song-queue-bar-btn"
              onClick={handleCopyLink}
              title="Copy public link"
              aria-label="Copy public link"
            >
              {linkCopied === "copied"
                ? "Copied"
                : linkCopied === "failed"
                  ? "Failed"
                  : "Copy link"}
            </button>
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
      </div>
      <div className="song-queue-bar-body">
        <div className="song-queue-bar-player-wrap">
          <SongQueuePlayer
            ref={playerRef}
            items={queue.items}
            currentIndex={Math.max(
              0,
              queue.items.findIndex((it) => it.id === current?.id),
            )}
            onAdvance={() => void queue.next()}
            onStateChange={setPlayerState}
            onDurationKnown={(itemId, dur) => {
              if (dur > queue.config.maxSongDurationSec) {
                const item = queue.items.find((it) => it.id === itemId);
                if (item) void queue.notifyTooLong(item);
                void queue.skip(itemId);
                void queue.next();
              } else {
                void queue.reportDuration(itemId, dur);
              }
            }}
            className="song-queue-bar-player"
          />
        </div>
        <div className="song-queue-bar-list-wrap">
          {current && (
            <div className="song-queue-bar-now-playing">
              <span className="song-queue-bar-now-playing-channel">{current.channelTitle}</span>
              <span className="song-queue-bar-now-playing-title">{current.title}</span>
              <span className="song-queue-bar-now-playing-sub">
                {current.submitter.platform === "twitch" ? (
                  <FaTwitch size={9} />
                ) : (
                  <FaYoutube size={9} />
                )}{" "}
                {current.submitter.author}
              </span>
            </div>
          )}
          {queue.items.length > 0 && (
            <ul className="song-queue-bar-list" aria-label="Queue">
              {queue.items.map((item) => (
                <li
                  key={item.id}
                  className={`song-queue-bar-item${item.id === current?.id ? " song-queue-bar-item--active" : ""}`}
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
                      {item.submitter.platform === "twitch" ? (
                        <FaTwitch size={9} />
                      ) : (
                        <FaYoutube size={9} />
                      )}{" "}
                      {item.submitter.author}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="song-queue-bar-item-btn"
                    onClick={() => void queue.playNow(item.id)}
                    title="Play now"
                    aria-label={`Play ${item.title} now`}
                  >
                    Play
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
