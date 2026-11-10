import { useCallback, useEffect, useState } from "react";

export interface ChannelModerator {
  userId: string;
  /** Lowercased Twitch login. */
  login: string;
  displayName: string;
}

type ModsStatus = "idle" | "loading" | "ready" | "error";

export interface ChannelModeratorsResult {
  mods: ChannelModerator[];
  loading: boolean;
  /**
   * True once a fetch attempt has finished, successfully or not. Callers use
   * it to tell "nothing loaded yet" apart from "there is nothing to show".
   */
  settled: boolean;
  error: string | null;
  /**
   * True when Twitch rejected the call for a missing OAuth scope. The session
   * has to be refreshed before the list can be loaded.
   */
  needsReauth: boolean;
  reload: () => void;
}

/** Safety cap on Helix pagination; each page holds up to 100 moderators. */
const MAX_PAGES = 10;

/** The Twitch login behind a `twitch:<login>` channel key, if any. */
function twitchLoginOf(channelKey: string | null): string | null {
  if (!channelKey?.startsWith("twitch:")) return null;
  return channelKey.slice("twitch:".length);
}

async function readTwitchError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; error?: string };
    return body?.message || body?.error || `Twitch API error (${res.status})`;
  } catch {
    return `Twitch API error (${res.status})`;
  }
}

/**
 * Lists the Twitch moderators of a channel through the server-side Helix
 * proxy. Requires the `moderation:read` scope, so an older session reports
 * `needsReauth` instead of an empty list.
 */
export function useChannelModerators(
  channelKey: string | null,
  enabled: boolean,
): ChannelModeratorsResult {
  const [mods, setMods] = useState<ChannelModerator[]>([]);
  const [status, setStatus] = useState<ModsStatus>(() =>
    enabled && twitchLoginOf(channelKey) ? "loading" : "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    const twitchLogin = enabled ? twitchLoginOf(channelKey) : null;
    if (!twitchLogin) {
      setMods([]);
      setStatus("idle");
      setError(null);
      setNeedsReauth(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      setStatus("loading");
      setError(null);
      setNeedsReauth(false);
      const failWithReauth = () => {
        if (cancelled) return;
        setNeedsReauth(true);
        setStatus("error");
      };
      try {
        const userRes = await fetch(
          `/api/twitch-proxy?path=/helix/users&login=${encodeURIComponent(twitchLogin)}`,
        );
        if (!userRes.ok) {
          const message = await readTwitchError(userRes);
          if (userRes.status === 403 && /scope/i.test(message)) {
            failWithReauth();
            return;
          }
          throw new Error(message);
        }
        const userData = (await userRes.json()) as {
          data?: Array<{ id?: string }>;
        };
        const broadcasterId = userData?.data?.[0]?.id;
        if (!broadcasterId) throw new Error("Channel not found on Twitch");

        const collected: ChannelModerator[] = [];
        let after: string | undefined;
        for (let page = 0; page < MAX_PAGES; page++) {
          const params = new URLSearchParams({
            path: "/helix/moderation/moderators",
            broadcaster_id: broadcasterId,
            first: "100",
          });
          if (after) params.set("after", after);
          const res = await fetch(`/api/twitch-proxy?${params.toString()}`);
          if (!res.ok) {
            const message = await readTwitchError(res);
            if (res.status === 403 && /scope/i.test(message)) {
              failWithReauth();
              return;
            }
            throw new Error(message);
          }
          const body = (await res.json()) as {
            data?: Array<{
              user_id?: string;
              user_login?: string;
              user_name?: string;
            }>;
            pagination?: { cursor?: string };
          };
          for (const entry of body?.data ?? []) {
            if (!entry.user_id || !entry.user_login) continue;
            collected.push({
              userId: entry.user_id,
              login: entry.user_login.toLowerCase(),
              displayName: entry.user_name || entry.user_login,
            });
          }
          after = body?.pagination?.cursor;
          if (!after) break;
        }
        if (cancelled) return;
        setMods(collected);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Failed to load moderators",
        );
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [channelKey, enabled, reloadKey]);

  const canLoad = enabled && twitchLoginOf(channelKey) !== null;
  return {
    mods,
    // `idle && canLoad` covers the frame between enabling and the effect
    // starting, so the picker never renders an empty list first.
    loading: status === "loading" || (status === "idle" && canLoad),
    settled: status === "ready" || status === "error",
    error,
    needsReauth,
    reload,
  };
}
