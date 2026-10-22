/**
 * Test-only bridge that re-exports the badge parsing helpers from the
 * youtube-stream-chat SSE handler. Importing the handler directly would
 * pull in Innertube and SSE machinery. This lets us unit-test the
 * parsers in isolation.
 */
export {
  parseBadges,
  isAuthorModerator,
  isAuthorOwner,
  getMembershipLabel,
} from "./youtube-stream-chat";
