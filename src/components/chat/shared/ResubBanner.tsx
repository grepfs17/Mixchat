import { useState } from "react";
import { FaStar } from "react-icons/fa";
import "../../../styles/chat/ResubBanner.css";
import "../../../styles/chat/BannerShell.css";
import BannerShell from "./BannerShell";
import { MAX_RESUB_MESSAGE_LENGTH } from "../../../lib/constants";
import type { TwitchResubNotification } from "../../../lib/twitchResub";

interface ResubBannerProps {
  notification: TwitchResubNotification;
  channel: string;
  sharing: boolean;
  error: string | null;
  onShare: (message: string, includeStreak: boolean) => void;
  onDismiss: () => void;
}

function monthsLabel(months: number): string {
  const count = Number.isFinite(months) && months > 0 ? Math.floor(months) : 1;
  return `${count} ${count === 1 ? "month" : "months"}`;
}

/**
 * Prompts the viewer to attach a message to their subscription renewal, the
 * same flow as Twitch's first-party "Share" callout in chat.
 */
export default function ResubBanner({
  notification,
  channel,
  sharing,
  error,
  onShare,
  onDismiss,
}: ResubBannerProps) {
  const [message, setMessage] = useState("");
  const [includeStreak, setIncludeStreak] = useState(true);
  const streakMonths = notification.streakTenureMonths;
  const showStreak = Number.isFinite(streakMonths) && streakMonths > 0;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (sharing) return;
    onShare(message, showStreak && includeStreak);
  };

  return (
    <BannerShell
      tone="resub"
      ariaLive="polite"
      closeAriaLabel="Dismiss resub message"
      badge={<span className="resub-banner-badge">RESUB</span>}
      icon={<FaStar className="resub-banner-icon" size={12} />}
      title={
        <span className="resub-banner-title">Share your resub message</span>
      }
      onDismiss={onDismiss}
      footer={
        <>
          <span className="resub-banner-count" aria-live="polite">
            {message.length}/{MAX_RESUB_MESSAGE_LENGTH}
          </span>
          <button
            type="submit"
            form="resub-banner-form"
            className="resub-banner-share"
            disabled={sharing}
          >
            {sharing ? "Sharing..." : "Share"}
          </button>
        </>
      }
    >
      <form id="resub-banner-form" onSubmit={handleSubmit}>
        <p className="resub-banner-lead">
          You have been subscribed to {channel} for{" "}
          {monthsLabel(notification.cumulativeTenureMonths)}. Let chat know
          what keeps you here.
        </p>
        <label className="resub-banner-label" htmlFor="resub-banner-message">
          Message
        </label>
        <textarea
          id="resub-banner-message"
          className="resub-banner-input"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          maxLength={MAX_RESUB_MESSAGE_LENGTH}
          rows={2}
          placeholder="Say something to the streamer and chat..."
          disabled={sharing}
        />
        {showStreak && (
          <label className="resub-banner-streak">
            <input
              type="checkbox"
              checked={includeStreak}
              onChange={(event) => setIncludeStreak(event.target.checked)}
              disabled={sharing}
            />
            Include my {monthsLabel(streakMonths)} streak
          </label>
        )}
        {error && (
          <p className="resub-banner-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </BannerShell>
  );
}
