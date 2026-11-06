import { useCallback, useEffect, useState } from "react";

export interface StreamToolsSettings {
  enabled: boolean;
  allowMods: boolean;
}

const DEFAULT_SETTINGS: StreamToolsSettings = {
  enabled: true,
  allowMods: false,
};

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
      setSettings({
        enabled: Boolean(next.enabled),
        allowMods: Boolean(next.allowMods),
      });
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
      setSettings({
        enabled: Boolean(next.enabled),
        allowMods: Boolean(next.allowMods),
      });
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
