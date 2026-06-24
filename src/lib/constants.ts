export const YT_USER_AGENT =
  (typeof process !== "undefined" && process.env?.YT_USER_AGENT) ||
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export const MOD_COMMANDS = [
  {
    name: "/announce",
    description: "Highlight a message with color",
    usage: "/announce <message>",
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
];
