/**
 * Test-only bridge to the AutoMod parser. Importing the SSE handler directly
 * would pull in Innertube and the live-chat machinery.
 */
export { parseAutoModMessage } from "./youtube-stream-chat";
