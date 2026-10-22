/**
 * Test-only bridge that re-exports the moderator-removal, host-handoff,
 * and session-scoped dedupe helpers from the youtube-stream-chat SSE
 * handler. Importing the handler directly would pull in Innertube and
 * the live SSE machinery. This lets us unit-test the synthetic
 * system-message generators in isolation.
 */
export {
  createSystemRemovalMessage,
  parseHostHandoffBanner,
  shouldEmitSystemNote,
} from "./youtube-stream-chat";
