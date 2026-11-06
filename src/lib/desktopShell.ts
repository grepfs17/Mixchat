export type DesktopShell = "tauri" | "electron";

const SHELL_STORAGE_KEY = "mixchat_desktop_shell:v1";

declare global {
  interface Window {
    /** Set by the desktop shell during webview initialization. */
    __MIXCHAT_SHELL__?: string;
  }
}

function normalizeShell(
  value: string | null | undefined,
): DesktopShell | null {
  return value === "tauri" || value === "electron" ? value : null;
}

export function getDesktopShell(): DesktopShell | null {
  if (typeof window === "undefined") return null;

  const injected = normalizeShell(window.__MIXCHAT_SHELL__);
  if (injected) {
    try {
      sessionStorage.setItem(SHELL_STORAGE_KEY, injected);
    } catch {
      /* storage may be unavailable */
    }
    return injected;
  }

  // The shell appends this query parameter. It is the reliable marker when
  // initialization scripts do not run on the loopback URL.
  const fromQuery = normalizeShell(
    new URLSearchParams(window.location.search).get("mixchat-shell"),
  );
  if (fromQuery) {
    try {
      sessionStorage.setItem(SHELL_STORAGE_KEY, fromQuery);
    } catch {
      /* storage may be unavailable */
    }
    return fromQuery;
  }

  try {
    return normalizeShell(sessionStorage.getItem(SHELL_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function isTauriShell(): boolean {
  return getDesktopShell() === "tauri";
}

/**
 * Opens a URL in the system browser. Desktop builds go through the local server
 * so the webview never navigates or reloads. Returns false when the request
 * failed.
 */
export async function openExternalUrl(url: string): Promise<boolean> {
  if (getDesktopShell()) {
    try {
      const response = await fetch("/api/desktop/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (response.ok) return true;
    } catch (error) {
      console.error(
        "Failed to open external URL through the desktop server",
        error,
      );
    }
  }

  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

/**
 * Opens Twitch's device activation page. Tauri keeps it in an app webview so
 * the same login stores Twitch cookies for the embedded player.
 */
export function openTwitchActivation(activationUrl: string): void {
  if (isTauriShell()) {
    window.open(
      `/desktop/twitch-activate?url=${encodeURIComponent(activationUrl)}`,
      "_blank",
      "noopener,noreferrer",
    );
    return;
  }
  window.open(activationUrl, "_blank", "noopener,noreferrer");
}
