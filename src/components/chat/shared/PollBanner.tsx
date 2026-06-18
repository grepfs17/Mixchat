import { useEffect, useState, useMemo } from "react";
import { FaTimes, FaPoll } from "react-icons/fa";
import "../../../styles/chat/PollBanner.css";

export interface PollChoice {
  id: string;
  title: string;
  votes: number;
}

export interface PollState {
  id: string;
  title: string;
  choices: PollChoice[];
  totalVotes: number;
  endsAt: Date;
  status?: string;
}

interface PollBannerProps {
  poll: PollState;
  onDismiss: () => void;
}

export default function PollBanner({ poll, onDismiss }: PollBannerProps) {
  const [timeLeft, setTimeLeft] = useState<number>(() => {
    const diff = poll.endsAt.getTime() - Date.now();
    return Math.max(0, Math.floor(diff / 1000));
  });

  const [confirmClose, setConfirmClose] = useState(false);

  const isEnded =
    poll.status === "completed" ||
    poll.status === "archived" ||
    poll.status === "terminated";

  useEffect(() => {
    if (timeLeft <= 0) {
      if (!isEnded) {
        const timer = setTimeout(() => onDismiss(), 5000);
        return () => clearTimeout(timer);
      }
      return;
    }
    const timer = setTimeout(
      () => setTimeLeft((t) => Math.max(0, t - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [timeLeft, onDismiss, isEnded]);

  useEffect(() => {
    if (isEnded) {
      const timer = setTimeout(() => onDismiss(), 8000);
      return () => clearTimeout(timer);
    }
  }, [isEnded, onDismiss]);

  const minutesLeft = Math.floor(timeLeft / 60);
  const secondsLeft = timeLeft % 60;
  const timeDisplay =
    minutesLeft > 0 ? `${minutesLeft}m ${secondsLeft}s` : `${secondsLeft}s`;

  const maxVotes = useMemo(
    () => Math.max(1, ...poll.choices.map((c) => c.votes)),
    [poll.choices],
  );

  const winningId = useMemo(() => {
    if (!isEnded || poll.choices.length === 0) return undefined;
    let max = 0;
    let winner = poll.choices[0].id;
    for (const c of poll.choices) {
      if (c.votes > max) {
        max = c.votes;
        winner = c.id;
      }
    }
    return winner;
  }, [isEnded, poll.choices]);

  const statusLabel = isEnded
    ? poll.status === "archived"
      ? "Archived"
      : poll.status === "terminated"
        ? "Ended Early"
        : "Poll Ended"
    : "Live Poll";

  return (
    <div className="poll-banner" role="alert" aria-live="polite">
      <div className="poll-banner-header">
        <div className="poll-banner-title">
          <span
            className={`poll-banner-badge${isEnded ? " poll-banner-badge--ended" : ""}`}
          >
            {statusLabel}
          </span>
          <FaPoll className="poll-banner-icon" size={14} />
          <span className="poll-banner-question">{poll.title}</span>
        </div>
        <div className="poll-banner-close-wrapper">
          {confirmClose && (
            <span className="poll-banner-close-tooltip">
              Press again to close
            </span>
          )}
          <button
            className="poll-banner-close"
            onClick={() => {
              if (confirmClose) {
                onDismiss();
              } else {
                setConfirmClose(true);
              }
            }}
            onBlur={() => setConfirmClose(false)}
            aria-label="Dismiss poll notification"
          >
            <FaTimes size={14} />
          </button>
        </div>
      </div>

      <div className="poll-banner-choices">
        {poll.choices.map((choice) => {
          const pct =
            poll.totalVotes > 0
              ? Math.round((choice.votes / poll.totalVotes) * 100)
              : 0;
          const barWidth = Math.max(2, (choice.votes / maxVotes) * 100);
          const isWinner = isEnded && choice.id === winningId;

          return (
            <div
              key={choice.id}
              className={`poll-banner-choice${isWinner ? " poll-banner-choice--winner" : ""}`}
            >
              <div className="poll-banner-choice-bar-bg">
                <div
                  className="poll-banner-choice-bar-fill"
                  style={{ width: `${barWidth}%` }}
                />
              </div>
              <div className="poll-banner-choice-content">
                <span className="poll-banner-choice-title">{choice.title}</span>
                <span className="poll-banner-choice-votes">
                  {choice.votes.toLocaleString()}{" "}
                  {choice.votes === 1 ? "vote" : "votes"} · {pct}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="poll-banner-footer">
        <span className="poll-banner-total">
          {poll.totalVotes.toLocaleString()} total votes
        </span>
        {!isEnded && (
          <span className="poll-banner-timer">Ends in {timeDisplay}</span>
        )}
        {isEnded && (
          <span className="poll-banner-timer poll-banner-timer--ended">
            Final results
          </span>
        )}
      </div>
    </div>
  );
}
