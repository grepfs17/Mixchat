import { useMemo } from "react";
import { FaPlus, FaPoll, FaTimes } from "react-icons/fa";
import type { PollState } from "./bannerTypes";
import type { UsePollCreatorResult } from "../../../hooks/chat/usePollCreator";
import { useCountdownTimer } from "../../../hooks/ui/useCountdownTimer";
import {
  POLL_DURATION_PRESETS,
  POLL_LIMITS,
} from "../../../lib/streamerTools/poll";

interface PollPanelProps {
  poll: UsePollCreatorResult;
  livePoll: PollState | null;
  role?: "owner" | "moderator";
  affiliateEligible?: boolean;
}

function parseNumberInput(raw: string): number {
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : 0;
}

function parseDurationInput(raw: string): number {
  return Math.min(
    POLL_LIMITS.maxDuration,
    Math.max(0, parseNumberInput(raw)),
  );
}

function resultsFor(poll: PollState) {
  const maxVotes = Math.max(1, ...poll.choices.map((c) => c.votes));
  let winningId: string | undefined;
  let max = -1;
  for (const choice of poll.choices) {
    if (choice.votes > max) {
      max = choice.votes;
      winningId = choice.id;
    }
  }
  return { maxVotes, winningId };
}

export default function PollPanel({
  poll,
  livePoll,
  role = "owner",
  affiliateEligible = true,
}: PollPanelProps) {
  const isOwner = role === "owner";
  const canCreate = isOwner ? affiliateEligible : true;
  const {
    phase,
    config,
    error,
    starting,
    ending,
    relayCommand,
    setField,
    setChoice,
    addChoice,
    removeChoice,
    start,
    end,
    startNew,
  } = poll;
  const relayPending =
    relayCommand?.status === "pending" || relayCommand?.status === "claimed";

  return (
    <div className="poll-panel">
      {phase === "config" && (
        <div className="poll-form">
          {!isOwner && (
            <p className="poll-hint">
              Poll requests run as the streamer. Mixchat must be open on
              their channel.
            </p>
          )}
          {isOwner && !affiliateEligible && (
            <p className="poll-hint poll-hint--warn">
              Twitch polls are available to Affiliates and Partners only.
            </p>
          )}
          {relayPending && (
            <p className="poll-hint">Waiting for the streamer...</p>
          )}

          <label className="poll-field">
            <span className="poll-field-label">Question</span>
            <input
              type="text"
              className="poll-input"
              placeholder="e.g. What should we play next?"
              value={config.title}
              onChange={(e) => setField("title", e.target.value)}
              maxLength={POLL_LIMITS.maxTitleLength}
              autoFocus
            />
          </label>

          <fieldset className="poll-field">
            <legend className="poll-field-label">Choices</legend>
            <div className="poll-choices">
              {config.choices.map((choice, index) => (
                <div className="poll-choice-row" key={index}>
                  <input
                    type="text"
                    className="poll-input"
                    placeholder={`Choice ${index + 1}`}
                    value={choice}
                    onChange={(e) => setChoice(index, e.target.value)}
                    maxLength={POLL_LIMITS.maxChoiceLength}
                    aria-label={`Choice ${index + 1}`}
                  />
                  <button
                    type="button"
                    className="poll-choice-remove"
                    onClick={() => removeChoice(index)}
                    disabled={config.choices.length <= POLL_LIMITS.minChoices}
                    title="Remove choice"
                    aria-label={`Remove choice ${index + 1}`}
                  >
                    <FaTimes size={12} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="poll-add-choice"
              onClick={addChoice}
              disabled={config.choices.length >= POLL_LIMITS.maxChoices}
            >
              <FaPlus size={11} />
              Add choice
            </button>
            <span className="poll-field-hint">
              {POLL_LIMITS.minChoices}-{POLL_LIMITS.maxChoices} choices, up to{" "}
              {POLL_LIMITS.maxChoiceLength} characters each.
            </span>
          </fieldset>

          <div className="poll-field">
            <span className="poll-field-label">Duration (seconds)</span>
            <div className="poll-duration-row">
              <div className="poll-input-suffix">
                <input
                  type="text"
                  className="poll-input poll-input--with-suffix"
                  inputMode="numeric"
                  value={String(config.duration)}
                  aria-label="Duration in seconds"
                  onChange={(e) =>
                    setField("duration", parseDurationInput(e.target.value))
                  }
                />
                <span className="poll-input-suffix-label">sec</span>
              </div>
            </div>
            <div className="poll-duration-presets">
              {POLL_DURATION_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  className={`poll-preset${config.duration === preset.value ? " poll-preset--active" : ""}`}
                  onClick={() => setField("duration", preset.value)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <span className="poll-field-hint">
              Twitch allows {POLL_LIMITS.minDuration}-
              {POLL_LIMITS.maxDuration} seconds.
            </span>
          </div>

          <fieldset className="poll-field">
            <legend className="poll-field-label">Voting</legend>
            <label className="poll-toggle">
              <input
                type="checkbox"
                checked={config.channelPointsVoting}
                onChange={(e) =>
                  setField("channelPointsVoting", e.target.checked)
                }
              />
              <span>Channel Points voting</span>
            </label>
            {config.channelPointsVoting && (
              <div className="poll-toggle-detail">
                <input
                  type="number"
                  className="poll-input poll-input--number"
                  min={POLL_LIMITS.minChannelPointsPerVote}
                  max={POLL_LIMITS.maxChannelPointsPerVote}
                  value={config.channelPointsPerVote}
                  aria-label="Channel Points per vote"
                  onChange={(e) =>
                    setField(
                      "channelPointsPerVote",
                      parseNumberInput(e.target.value),
                    )
                  }
                />
                <span>points per vote</span>
              </div>
            )}

            <label className="poll-toggle">
              <input
                type="checkbox"
                checked={config.bitsVoting}
                onChange={(e) => setField("bitsVoting", e.target.checked)}
              />
              <span>Bits voting</span>
            </label>
            {config.bitsVoting && (
              <div className="poll-toggle-detail">
                <input
                  type="number"
                  className="poll-input poll-input--number"
                  min={0}
                  max={POLL_LIMITS.maxBitsPerVote}
                  value={config.bitsPerVote}
                  aria-label="Bits per vote"
                  onChange={(e) =>
                    setField("bitsPerVote", parseNumberInput(e.target.value))
                  }
                />
                <span>bits per vote</span>
              </div>
            )}
          </fieldset>

          {error && <p className="poll-error">{error}</p>}

          <div className="poll-actions">
            <button
              type="button"
              className="poll-btn poll-btn--primary"
              onClick={() => void start()}
              disabled={starting || !canCreate || relayPending}
            >
              {starting ? "Starting..." : "Start poll"}
            </button>
          </div>
        </div>
      )}

      {phase === "active" && livePoll && (
        <PollResults
          poll={livePoll}
          canEnd
          relayPending={relayPending}
          ending={ending}
          error={error}
          onEnd={() => void end()}
        />
      )}

      {phase === "ended" && livePoll && (
        <div className="poll-results">
          <div className="poll-results-header">
            <span className="poll-results-title">
              <FaPoll size={14} />
              {livePoll.title}
            </span>
            <span className="poll-results-status">
              {livePoll.status === "archived" ? "Archived" : "Poll ended"}
            </span>
          </div>
          <PollVoteBars poll={livePoll} showWinner />
          {error && <p className="poll-error">{error}</p>}
          <div className="poll-actions">
            <button
              type="button"
              className="poll-btn poll-btn--primary"
              onClick={startNew}
            >
              New poll
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface PollResultsProps {
  poll: PollState;
  canEnd: boolean;
  relayPending: boolean;
  ending: boolean;
  error: string | null;
  onEnd: () => void;
}

function PollResults({
  poll,
  canEnd,
  relayPending,
  ending,
  error,
  onEnd,
}: PollResultsProps) {
  const { timeDisplay, isExpired } = useCountdownTimer(poll.endsAt);

  return (
    <div className="poll-results">
      <div className="poll-results-header">
        <span className="poll-results-title">
          <FaPoll size={14} />
          {poll.title}
        </span>
        <span className="poll-results-timer">
          {isExpired ? "Ending..." : timeDisplay}
        </span>
      </div>

      <PollVoteBars poll={poll} />

      <div className="poll-results-meta">
        <span>{poll.totalVotes} total votes</span>
        <span>Live from Twitch</span>
      </div>

      {relayPending && (
        <p className="poll-hint">Waiting for the streamer...</p>
      )}
      {error && <p className="poll-error">{error}</p>}

      <div className="poll-actions">
        <button
          type="button"
          className="poll-btn poll-btn--danger"
          onClick={onEnd}
          disabled={ending || !canEnd || relayPending}
        >
          {ending ? "Ending..." : "End poll"}
        </button>
      </div>
    </div>
  );
}

function PollVoteBars({
  poll,
  showWinner = false,
}: {
  poll: PollState;
  showWinner?: boolean;
}) {
  const { maxVotes, winningId } = useMemo(() => resultsFor(poll), [poll]);

  return (
    <ul className="poll-vote-list">
      {poll.choices.map((choice) => {
        const percent = Math.round((choice.votes / Math.max(1, poll.totalVotes)) * 100);
        const width = Math.round((choice.votes / maxVotes) * 100);
        const isWinner = showWinner && choice.id === winningId;
        return (
          <li
            key={choice.id}
            className={`poll-vote-row${isWinner ? " poll-vote-row--winner" : ""}`}
          >
            <div className="poll-vote-bar" style={{ width: `${width}%` }} />
            <span className="poll-vote-label">{choice.title}</span>
            <span className="poll-vote-count">
              {choice.votes} ({percent}%)
            </span>
          </li>
        );
      })}
    </ul>
  );
}
