import { useEffect, useMemo } from "react";
import { FaPoll } from "react-icons/fa";
import "../../../styles/chat/PollBanner.css";
import "../../../styles/chat/BannerShell.css";
import BannerShell from "./BannerShell";
import { useCountdownTimer } from "../../../hooks/ui/useCountdownTimer";
import type { PollChoice, PollState } from "./bannerTypes";

export type { PollState };

interface PollBannerProps {
  poll: PollState;
  onDismiss: () => void;
}

const ENDED_STATUSES = new Set(["completed", "archived", "terminated"]);

/**
 * Display-mode poll banner. Renders choices with vote bars; once a
 * choice wins (status flips to completed/archived/terminated), it gets
 * a green ring. Self-dismisses 5s after the timer expires (when the
 * poll is still active) or 8s after the status flips to ended.
 */
export default function PollBanner({ poll, onDismiss }: PollBannerProps) {
  const isEnded = poll.status !== undefined && ENDED_STATUSES.has(poll.status);

  const { timeDisplay } = useCountdownTimer(poll.endsAt, {
    // Linger 5s after the timer hits zero (only while still active).
    // When the status flips to ended, the useEffect below takes over
    // and sets the longer 8s linger.
    autoDismissAfter: isEnded ? undefined : 5000,
    onAutoDismiss: isEnded ? undefined : onDismiss,
  });

  // Independent 8s auto-dismiss once the poll ends.
  useEffect(() => {
    if (!isEnded) return;
    const timer = setTimeout(onDismiss, 8000);
    return () => clearTimeout(timer);
  }, [isEnded, onDismiss]);

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
    <BannerShell
      tone="poll"
      ariaLive="polite"
      closeAriaLabel="Dismiss poll notification"
      badge={
        <span
          className={`poll-banner-badge${isEnded ? " poll-banner-badge--ended" : ""}`}
        >
          {statusLabel}
        </span>
      }
      icon={<FaPoll className="poll-banner-icon" size={14} />}
      title={<span className="poll-banner-question">{poll.title}</span>}
      onDismiss={onDismiss}
      footer={
        <>
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
        </>
      }
    >
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
    </BannerShell>
  );
}
