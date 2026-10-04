/**
 * Per-wheel spin history, persisted in localStorage.
 */
export interface WheelHistoryEntry {
  name: string;
  time: string;
}

const STORAGE_KEY = "mixchat_wheel_history:v1";

type HistoryMap = Record<string, WheelHistoryEntry[]>;

function readAll(): HistoryMap {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as HistoryMap) : {};
  } catch {
    return {};
  }
}

function writeAll(map: HistoryMap): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore quota errors — history is a convenience.
  }
}

export function getWheelHistory(wheelId: string): WheelHistoryEntry[] {
  const entries = readAll()[wheelId];
  return Array.isArray(entries) ? entries : [];
}

export function addWheelHistory(
  wheelId: string,
  entry: WheelHistoryEntry,
): WheelHistoryEntry[] {
  const map = readAll();
  const next = [entry, ...(map[wheelId] ?? [])];
  map[wheelId] = next;
  writeAll(map);
  return next;
}

export function clearWheelHistory(wheelId: string): void {
  const map = readAll();
  if (!(wheelId in map)) return;
  delete map[wheelId];
  writeAll(map);
}

export function formatHistoryTime(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const sec = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${min}:${sec} ${dd}/${mm}`;
}
