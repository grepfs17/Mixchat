/**
 * Short-lived cache of the moderator behind a recent ban or timeout. IRC
 * (CLEARCHAT) and EventSub (`channel.moderate`) report the same action over
 * separate channels with no ordering guarantee, so whichever arrives first
 * can seed the actor for the other.
 */

export type ModerationActorAction = "ban" | "timeout";

const TTL_MS = 30_000;
const recent = new Map<string, { moderator: string; at: number }>();

function keyOf(action: ModerationActorAction, targetLogin: string): string {
  return `${action}:${targetLogin.trim().toLowerCase()}`;
}

function prune(now: number): void {
  for (const [key, entry] of recent) {
    if (now - entry.at > TTL_MS) recent.delete(key);
  }
}

export function rememberModerationActor(
  action: ModerationActorAction,
  targetLogin: string,
  moderator: string,
): void {
  const name = moderator.trim();
  if (!name || !targetLogin.trim()) return;
  const now = Date.now();
  prune(now);
  recent.set(keyOf(action, targetLogin), { moderator: name, at: now });
}

export function recentModerationActor(
  action: ModerationActorAction,
  targetLogin: string,
): string | undefined {
  if (!targetLogin.trim()) return undefined;
  const entry = recent.get(keyOf(action, targetLogin));
  if (!entry) return undefined;
  if (Date.now() - entry.at > TTL_MS) {
    recent.delete(keyOf(action, targetLogin));
    return undefined;
  }
  return entry.moderator;
}

export function __resetModerationActorsForTests(): void {
  recent.clear();
}
