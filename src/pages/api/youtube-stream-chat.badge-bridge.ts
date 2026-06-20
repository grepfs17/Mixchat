/**
 * Test-only bridge that re-exports the badge parsing helpers from the
 * youtube-stream-chat SSE handler. Importing the handler directly would
 * pull in Innertube and SSE machinery; this lets us unit-test the
 * parsers in isolation.
 */
export {
  parseBadges,
  isAuthorModerator,
  isAuthorOwner,
} from "./youtube-stream-chat";
