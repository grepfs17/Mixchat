interface ScrollToBottomButtonProps {
  count: number;
  onClick: () => void;
}

export default function ScrollToBottomButton({
  count,
  onClick,
}: ScrollToBottomButtonProps) {
  return (
    <button type="button"
      className="go-to-bottom-button"
      title="Go to latest messages"
      onClick={onClick}
    >
      {count > 0 ? `New Messages (${count})` : "New Messages"}
    </button>
  );
}
