interface ChatEmptyStateProps {
  title: string;
  detail?: string;
  busy?: boolean;
}

export default function ChatEmptyState({
  title,
  detail,
  busy = false,
}: ChatEmptyStateProps) {
  return (
    <div
      className={`no-messages${busy ? " no-messages--status" : ""}`}
      role={busy ? "status" : undefined}
      aria-live={busy ? "polite" : undefined}
    >
      {busy && <span className="no-messages-spinner" aria-hidden="true" />}
      <p>{title}</p>
      {detail && <p className="no-messages-detail">{detail}</p>}
    </div>
  );
}
