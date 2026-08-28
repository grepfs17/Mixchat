interface ScrollToBottomButtonProps {
  count: number;
  onClick: () => void;
}

export default function ScrollToBottomButton({
  count,
  onClick,
}: ScrollToBottomButtonProps) {
  const countLabel =
    count > 0 ? `${count} new ${count === 1 ? "message" : "messages"}` : "No new messages";

  return (
    <button type="button" className="chat-paused-button" onClick={onClick}>
      <span className="chat-paused-icon">
        <svg
          className="chat-paused-icon--pause"
          viewBox="0 0 16 16"
          width="12"
          height="12"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="4" height="10" rx="1" fill="currentColor" />
          <rect x="9" y="3" width="4" height="10" rx="1" fill="currentColor" />
        </svg>
        <svg
          className="chat-paused-icon--play"
          viewBox="0 0 16 16"
          width="12"
          height="12"
          aria-hidden="true"
        >
          <polygon points="5,3 13,8 5,13" fill="currentColor" />
        </svg>
      </span>
      <span className="chat-paused-button-label" aria-hidden="false">
        <span className="chat-paused-button-text chat-paused-button-text--default">
          Chat paused due to scroll
        </span>
        <span className="chat-paused-button-text chat-paused-button-text--count">
          {countLabel}
        </span>
      </span>
    </button>
  );
}