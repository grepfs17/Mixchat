import type {
  GiveawayEntry,
  GiveawayScope,
  GiveawayEligibility,
} from "./giveaway";

export interface GiveawayHistoryEntry {
  id: string;
  /** ISO timestamp of when the winner was revealed. */
  revealedAt: string;
  /** Keyword viewers had to type. */
  keyword: string;
  /** Winning user. */
  winner: GiveawayEntry;
  /** Number of eligible entries that were collected. */
  entryCount: number;
  /** Duration in seconds the giveaway ran for. */
  durationSeconds: number;
  /** Scope that was active when the winner was picked. */
  scope: GiveawayScope;
  /** Eligibility that was active when the winner was picked. */
  eligibility: GiveawayEligibility;
}

const STORAGE_KEY = "mixchat_giveaway_history:v1";
const MAX_ENTRIES = 50;

function readStorage(): GiveawayHistoryEntry[] {
  if (typeof localStorage === "undefined") return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is GiveawayHistoryEntry =>
        e &&
        typeof e.id === "string" &&
        typeof e.revealedAt === "string" &&
        typeof e.keyword === "string" &&
        e.winner &&
        typeof e.winner.userId === "string",
    );
  } catch {
    return [];
  }
}

function writeStorage(entries: GiveawayHistoryEntry[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage may be full or disabled; ignore so the rest of the app keeps working.
  }
}

export function getGiveawayHistory(): GiveawayHistoryEntry[] {
  return readStorage();
}

export function appendGiveawayHistory(
  entry: Omit<GiveawayHistoryEntry, "id" | "revealedAt">,
): GiveawayHistoryEntry {
  const full: GiveawayHistoryEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    revealedAt: new Date().toISOString(),
  };
  const existing = readStorage();
  const updated = [full, ...existing].slice(0, MAX_ENTRIES);
  writeStorage(updated);
  return full;
}

export function clearGiveawayHistory(): void {
  writeStorage([]);
}
