export const YT_USER_AGENT =
  (typeof process !== "undefined" && process.env?.YT_USER_AGENT) ||
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** When set to "true", disables all Google/YouTube integrations (auth, chat, drive). */
export const IS_TWITCH_ONLY = import.meta.env.PUBLIC_TWITCH_ONLY === "true";

/**
 * App platform that this bundle was built for. The desktop build sets
 * `PUBLIC_APP_PLATFORM=desktop`, which selects public-client OAuth flows
 * (Twitch Device Code Grant, Google PKCE) so no client secrets are shipped.
 * Unset/`web` keeps the hosted site's confidential-client flows unchanged.
 */
export const IS_DESKTOP = import.meta.env.PUBLIC_APP_PLATFORM === "desktop";

/** Twitch OAuth scopes requested by both the web and desktop login flows. */
export const TWITCH_SCOPES =
  "chat:read chat:edit user:read:email user:read:follows user:read:emotes user:read:subscriptions channel:read:redemptions channel:read:hype_train channel:read:polls channel:manage:polls channel:read:predictions channel:manage:predictions bits:read moderator:manage:chat_messages moderator:manage:banned_users moderator:manage:announcements moderator:manage:shoutouts moderator:manage:warnings moderator:manage:automod user:read:moderated_channels user:write:chat channel:manage:broadcast channel:manage:raids moderator:read:followers";

/** Returns a 403 Response for disabled YouTube API endpoints. */
export function twitchOnlyResponse(): Response {
  return new Response(
    JSON.stringify({
      error: "YouTube integrations are disabled on this instance",
    }),
    { status: 403, headers: { "Content-Type": "application/json" } },
  );
}

export const MOD_COMMANDS = [
  {
    name: "/announce",
    description: "Highlight a message with color",
    usage: "/announce <message>",
  },
  {
    name: "/pin",
    description: "Send a message and pin it to chat",
    usage: "/pin <message>",
  },
  {
    name: "/unpin",
    description: "Unpin the currently pinned chat message",
    usage: "/unpin",
  },
  {
    name: "/shoutout",
    description: "Promote another channel",
    usage: "/shoutout <username>",
  },
  { name: "/clear", description: "Clear the chat history", usage: "/clear" },
  {
    name: "/ban",
    description: "Permanently ban a user",
    usage: "/ban <username> [reason]",
  },
  {
    name: "/timeout",
    description: "Temporarily ban a user",
    usage: "/timeout <username> <duration> [reason]",
  },
  { name: "/unban", description: "Unban a user", usage: "/unban <username>" },
  {
    name: "/untimeout",
    description: "Remove a timeout from a user",
    usage: "/untimeout <username>",
  },
  {
    name: "/warn",
    description: "Send a formal warning to a user",
    usage: "/warn <username> <reason>",
  },
  {
    name: "/raid",
    description: "Start a raid to another channel",
    usage: "/raid <username>",
  },
  { name: "/unraid", description: "Cancel the current raid", usage: "/unraid" },
  {
    name: "/createpoll",
    description: "Create a Twitch poll from the stream tools menu",
    usage: "/createpoll",
  },
  {
    name: "/endpoll",
    description: "End the active Twitch poll",
    usage: "/endpoll",
  },
  {
    name: "/createprediction",
    description: "Create a Twitch prediction from the stream tools menu",
    usage: "/createprediction",
  },
  {
    name: "/lockprediction",
    description: "Lock the active Twitch prediction",
    usage: "/lockprediction",
  },
  {
    name: "/cancelprediction",
    description: "Cancel the active Twitch prediction",
    usage: "/cancelprediction",
  },
];
