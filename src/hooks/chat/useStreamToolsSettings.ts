import { useCallback, useEffect, useState } from "react";

export type StreamToolsModAccess = "all" | "selected";

/**
 * One moderator grant. Mirrors `AllowedMod` in `src/server/streamToolsSettings.ts`
 * (the client cannot import server modules). The id is what access checks
 * match on; the login is only for display.
 */
export interface AllowedMod {
  id: string;
  login: string;
}

export interface StreamToolsSettings {
  enabled: boolean;
  allowMods: boolean;
  modAccess: StreamToolsModAccess;
  /** Grants, only used when `modAccess` is `selected`. */
  allowedMods: AllowedMod[];
}

const DEFAULT_SETTINGS: StreamToolsSettings = {
  enabled: true,
  allowMods: false,
  modAccess: "all",
  allowedMods: [],
};

function normalizeAllowedMods(value: unknown): AllowedMod[] {
  if (!Array.isArray(value)) return [];
  const mods: AllowedMod[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    mods.push({
      id,
      login: typeof raw.login === "string" ? raw.login.trim().toLowerCase() : "",
    });
  }
  return mods;
}

function normalizeSettings(next: {
  enabled?: unknown;
  allowMods?: unknown;
  modAccess?: unknown;
  allowedMods?: unknown;
}): StreamToolsSettings {
  return {
    enabled: Boolean(next.enabled),
    allowMods: Boolean(next.allowMods),
    modAccess: next.modAccess === "selected" ? "selected" : "all",
    allowedMods: normalizeAllowedMods(next.allowedMods),
  };
}

async function parseError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body?.error || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Server-backed Stream tools access settings for the current channel.
 *
 * The broadcaster reads and writes these settings. Moderators only read them
 * and use the value to decide whether the tools should be visible.
 */
export function useStreamToolsSettings(channelKey: string | null) {
  const [settings, setSettings] = useState<StreamToolsSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!channelKey) {
      setSettings(null);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ channelKey });
      const res = await fetch(
        `/api/stream-tools/settings?${params.toString()}`,
      );
      if (!res.ok) {
        throw new Error(
          await parseError(res, "Failed to load Stream tools settings"),
        );
      }
      const next = (await res.json()) as StreamToolsSettings;
      setSettings(normalizeSettings(next));
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load Stream tools settings",
      );
    } finally {
      setLoading(false);
    }
  }, [channelKey]);

  useEffect(() => {
    void refresh();
    if (!channelKey) return;
    const timer = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void refresh();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [channelKey, refresh]);

  const update = useCallback(
    async (patch: Partial<StreamToolsSettings>) => {
      if (!channelKey) return;
      const res = await fetch("/api/stream-tools/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelKey, ...patch }),
      });
      if (!res.ok) {
        throw new Error(
          await parseError(res, "Failed to update Stream tools settings"),
        );
      }
      const next = (await res.json()) as StreamToolsSettings;
      setSettings(normalizeSettings(next));
      setError(null);
    },
    [channelKey],
  );

  return {
    settings: settings ?? DEFAULT_SETTINGS,
    loaded: settings !== null,
    loading,
    error,
    refresh,
    update,
  };
}
