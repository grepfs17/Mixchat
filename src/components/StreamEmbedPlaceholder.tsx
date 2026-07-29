interface StreamEmbedPlaceholderProps {
  thumbnailUrl: string;
  fading: boolean;
  showSpinner?: boolean;
}

export default function StreamEmbedPlaceholder({
  thumbnailUrl,
  fading,
  showSpinner = true,
}: StreamEmbedPlaceholderProps) {
  return (
    <div
      className={`stream-embed-placeholder${fading ? " stream-embed-placeholder--fading" : ""}`}
    >
      <img
        src={thumbnailUrl}
        alt=""
        className="stream-embed-placeholder__img"
      />
      <div className="stream-embed-placeholder__glass" />
      {showSpinner && (
        <div className="stream-embed-placeholder__spinner">
          <div className="stream-embed-placeholder__spinner-ring" />
        </div>
      )}
    </div>
  );
}
