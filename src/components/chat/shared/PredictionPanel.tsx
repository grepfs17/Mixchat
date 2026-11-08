import { useMemo, useState } from "react";
import { FaCheck, FaMagic, FaPlus, FaTimes } from "react-icons/fa";
import type { PredictionState } from "./bannerTypes";
import type { UsePredictionCreatorResult } from "../../../hooks/chat/usePredictionCreator";
import { useCountdownTimer } from "../../../hooks/ui/useCountdownTimer";
import {
  PREDICTION_LIMITS,
  PREDICTION_WINDOW_PRESETS,
} from "../../../lib/streamerTools/prediction";

interface PredictionPanelProps {
  prediction: UsePredictionCreatorResult;
  livePrediction: PredictionState | null;
  role?: "owner" | "moderator";
}

function parseNumberInput(raw: string): number {
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : 0;
}

function parseWindowInput(raw: string): number {
  return Math.min(
    PREDICTION_LIMITS.maxWindow,
    Math.max(0, parseNumberInput(raw)),
  );
}

function outcomeColor(color: string, isWinner: boolean): string {
  if (isWinner) return "var(--color-green)";
  return color === "blue" ? "var(--color-twitch)" : "var(--color-accent)";
}

export default function PredictionPanel({
  prediction,
  livePrediction,
  role = "owner",
}: PredictionPanelProps) {
  const isOwner = role === "owner";
  const {
    phase,
    config,
    error,
    starting,
    acting,
    setField,
    setOutcome,
    addOutcome,
    removeOutcome,
    start,
    lock,
    resolve,
    cancel,
    startNew,
  } = prediction;

  const [selectedOutcomeId, setSelectedOutcomeId] = useState("");
  const selectedWinningId = livePrediction?.outcomes.some(
    (outcome) => outcome.id === selectedOutcomeId,
  )
    ? selectedOutcomeId
    : "";

  return (
    <div className="prediction-panel">
      {phase === "config" && (
        <div className="prediction-form">
          {!isOwner && (
            <p className="prediction-hint prediction-hint--warn">
              Only the broadcaster can create Twitch predictions.
            </p>
          )}

          <label className="prediction-field">
            <span className="prediction-field-label">Title</span>
            <input
              type="text"
              className="prediction-input"
              placeholder="e.g. Will we win this match?"
              value={config.title}
              onChange={(e) => setField("title", e.target.value)}
              maxLength={PREDICTION_LIMITS.maxTitleLength}
              autoFocus
            />
          </label>

          <fieldset className="prediction-field">
            <legend className="prediction-field-label">Outcomes</legend>
            <div className="prediction-outcomes">
              {config.outcomes.map((outcome, index) => (
                <div className="prediction-outcome-row" key={index}>
                  <input
                    type="text"
                    className="prediction-input"
                    placeholder={`Outcome ${index + 1}`}
                    value={outcome}
                    onChange={(e) => setOutcome(index, e.target.value)}
                    maxLength={PREDICTION_LIMITS.maxOutcomeLength}
                    aria-label={`Outcome ${index + 1}`}
                  />
                  <button
                    type="button"
                    className="prediction-outcome-remove"
                    onClick={() => removeOutcome(index)}
                    disabled={
                      config.outcomes.length <= PREDICTION_LIMITS.minOutcomes
                    }
                    title="Remove outcome"
                    aria-label={`Remove outcome ${index + 1}`}
                  >
                    <FaTimes size={12} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="prediction-add-outcome"
              onClick={addOutcome}
              disabled={
                config.outcomes.length >= PREDICTION_LIMITS.maxOutcomes
              }
            >
              <FaPlus size={11} />
              Add outcome
            </button>
            <span className="prediction-field-hint">
              {PREDICTION_LIMITS.minOutcomes}-
              {PREDICTION_LIMITS.maxOutcomes} outcomes, up to{" "}
              {PREDICTION_LIMITS.maxOutcomeLength} characters each.
            </span>
          </fieldset>

          <div className="prediction-field">
            <span className="prediction-field-label">Prediction window</span>
            <div className="prediction-window-row">
              <div className="prediction-input-suffix">
                <input
                  type="text"
                  className="prediction-input prediction-input--with-suffix"
                  inputMode="numeric"
                  value={String(config.windowSeconds)}
                  aria-label="Prediction window in seconds"
                  onChange={(e) =>
                    setField(
                      "windowSeconds",
                      parseWindowInput(e.target.value),
                    )
                  }
                />
                <span className="prediction-input-suffix-label">sec</span>
              </div>
            </div>
            <div className="prediction-window-presets">
              {PREDICTION_WINDOW_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  className={`prediction-preset${config.windowSeconds === preset.value ? " prediction-preset--active" : ""}`}
                  onClick={() => setField("windowSeconds", preset.value)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <span className="prediction-field-hint">
              Time viewers have to place points. Twitch allows{" "}
              {PREDICTION_LIMITS.minWindow}-{PREDICTION_LIMITS.maxWindow}{" "}
              seconds. Channel Points must be enabled on the channel.
            </span>
          </div>

          {error && <p className="prediction-error">{error}</p>}

          <div className="prediction-actions">
            <button
              type="button"
              className="prediction-btn prediction-btn--primary"
              onClick={() => void start()}
              disabled={starting || !isOwner}
            >
              {starting ? "Starting..." : "Start prediction"}
            </button>
          </div>
        </div>
      )}

      {phase === "active" && livePrediction && (
        <PredictionActive
          prediction={livePrediction}
          isOwner={isOwner}
          acting={acting}
          error={error}
          onLock={() => void lock()}
          onCancel={() => void cancel()}
        />
      )}

      {phase === "locked" && livePrediction && (
        <PredictionLocked
          prediction={livePrediction}
          isOwner={isOwner}
          acting={acting}
          error={error}
          selectedOutcomeId={selectedWinningId}
          onSelectOutcome={setSelectedOutcomeId}
          onResolve={() => void resolve(selectedWinningId)}
          onCancel={() => void cancel()}
        />
      )}

      {phase === "ended" && livePrediction && (
        <div className="prediction-results">
          <div className="prediction-results-header">
            <span className="prediction-results-title">
              <FaMagic size={14} />
              {livePrediction.title}
            </span>
            <span className="prediction-results-status">
              {livePrediction.status === "canceled"
                ? "Canceled"
                : "Resolved"}
            </span>
          </div>
          <PredictionOutcomeBars
            prediction={livePrediction}
            winningOutcomeId={livePrediction.winningOutcomeId}
          />
          {error && <p className="prediction-error">{error}</p>}
          <div className="prediction-actions">
            <button
              type="button"
              className="prediction-btn prediction-btn--primary"
              onClick={startNew}
              disabled={!isOwner}
            >
              New prediction
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface PredictionActiveProps {
  prediction: PredictionState;
  isOwner: boolean;
  acting: boolean;
  error: string | null;
  onLock: () => void;
  onCancel: () => void;
}

function PredictionActive({
  prediction,
  isOwner,
  acting,
  error,
  onLock,
  onCancel,
}: PredictionActiveProps) {
  const { timeDisplay, isExpired } = useCountdownTimer(prediction.endsAt);

  return (
    <div className="prediction-results">
      <div className="prediction-results-header">
        <span className="prediction-results-title">
          <FaMagic size={14} />
          {prediction.title}
        </span>
        <span className="prediction-results-timer">
          {isExpired ? "Locking..." : timeDisplay}
        </span>
      </div>

      <PredictionOutcomeBars prediction={prediction} />

      <div className="prediction-results-meta">
        <span>{prediction.totalUsers} predictors</span>
        <span>{prediction.totalPoints.toLocaleString()} points</span>
      </div>

      {error && <p className="prediction-error">{error}</p>}

      <div className="prediction-actions">
        <button
          type="button"
          className="prediction-btn prediction-btn--secondary"
          onClick={onCancel}
          disabled={acting || !isOwner}
        >
          Cancel
        </button>
        <button
          type="button"
          className="prediction-btn prediction-btn--primary"
          onClick={onLock}
          disabled={acting || !isOwner}
        >
          {acting ? "Locking..." : "Lock prediction"}
        </button>
      </div>
    </div>
  );
}

interface PredictionLockedProps {
  prediction: PredictionState;
  isOwner: boolean;
  acting: boolean;
  error: string | null;
  selectedOutcomeId: string;
  onSelectOutcome: (id: string) => void;
  onResolve: () => void;
  onCancel: () => void;
}

function PredictionLocked({
  prediction,
  isOwner,
  acting,
  error,
  selectedOutcomeId,
  onSelectOutcome,
  onResolve,
  onCancel,
}: PredictionLockedProps) {
  return (
    <div className="prediction-results">
      <div className="prediction-results-header">
        <span className="prediction-results-title">
          <FaMagic size={14} />
          {prediction.title}
        </span>
        <span className="prediction-results-status prediction-results-status--locked">
          Locked
        </span>
      </div>

      <PredictionOutcomeBars prediction={prediction} />

      <fieldset className="prediction-field">
        <legend className="prediction-field-label">Winning outcome</legend>
        <div className="prediction-winner-options">
          {prediction.outcomes.map((outcome) => (
            <label key={outcome.id} className="prediction-winner-option">
              <input
                type="radio"
                name="prediction-winner"
                value={outcome.id}
                checked={selectedOutcomeId === outcome.id}
                onChange={() => onSelectOutcome(outcome.id)}
                disabled={!isOwner}
              />
              <span>{outcome.title}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="prediction-results-meta">
        <span>{prediction.totalUsers} predictors</span>
        <span>{prediction.totalPoints.toLocaleString()} points</span>
      </div>

      {error && <p className="prediction-error">{error}</p>}

      <div className="prediction-actions">
        <button
          type="button"
          className="prediction-btn prediction-btn--secondary"
          onClick={onCancel}
          disabled={acting || !isOwner}
        >
          Cancel
        </button>
        <button
          type="button"
          className="prediction-btn prediction-btn--primary"
          onClick={onResolve}
          disabled={acting || !isOwner || !selectedOutcomeId}
        >
          <FaCheck size={11} />
          {acting ? "Resolving..." : "Resolve"}
        </button>
      </div>
    </div>
  );
}

function PredictionOutcomeBars({
  prediction,
  winningOutcomeId,
}: {
  prediction: PredictionState;
  winningOutcomeId?: string;
}) {
  const { maxPoints } = useMemo(() => {
    return {
      maxPoints: Math.max(
        1,
        ...prediction.outcomes.map((outcome) => outcome.channelPoints),
      ),
    };
  }, [prediction]);

  return (
    <ul className="prediction-outcome-list">
      {prediction.outcomes.map((outcome) => {
        const isWinner = outcome.id === winningOutcomeId;
        const percent =
          prediction.totalPoints > 1
            ? Math.round(
                (outcome.channelPoints / prediction.totalPoints) * 100,
              )
            : 50;
        const width = Math.max(
          4,
          (outcome.channelPoints / maxPoints) * 100,
        );
        return (
          <li
            key={outcome.id}
            className={`prediction-outcome${isWinner ? " prediction-outcome--winner" : ""}`}
          >
            <div
              className="prediction-outcome-bar"
              style={{
                width: `${width}%`,
                background: outcomeColor(outcome.color, isWinner),
              }}
            />
            <span className="prediction-outcome-title">{outcome.title}</span>
            <span className="prediction-outcome-meta">
              {outcome.channelPoints.toLocaleString()} pts · {percent}%
            </span>
            {isWinner && (
              <span className="prediction-outcome-badge">Winner</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
