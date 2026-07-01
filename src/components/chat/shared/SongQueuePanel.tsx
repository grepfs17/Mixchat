import { useEffect, useState } from "react";
import { FaTwitch, FaYoutube, FaTrash, FaStepForward, FaStepBackward, FaPlay } from "react-icons/fa";
import {
  DEFAULT_SONG_QUEUE_CONFIG,
  MAX_QUEUE_LENGTH_CEILING,
  MAX_SONG_DURATION_CEILING_SEC,
  type SongQueueConfig,
  type SongQueueItem,
} from "../../../lib/songQueue/types";

export interface SongQueuePanelProps {
  /** Host name for the public link (e.g. "https://mixchat.grepfs.xyz"). */
  publicOrigin: string;
  phase: "idle" | "open" | "ended";
  config: SongQueueConfig;
  setConfig: (next: Partial<SongQueueConfig>) => void;
  currentItem: SongQueueItem | undefined;
  pending: SongQueueItem[];
  history: SongQueueItem[];
  items: SongQueueItem[];
  loading: boolean;
  error: string | null;
  publicUrl: string | null;
  start: () => Promise<void>;
  end: () => Promise<void>;
  remove: (itemId: string) => Promise<void>;
  skip: (itemId: string) => Promise<void>;
  playNow: (itemId: string) => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  reportDuration: (itemId: string, durationSec: number) => Promise<void>;
}

function labelScope(s: SongQueueConfig["scope"]): string {
  if (s === "twitch") return "Twitch only";
  if (s === "youtube") return "YouTube only";
  return "Twitch + YouTube";
}

function labelEligibility(e: SongQueueConfig["eligibility"]): string {
  return e === "everyone" ? "Everyone" : "Subscribers / Members only";
}

function formatDuration(sec: number): string {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function PlatformIcon({
  platform,
  size = 11,
}: {
  platform: "twitch" | "youtube";
  size?: number;
}) {
  return platform === "twitch" ? (
    <FaTwitch size={size} />
  ) : (
    <FaYoutube size={size} />
  );
}

export default function SongQueuePanel(props: SongQueuePanelProps) {
  const {
    phase,
    config,
    setConfig,
    currentItem,
    pending,
    history,
    items,
    loading,
    error,
    publicUrl,
    start,
    end,
    remove,
    skip,
    playNow,
    next,
    previous,
    reportDuration,
  } = props;

  const [linkCopied, setLinkCopied] = useState(false);

  // Reset the "Copied" indicator after 2s.
  useEffect(() => {
    if (!linkCopied) return;
    const t = setTimeout(() => setLinkCopied(false), 2000);
    return () => clearTimeout(t);
  }, [linkCopied]);

  // Enforce the locked-in hard ceilings client-side; the server enforces
  // them again.
  const maxLen = Math.min(
    Math.max(1, config.maxQueueLength),
    MAX_QUEUE_LENGTH_CEILING,
  );
  const maxDurMin = Math.min(
    Math.max(1, Math.round(config.maxSongDurationSec / 60)),
    Math.round(MAX_SONG_DURATION_CEILING_SEC / 60),
  );

  if (phase === "idle" || phase === "ended") {
    return (
      <div className="song-queue-panel">
        {phase === "ended" && (
          <p className="song-queue-banner">
            This queue has ended. Start a new one to begin again.
          </p>
        )}
        <label className="song-queue-field">
          <span className="song-queue-field-label">Title</span>
          <input
            type="text"
            className="song-queue-input"
            placeholder="e.g. Friday Night Mix"
            value={config.title}
            onChange={(e) => setConfig({ title: e.target.value })}
            maxLength={120}
          />
        </label>

        <SongQueueConfigForm
          config={config}
          setConfig={setConfig}
          maxLen={maxLen}
          maxDurMin={maxDurMin}
        />

        {error && <p className="song-queue-error">{error}</p>}

        <div className="song-queue-actions">
          <button
            className="song-queue-btn song-queue-btn--primary"
            onClick={start}
            disabled={loading}
          >
            {loading ? "Starting…" : "Start queue"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="song-queue-panel">
      <div className="song-queue-now-playing">
        {currentItem ? (
          <>
            <img
              className="song-queue-now-playing-thumb"
              src={currentItem.thumbnail}
              alt=""
            />
            <div className="song-queue-now-playing-meta">
              <span className="song-queue-now-playing-label">Now playing</span>
              <span className="song-queue-now-playing-title">
                {currentItem.title}
              </span>
              <span className="song-queue-now-playing-sub">
                {currentItem.channelTitle} ·{" "}
                {formatDuration(currentItem.durationSec)}
              </span>
            </div>
            <div className="song-queue-now-playing-controls">
              <button
                type="button"
                className="song-queue-btn song-queue-btn--icon"
                onClick={previous}
                disabled={loading}
                title="Previous"
                aria-label="Previous"
              >
                <FaStepBackward size={14} />
              </button>
              <button
                type="button"
                className="song-queue-btn song-queue-btn--icon"
                onClick={next}
                disabled={loading}
                title="Next"
                aria-label="Next"
              >
                <FaStepForward size={14} />
              </button>
            </div>
          </>
        ) : (
          <p className="song-queue-now-playing-empty">
            Waiting for the first song to load.
          </p>
        )}
      </div>

      <div className="song-queue-controls">
        <button
          className="song-queue-btn song-queue-btn--secondary"
          onClick={end}
          disabled={loading}
        >
          End queue
        </button>
      </div>

      <details className="song-queue-details">
        <summary>Queue settings</summary>
        <SongQueueConfigForm
          config={config}
          setConfig={setConfig}
          maxLen={maxLen}
          maxDurMin={maxDurMin}
        />
      </details>

      <div className="song-queue-public">
        <label className="song-queue-field">
          <span className="song-queue-field-label">Public link</span>
          <div className="song-queue-public-row">
            <input
              type="checkbox"
              checked={config.isPublic}
              onChange={(e) => setConfig({ isPublic: e.target.checked })}
            />
            <span>Share a read-only listening page with chatters</span>
          </div>
          {publicUrl && (
            <div className="song-queue-public-link">
              <code>{publicUrl}</code>
              <button
                type="button"
                className="song-queue-btn song-queue-btn--small"
                onClick={() => {
                  if (typeof navigator === "undefined" || !navigator.clipboard) return;
                  navigator.clipboard
                    .writeText(publicUrl)
                    .then(() => setLinkCopied(true))
                    .catch(() => undefined);
                }}
              >
                {linkCopied ? "Copied" : "Copy link"}
              </button>
            </div>
          )}
        </label>
        <label className="song-queue-field">
          <div className="song-queue-public-row">
            <input
              type="checkbox"
              checked={config.announceOnPlay}
              onChange={(e) => setConfig({ announceOnPlay: e.target.checked })}
            />
            <span>Announce &quot;now playing&quot; in chat</span>
          </div>
        </label>
        <label className="song-queue-field">
          <div className="song-queue-public-row">
            <input
              type="checkbox"
              checked={config.loop}
              onChange={(e) => setConfig({ loop: e.target.checked })}
            />
            <span>Loop queue (restart from the beginning when it ends)</span>
          </div>
        </label>
      </div>

      {error && <p className="song-queue-error">{error}</p>}

      <div className="song-queue-section">
        <h4 className="song-queue-section-title">
          Up next{" "}
          <span className="song-queue-section-count">
            {pending.length}/{maxLen}
          </span>
        </h4>
        {pending.length === 0 ? (
          <p className="song-queue-empty">
            No songs queued. Viewers can submit by posting a YouTube link in
            chat.
          </p>
        ) : (
          <ul className="song-queue-list">
            {pending.map((item) => (
              <li
                key={item.id}
                className="song-queue-item"
                data-status={item.status}
              >
                <img
                  src={item.thumbnail}
                  alt=""
                  className="song-queue-item-thumb"
                />
                <div className="song-queue-item-meta">
                  <span className="song-queue-item-title">{item.title}</span>
                  <span className="song-queue-item-sub">
                    <PlatformIcon platform={item.submitter.platform} />{" "}
                    {item.submitter.author} ·{" "}
                    {item.durationSec ? formatDuration(item.durationSec) : "—"}
                  </span>
                </div>
                <div className="song-queue-item-actions">
                  <button
                    type="button"
                    className="song-queue-btn song-queue-btn--icon"
                    onClick={() => playNow(item.id)}
                    title="Play now"
                    aria-label="Play now"
                  >
                    <FaPlay size={12} />
                  </button>
                  <button
                    type="button"
                    className="song-queue-btn song-queue-btn--icon"
                    onClick={() => remove(item.id)}
                    title="Remove"
                    aria-label="Remove"
                  >
                    <FaTrash size={12} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {history.length > 0 && (
        <div className="song-queue-section">
          <h4 className="song-queue-section-title">Played</h4>
          <ul className="song-queue-list">
            {history.map((item) => (
              <li
                key={item.id}
                className="song-queue-item"
                data-status={item.status}
              >
                <img
                  src={item.thumbnail}
                  alt=""
                  className="song-queue-item-thumb"
                />
                <div className="song-queue-item-meta">
                  <span className="song-queue-item-title">{item.title}</span>
                  <span className="song-queue-item-sub">
                    <PlatformIcon platform={item.submitter.platform} />{" "}
                    {item.submitter.author}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="song-queue-actions">
        <button
          type="button"
          className="song-queue-btn song-queue-btn--secondary"
          onClick={() => skip(currentItem?.id || "")}
          disabled={!currentItem || loading}
        >
          Skip current
        </button>
      </div>
    </div>
  );
}

function SongQueueConfigForm({
  config,
  setConfig,
  maxLen,
  maxDurMin,
}: {
  config: SongQueueConfig;
  setConfig: (next: Partial<SongQueueConfig>) => void;
  maxLen: number;
  maxDurMin: number;
}) {
  const overCeiling = config.maxQueueLength > MAX_QUEUE_LENGTH_CEILING;
  const overDurationCeiling =
    config.maxSongDurationSec > MAX_SONG_DURATION_CEILING_SEC;
  return (
    <>
      <label className="song-queue-field">
        <span className="song-queue-field-label">Max queue length</span>
        <input
          type="number"
          min={1}
          max={MAX_QUEUE_LENGTH_CEILING}
          className="song-queue-input"
          value={config.maxQueueLength}
          onChange={(e) =>
            setConfig({
              maxQueueLength: Math.max(
                1,
                Math.min(
                  MAX_QUEUE_LENGTH_CEILING,
                  parseInt(e.target.value || "0", 10) || 1,
                ),
              ),
            })
          }
        />
        {overCeiling && (
          <span className="song-queue-warning">
            Mixchat limits queues to {MAX_QUEUE_LENGTH_CEILING} songs for
            performance.
          </span>
        )}
        <span className="song-queue-field-hint">
          Maximum pending items (1–{MAX_QUEUE_LENGTH_CEILING}). Current cap:{" "}
          {maxLen}.
        </span>
      </label>

      <label className="song-queue-field">
        <span className="song-queue-field-label">Max song duration (min)</span>
        <input
          type="number"
          min={1}
          max={Math.round(MAX_SONG_DURATION_CEILING_SEC / 60)}
          className="song-queue-input"
          value={Math.round(config.maxSongDurationSec / 60)}
          onChange={(e) => {
            const minutes = Math.max(
              1,
              Math.min(
                Math.round(MAX_SONG_DURATION_CEILING_SEC / 60),
                parseInt(e.target.value || "0", 10) || 1,
              ),
            );
            setConfig({ maxSongDurationSec: minutes * 60 });
          }}
        />
        {overDurationCeiling && (
          <span className="song-queue-warning">
            Songs longer than {Math.round(MAX_SONG_DURATION_CEILING_SEC / 60)}{" "}
            min are not supported.
          </span>
        )}
        <span className="song-queue-field-hint">
          Songs over this duration will be skipped when they start. Current
          cap: {maxDurMin} min.
        </span>
      </label>

      <label className="song-queue-field">
        <span className="song-queue-field-label">
          Per-submitter limit (songs in queue)
        </span>
        <input
          type="number"
          min={1}
          max={50}
          className="song-queue-input"
          value={config.perSubmitterLimit}
          onChange={(e) =>
            setConfig({
              perSubmitterLimit: Math.max(
                1,
                Math.min(50, parseInt(e.target.value || "0", 10) || 1),
              ),
            })
          }
        />
        <span className="song-queue-field-hint">
          How many songs a single chatter can have in the queue at once.
          Default: 1.
        </span>
      </label>

      <fieldset className="song-queue-field">
        <legend className="song-queue-field-label">Scope</legend>
        <div className="song-queue-options-row">
          {(["twitch", "youtube", "both"] as const).map((s) => (
            <label key={s} className="song-queue-radio">
              <input
                type="radio"
                name="song-queue-scope"
                value={s}
                checked={config.scope === s}
                onChange={() => setConfig({ scope: s })}
              />
              <span>{labelScope(s)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="song-queue-field">
        <legend className="song-queue-field-label">Eligibility</legend>
        <div className="song-queue-options-row">
          {(["everyone", "subscribers"] as const).map((e) => (
            <label key={e} className="song-queue-radio">
              <input
                type="radio"
                name="song-queue-eligibility"
                value={e}
                checked={config.eligibility === e}
                onChange={() => setConfig({ eligibility: e })}
              />
              <span>{labelEligibility(e)}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </>
  );
}

export { DEFAULT_SONG_QUEUE_CONFIG };
