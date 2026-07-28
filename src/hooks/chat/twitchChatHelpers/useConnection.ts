import { useState, useEffect, useRef } from "react";
import { StaticAuthProvider } from "@twurple/auth";
import { ChatClient, UserState } from "@twurple/chat";
import { parseBadgeString } from "../../../lib/twitchChatMessages";
import { preCacheRewards } from "../../../lib/twitchChatCache";

interface UseTwitchChatConnectionOptions {
  channelName: string;
  accessToken: string;
  enabled: boolean;
  onOwnBadgesLoadedRef: React.RefObject<
    | ((
        badges: Record<string, string>,
        badgeDetails: Record<string, { url: string; title: string }>,
      ) => void)
    | undefined
  >;
  accessTokenRef: React.RefObject<string>;
}

export interface TwitchChatConnection {
  client: ChatClient | null;
  isConnected: boolean;
  slowModeWaitTime: number | null;
  followerModeMinutes: number | null;
  broadcasterIdRef: React.RefObject<string | null>;
  broadcasterIdResolveRef: React.RefObject<((id: string) => void) | null>;
  broadcasterIdPromiseRef: React.RefObject<Promise<string>>;
}

export function useTwitchChatConnection({
  channelName,
  accessToken,
  enabled,
  onOwnBadgesLoadedRef,
  accessTokenRef,
}: UseTwitchChatConnectionOptions): TwitchChatConnection {
  const [isConnected, setIsConnected] = useState(false);
  const [client, setClient] = useState<ChatClient | null>(null);
  const [slowModeWaitTime, setSlowModeWaitTime] = useState<number | null>(null);
  const [followerModeMinutes, setFollowerModeMinutes] = useState<number | null>(
    null,
  );

  const broadcasterIdRef = useRef<string | null>(null);

  // Build the broadcasterId promise once via useState's lazy initializer — the
  // only React-idiomatic place to create a promise during render without
  // triggering the "ref mutated during render" smell. The resolve callback is
  // captured so the connect-effect loop can settle it once the broadcaster id
  // resolves. The ref-like shape is preserved so the existing
  // `RefObject<Promise<string>>` return interface is unchanged.
  const [broadcasterIdPromise] = useState<{
    promise: Promise<string>;
    resolve: (id: string) => void;
  }>(() => {
    let resolveFn!: (id: string) => void;
    const promise = new Promise<string>((resolve) => {
      resolveFn = resolve;
    });
    return { promise, resolve: resolveFn };
  });
  const broadcasterIdPromiseRef = useRef<Promise<string>>(
    broadcasterIdPromise.promise,
  );
  const broadcasterIdResolveRef = useRef<((id: string) => void) | null>(
    broadcasterIdPromise.resolve,
  );

  const clientId = import.meta.env.PUBLIC_TWITCH_CLIENT_ID;

  useEffect(() => {
    if (!enabled) return;
    if (!channelName || !accessToken || !clientId) {
      if (enabled && !clientId) {
        console.error(
          "Twitch Client ID is missing (PUBLIC_TWITCH_CLIENT_ID env var)",
        );
      }
      return;
    }

    let active = true;

    const authProvider = new StaticAuthProvider(clientId, accessToken);

    const newClient = new ChatClient({
      authProvider,
      channels: [channelName],
    });

    newClient.onConnect(() => {
      if (!active) return;
      console.log(`Connected to ${channelName}`);
      setIsConnected(true);

      (async () => {
        try {
          const usersRes = await fetch(
            `/api/twitch-proxy?path=/helix/users&login=${encodeURIComponent(channelName)}`,
          );
          if (!usersRes.ok) return;
          const usersData = await usersRes.json();
          const broadcasterId: string | undefined = usersData?.data?.[0]?.id;
          if (!broadcasterId) return;
          if (active) {
            broadcasterIdRef.current = broadcasterId;
            broadcasterIdResolveRef.current?.(broadcasterId);
          }

          const settingsRes = await fetch(
            `/api/twitch-proxy?path=/helix/chat/settings&broadcaster_id=${broadcasterId}`,
          );
          if (!settingsRes.ok) return;
          const settingsData = await settingsRes.json();
          console.log("[useTwitchChat] chat settings response:", settingsData);
          const slowMode: boolean = settingsData?.data?.[0]?.slow_mode ?? false;
          const waitTime: number | null = slowMode
            ? (settingsData?.data?.[0]?.slow_mode_wait_time ?? 30)
            : null;
          console.log(
            `[useTwitchChat] slow_mode=${slowMode}, slow_mode_wait_time=${waitTime} for channel "${channelName}"`,
          );
          const followerMode: boolean =
            settingsData?.data?.[0]?.follower_mode ?? false;
          const followerMinutes: number | null = followerMode
            ? (settingsData?.data?.[0]?.follower_mode_duration ?? 0)
            : null;
          console.log(
            `[useTwitchChat] follower_mode=${followerMode}, follower_mode_duration=${followerMinutes} for channel "${channelName}"`,
          );
          if (active) {
            setSlowModeWaitTime(waitTime);
            setFollowerModeMinutes(followerMinutes);
          }

          await preCacheRewards(
            broadcasterId,
            accessTokenRef.current,
            channelName,
          );
        } catch {
          // Non-fatal
        }
      })();
    });

    newClient.onDisconnect(() => {
      if (!active) return;
      console.log("Disconnected from Twitch chat");
      setIsConnected(false);
    });

    newClient.irc.onTypedMessage(UserState, (msg) => {
      if (!active || !onOwnBadgesLoadedRef.current) return;
      const { badges, badgeDetails } = parseBadgeString(
        msg.tags.get("badges") || "",
      );
      onOwnBadgesLoadedRef.current(badges, badgeDetails);
    });

    newClient.connect();

    setClient(newClient);

    return () => {
      active = false;
      if (newClient) {
        newClient.quit();
      }
    };    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [channelName, enabled, clientId]);

  return {
    client,
    isConnected,
    slowModeWaitTime,
    followerModeMinutes,
    broadcasterIdRef,
    broadcasterIdResolveRef,
    broadcasterIdPromiseRef,
  };
}
