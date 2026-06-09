/**
 * Current user's Twitch IDs, set by useChatAppState on mount.
 * Used by AutomodActions to call Twitch API without prop drilling.
 */
let _moderatorId = "";
let _broadcasterId = "";

export function setAutomodIds(moderatorId: string, broadcasterId: string) {
  _moderatorId = moderatorId;
  _broadcasterId = broadcasterId;
}

export function getAutomodIds() {
  return { moderatorId: _moderatorId, broadcasterId: _broadcasterId };
}
