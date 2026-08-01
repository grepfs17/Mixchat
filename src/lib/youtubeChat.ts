/**
 * Send a chat message to a YouTube live stream via the server-side endpoint.
 * Throws with the server error message on failure.
 *
 * This function is client-safe (browser fetch only, no Node.js dependencies).
 * It lives in its own file separate from youtube.ts to avoid bundling
 * server-only libraries (Innertube/youtubei.js) into the client bundle.
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
