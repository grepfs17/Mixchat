import { useEffect, useState } from "react";
import { FaTwitch, FaYoutube } from "react-icons/fa";
import {
  formatWinnerAnnouncement,
  type GiveawayEntry,
} from "../../../lib/streamerTools/giveaway";
import {
  DURATION_PRESETS_SECONDS,
  UNLIMITED_DURATION,
  type UseGiveawayResult,
} from "../../../hooks/chat/useGiveaway";

const MIN_DURATION = 5;
const MAX_DURATION = 2 * 60 * 60;
const ENTRIES_PREVIEW_LIMIT = 50;
const ALL_SCOPES: ReadonlyArray<"twitch" | "youtube" | "both"> = [
  "twitch",
  "youtube",
  "both",
];

function formatCountdown(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSeconds = Math.ceil(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface GiveawayPanelProps {
  giveaway: UseGiveawayResult;
  onAnnounce: (winner: GiveawayEntry, message: string) => Promise<void>;
  announcing: boolean;
  /** Whether the user is connected to YouTube (gates YouTube scope options). */
  youtubeConnected?: boolean;
}

export default function GiveawayPanel({
  giveaway,
  onAnnounce,
  announcing,
  youtubeConnected = false,
}: GiveawayPanelProps) {
  const {
    phase,
    keyword,
    duration,
    scope,
    eligibility,
    endsAt,
    startedAt,
    liveEntries,
    winner,
    error,
    setKeyword,
    setDuration,
    setScope,
    setEligibility,
    setError,
    start,
    cancel,
    startNew,
    reveal,
  } = giveaway;

  // Local 1s tick for the countdown display — scoped to this component
  // so ChatApp never re-renders for the giveaway clock.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (phase !== "running") return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  const [notifyInChat, setNotifyInChat] = useState(true);

  // If the user signs out of YouTube while the panel is open, force the
  // scope back to Twitch. The effect runs on the connection-state change
  // so a manual scope change is not reverted.
  const requiresYouTube = scope === "youtube" || scope === "both";
  useEffect(() => {
    if (!youtubeConnected && requiresYouTube) {
      setScope("twitch");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [youtubeConnected]);

  // When YouTube is not connected, the YouTube-only and both options are
  // hidden entirely so the streamer only sees the relevant choice.
  const scopeOptions = youtubeConnected
    ? ALL_SCOPES
    : (ALL_SCOPES.filter(
        (s) => s === "twitch",
      ) as ReadonlyArray<"twitch">);

  return (
    <div className="giveaway-panel">
      {phase === "config" && (
        <div className="giveaway-form">
          <label className="giveaway-field">
            <span className="giveaway-field-label">Keyword</span>
            <input
              type="text"
              className="giveaway-input"
              placeholder="e.g. GIVEAWAY"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              maxLength={32}
              autoFocus
            />
            <span className="giveaway-field-hint">
              Viewers must type this exact word in chat to enter. Surrounding
              punctuation is ignored, so command keywords like{" "}
              <strong>!enter</strong> work. The channel owner is always
              excluded.
            </span>
          </label>

          <div className="giveaway-field">
            <span className="giveaway-field-label">Duration (seconds)</span>
            <div className="giveaway-duration-row">
              <div className="giveaway-input-suffix">
                <input
                  id="giveaway-duration-input"
                  type="text"
                  className="giveaway-input giveaway-input--with-suffix"
                  inputMode="numeric"
                  value={Number.isFinite(duration) ? String(duration) : ""}
                  aria-label="Duration in seconds"
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "") {
                      setDuration(0);
                      return;
                    }
                    const v = parseInt(raw, 10);
                    setDuration(Number.isNaN(v) ? 180 : v);
                  }}
                  placeholder="e.g. 180 (0 = unlimited)"
                />
                <span className="giveaway-input-suffix-label">sec</span>
              </div>
              <button
                type="button"
                className={`giveaway-preset${duration === UNLIMITED_DURATION ? " giveaway-preset--active" : ""}`}
                onClick={() => setDuration(UNLIMITED_DURATION)}
              >
                Unlimited
              </button>
            </div>
            <div className="giveaway-duration-presets">
              {DURATION_PRESETS_SECONDS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  className={`giveaway-preset${duration === preset.value ? " giveaway-preset--active" : ""}`}
                  onClick={() => setDuration(preset.value)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <span className="giveaway-field-hint">
              Time viewers have to enter. {MIN_DURATION}–{MAX_DURATION}{" "}
              seconds, or <strong>0 for unlimited</strong> (you reveal manually).
            </span>
          </div>

          <fieldset className="giveaway-field">
            <legend className="giveaway-field-label">Scope</legend>
            <div className="giveaway-options-row">
              {scopeOptions.map((s) => (
                <label key={s} className="giveaway-radio">
                  <input
                    type="radio"
                    name="giveaway-scope"
                    value={s}
                    checked={scope === s}
                    onChange={() => setScope(s)}
                  />
                  <span>{labelForScope(s)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="giveaway-field">
            <legend className="giveaway-field-label">Eligibility</legend>
            <div className="giveaway-options-row">
              {(["everyone", "subscribers"] as const).map((e) => (
                <label key={e} className="giveaway-radio">
                  <input
                    type="radio"
                    name="giveaway-eligibility"
                    value={e}
                    checked={eligibility === e}
                    onChange={() => setEligibility(e)}
                  />
                  <span>{labelForEligibility(e)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {error && <p className="giveaway-error">{error}</p>}

          <div className="giveaway-actions">
            <button type="button"
              className="giveaway-btn giveaway-btn--primary"
              onClick={start}
            >
              Start giveaway
            </button>
          </div>
        </div>
      )}

      {phase === "running" && (
        <GiveawayRunning
          keyword={keyword}
          scope={scope}
          eligibility={eligibility}
          liveEntries={liveEntries}
          endsAt={endsAt}
          startedAt={startedAt}
          now={now}
          onCancel={cancel}
          onReveal={reveal}
        />
      )}

      {phase === "revealed" && (
        <GiveawayRevealed
          winner={winner}
          liveEntries={liveEntries}
          keyword={keyword}
          notifyInChat={notifyInChat}
          setNotifyInChat={setNotifyInChat}
          announcing={announcing}
          onAnnounce={onAnnounce}
          onStartNew={startNew}
        />
      )}
    </div>
  );
}

interface GiveawayRunningProps {
  keyword: string;
  scope: "twitch" | "youtube" | "both";
  eligibility: "everyone" | "subscribers";
  liveEntries: GiveawayEntry[];
  endsAt: number | null;
  startedAt: number | null;
  now: number;
  onCancel: () => void;
  onReveal: () => void;
}

function GiveawayRunning({
  keyword,
  scope,
  eligibility,
  liveEntries,
  endsAt,
  startedAt,
  now,
  onCancel,
  onReveal,
}: GiveawayRunningProps) {
  const remainingMs = endsAt !== null ? Math.max(0, endsAt - now) : 0;
  const elapsedMs = startedAt !== null ? Math.max(0, now - startedAt) : 0;

  return (
    <div className="giveaway-running">
      <div className="giveaway-running-header">
        <div className="giveaway-keyword-chip">
          Keyword: <strong>{keyword.trim()}</strong>
        </div>
        <div className="giveaway-countdown">
          {endsAt === Number.POSITIVE_INFINITY
            ? formatCountdown(elapsedMs)
            : formatCountdown(remainingMs)}
        </div>
      </div>
      <div className="giveaway-running-stats">
        <span>
          <strong>{liveEntries.length}</strong> entr
          {liveEntries.length === 1 ? "y" : "ies"}
          {scope === "both" && (
            <span className="giveaway-running-breakdown">
              <span
                className="giveaway-running-breakdown-item"
                data-platform="twitch"
              >
                <FaTwitch size={10} />
                {liveEntries.filter((e) => e.platform === "twitch").length}
              </span>
              <span
                className="giveaway-running-breakdown-item"
                data-platform="youtube"
              >
                <FaYoutube size={10} />
                {liveEntries.filter((e) => e.platform === "youtube").length}
              </span>
            </span>
          )}
        </span>
        <span className="giveaway-running-meta">
          {labelForScope(scope)} · {labelForEligibility(eligibility)}
        </span>
      </div>
      {liveEntries.length > 0 && (
        <ul className="giveaway-entries">
          {liveEntries.slice(-ENTRIES_PREVIEW_LIMIT).map((e) => (
            <li
              key={`${e.platform}:${e.userId}`}
              className="giveaway-entry-row"
            >
              {e.authorAvatar ? (
                <img
                  src={e.authorAvatar}
                  alt=""
                  className="giveaway-entry-avatar"
                />
              ) : (
                <span className="giveaway-entry-avatar giveaway-entry-avatar--placeholder" />
              )}
              <span className="giveaway-entry-name">{e.author}</span>
              <span className="giveaway-entry-platform">
                {e.platform === "twitch" ? (
                  <FaTwitch size={11} />
                ) : (
                  <FaYoutube size={11} />
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="giveaway-actions">
        <button type="button"
          className="giveaway-btn giveaway-btn--secondary"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button type="button"
          className="giveaway-btn giveaway-btn--primary"
          onClick={onReveal}
          disabled={liveEntries.length === 0}
        >
          Reveal winner
        </button>
      </div>
    </div>
  );
}

interface GiveawayRevealedProps {
  winner: GiveawayEntry | null;
  liveEntries: GiveawayEntry[];
  keyword: string;
  notifyInChat: boolean;
  setNotifyInChat: (v: boolean) => void;
  announcing: boolean;
  onAnnounce: (winner: GiveawayEntry, message: string) => Promise<void>;
  onStartNew: () => void;
}

function GiveawayRevealed({
  winner,
  liveEntries,
  keyword,
  notifyInChat,
  setNotifyInChat,
  announcing,
  onAnnounce,
  onStartNew,
}: GiveawayRevealedProps) {
  return (
    <div className="giveaway-revealed">
      {winner ? (
        <>
          <div className="giveaway-winner-card">
            {winner.authorAvatar ? (
              <img
                src={winner.authorAvatar}
                alt=""
                className="giveaway-winner-avatar"
              />
            ) : (
              <span className="giveaway-winner-avatar giveaway-winner-avatar--placeholder" />
            )}
            <div className="giveaway-winner-meta">
              <span className="giveaway-winner-label">🏆 Winner</span>
              <span className="giveaway-winner-name">{winner.author}</span>
              <span className="giveaway-winner-platform">
                {winner.platform === "twitch" ? (
                  <FaTwitch size={12} />
                ) : (
                  <FaYoutube size={12} />
                )}{" "}
                {winner.platform}
              </span>
            </div>
          </div>
          <p className="giveaway-winner-summary">
            Picked from {liveEntries.length} eligible entr
            {liveEntries.length === 1 ? "y" : "ies"}. Keyword was{" "}
            <strong>{keyword.trim()}</strong>.
          </p>
          <label className="giveaway-checkbox">
            <input
              type="checkbox"
              checked={notifyInChat}
              onChange={(e) => setNotifyInChat(e.target.checked)}
            />
            <span>Notify in chat</span>
          </label>
          <p className="giveaway-notify-hint">
            <FaTwitch size={11} /> <FaYoutube size={11} /> announcements go to
            the winner&apos;s platform
          </p>
          <div className="giveaway-actions">
            <button type="button"
              className="giveaway-btn giveaway-btn--secondary"
              onClick={onStartNew}
            >
              New giveaway
            </button>
            <button type="button"
              className="giveaway-btn giveaway-btn--primary"
              onClick={async () => {
                await onAnnounce(
                  winner,
                  formatWinnerAnnouncement(winner, keyword.trim()),
                );
              }}
              disabled={!notifyInChat || announcing}
            >
              {announcing
                ? "Sending…"
                : notifyInChat
                  ? "Send to chat"
                  : "Notify disabled"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="giveaway-empty">
            No eligible entries were collected. Try again with a different
            keyword or eligibility.
          </p>
          <div className="giveaway-actions">
            <button type="button"
              className="giveaway-btn giveaway-btn--primary"
              onClick={onStartNew}
            >
              New giveaway
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function labelForScope(scope: "twitch" | "youtube" | "both"): string {
  if (scope === "twitch") return "Twitch only";
  if (scope === "youtube") return "YouTube only";
  return "Twitch + YouTube";
}

function labelForEligibility(
  eligibility: "everyone" | "subscribers",
): string {
  return eligibility === "everyone"
    ? "Everyone"
    : "Subscribers (Twitch) / Members (YouTube)";
}
