import { createHash, randomBytes } from "node:crypto";

/**
 * Short-lived handoff records for desktop Google OAuth.
 *
 * In the Tauri shell the provider opens in the user's system browser, which has
 * a separate cookie jar. The callback therefore cannot post the session back to
 * the app window. Instead the server keeps the token exchange result here and
 * the app polls for it. The poll response sets the auth cookies in the app's
 * own cookie jar.
 */

export type GoogleHandoffFlow = "youtube" | "drive";

export interface GoogleHandoffSession {
  platform: "youtube";
  userId: string;
  displayName: string;
  profileImageUrl?: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  timestamp: number;
}

export interface GoogleHandoffResult {
  flow: GoogleHandoffFlow;
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  session?: GoogleHandoffSession;
}

export interface GoogleHandoff {
  id: string;
  state: string;
  flow: GoogleHandoffFlow;
  codeVerifier: string;
  createdAt: number;
  result: GoogleHandoffResult | null;
  error: string | null;
}

export type GoogleHandoffPollResult =
  | { status: "pending" }
  | { status: "complete"; result: GoogleHandoffResult }
  | { status: "error"; message: string }
  | { status: "expired" };

const TTL_MS = 10 * 60 * 1000;
const MAX_PENDING = 20;

const handoffs = new Map<string, GoogleHandoff>();

function prune(now: number): void {
  for (const [id, handoff] of handoffs) {
    if (now - handoff.createdAt > TTL_MS) handoffs.delete(id);
  }
  while (handoffs.size > MAX_PENDING) {
    const oldest = handoffs.keys().next().value;
    if (!oldest) break;
    handoffs.delete(oldest);
  }
}

export function createHandoff(
  flow: GoogleHandoffFlow,
  now = Date.now(),
): { id: string; state: string; codeChallenge: string; flow: GoogleHandoffFlow } {
  prune(now);
  const id = randomBytes(24).toString("hex");
  const state = randomBytes(24).toString("hex");
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  handoffs.set(id, {
    id,
    state,
    flow,
    codeVerifier,
    createdAt: now,
    result: null,
    error: null,
  });

  return { id, state, codeChallenge, flow };
}

export function findByState(
  state: string,
  now = Date.now(),
): GoogleHandoff | null {
  prune(now);
  for (const handoff of handoffs.values()) {
    if (handoff.state === state) return handoff;
  }
  return null;
}

export function completeHandoff(
  id: string,
  result: GoogleHandoffResult,
): boolean {
  const handoff = handoffs.get(id);
  if (!handoff) return false;
  handoff.result = result;
  return true;
}

export function failHandoff(id: string, message: string): boolean {
  const handoff = handoffs.get(id);
  if (!handoff) return false;
  handoff.error = message;
  return true;
}

export function takeResult(id: string, now = Date.now()): GoogleHandoffPollResult {
  prune(now);
  const handoff = handoffs.get(id);
  if (!handoff) return { status: "expired" };
  if (handoff.error) {
    const message = handoff.error;
    handoffs.delete(id);
    return { status: "error", message };
  }
  if (!handoff.result) return { status: "pending" };
  // A handoff is single use, so the cookies are set exactly once.
  handoffs.delete(id);
  return { status: "complete", result: handoff.result };
}

/** Test helper. Production code never needs to clear the store. */
export function resetGoogleHandoffsForTests(): void {
  handoffs.clear();
}
