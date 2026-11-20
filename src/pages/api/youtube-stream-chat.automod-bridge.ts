/**
 * Test-only bridge to the YouTube chat helpers. Importing the SSE handler
 * directly would pull in Innertube and the live-chat machinery.
 */
export { applyLiveChatFilter, parseAutoModMessage } from "./youtube-stream-chat";
