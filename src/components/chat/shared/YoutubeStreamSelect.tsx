import type { YoutubeLiveCandidate } from "../../../lib/youtubeStreamSelection";

/**
 * Compact picker for a channel running more than one YouTube broadcast at
 * once. Also surfaces a live manual override so it can be cleared from here.
 */
export default function YoutubeStreamSelect({
  videos,
  selectedVideoId,
  onSelect,
}: {
  videos: YoutubeLiveCandidate[];
  selectedVideoId: string | null;
  onSelect: (videoId: string) => void;
}) {
  const manualVideoId =
    selectedVideoId && !videos.some((v) => v.videoId === selectedVideoId)
      ? selectedVideoId
      : null;

  if (videos.length < 2 && !manualVideoId) return null;

  return (
    <select
      className="youtube-stream-select"
      value={selectedVideoId ?? ""}
      onChange={(e) => onSelect(e.target.value)}
      aria-label="YouTube live stream"
      title="Choose YouTube live stream"
    >
      {manualVideoId ? (
        <option value={manualVideoId}>Manual ({manualVideoId})</option>
      ) : null}
      {videos.map((video) => (
        <option key={video.videoId} value={video.videoId}>
          {video.title || video.videoId}
          {video.isVertical ? " (vertical)" : ""}
        </option>
      ))}
    </select>
  );
}
