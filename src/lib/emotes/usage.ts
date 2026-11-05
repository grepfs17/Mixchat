export const EMOTE_USAGE_KEY = "emote_usage:v1";

/** Keep the store small. Only the most used emotes are retained. */
const MAX_TRACKED_EMOTES = 200;

export function getEmoteUsage(): Record<string, number> {
  try {
    const raw = localStorage.getItem(EMOTE_USAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const usage: Record<string, number> = {};
    for (const [name, count] of Object.entries(parsed)) {
      if (typeof count === "number" && Number.isFinite(count) && count > 0) {
        usage[name] = count;
      }
    }
    return usage;
  } catch {
    return {};
  }
}

export function recordEmoteUsages(names: string[]): void {
  if (names.length === 0) return;
  try {
    const usage = getEmoteUsage();
    for (const name of names) {
      usage[name] = (usage[name] ?? 0) + 1;
    }
    const top = Object.entries(usage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_TRACKED_EMOTES);
    localStorage.setItem(EMOTE_USAGE_KEY, JSON.stringify(Object.fromEntries(top)));
  } catch (e) {
    console.warn("Failed to record emote usage", e);
  }
}
