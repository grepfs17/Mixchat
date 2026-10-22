/**
 * Sends a chat message via the server-side endpoint, throwing with the server
 * error message on failure.
 *
 * Kept separate from youtube.ts so server-only Innertube/youtubei.js deps do
 * not leak into the client bundle (this function only uses browser fetch).
 */
export async function sendYouTubeChatMessage(
  videoId: string,
  message: string,
): Promise<void> {
  const res = await fetch("/api/youtube-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoId, message }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to send YouTube message");
  }
}
