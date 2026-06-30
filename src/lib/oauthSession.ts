export type AuthPlatform = "twitch" | "youtube";

export function listenForOAuthSession(
  platform: AuthPlatform,
  popup: Window | null,
  onSession: (session: unknown) => void,
  onComplete: () => void,
): () => void {
  const onMessage = (ev: MessageEvent) => {
    try {
      if (ev.origin !== window.location.origin) return;
      const data = ev.data as
        { type?: string; session?: { platform?: string } } | undefined;
      if (
        data &&
        data.type === "mixchat_session" &&
        data.session &&
        data.session.platform === platform
      ) {
        onSession(data.session);
        onComplete();
        if (popup && !popup.closed) popup.close();
        window.removeEventListener("message", onMessage);
      }
    } catch (e) {
      console.error(`Failed to process ${platform} auth message`, e);
    }
  };
  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}
