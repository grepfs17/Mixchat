import { useState, useEffect, useRef } from "react";
import { ChatClient } from "@twurple/chat";
import { preCacheRewards } from "../../../lib/twitchChatCache";

interface UseTwitchChatConnectionOptions {
  channelName: string;
  enabled: boolean;
  accessTokenRef: React.RefObject<string>;
}

export interface TwitchChatConnection {
  client: ChatClient | null;
  isConnected: boolean;
  slowModeWaitTime: number | null;
  followerModeMinutes: number | null;
  broadcasterIdRef: React.RefObject<string | null>;
}

export function useTwitchChatConnection({
  channelName,
  enabled,
  accessTokenRef,
}: UseTwitchChatConnectionOptions): TwitchChatConnection {
  const [isConnected, setIsConnected] = useState(false);
  const [client, setClient] = useState<ChatClient | null>(null);
  const [slowModeWaitTime, setSlowModeWaitTime] = useState<number | null>(null);
  const [followerModeMinutes, setFollowerModeMinutes] = useState<number | null>(
    null,
  );

  const broadcasterIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!channelName) return;

    let active = true;

    // Anonymous read-only connection. Without an `authProvider`, twurple
    // connects as a `justinfan` nick and never calls
    // `id.twitch.tv/oauth2/validate` — which is CORS-blocked in the browser —
    // so chat reads work from any origin. Sending is handled via Helix.
    const newClient = new ChatClient({
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

    newClient.connect();

    setClient(newClient);

    return () => {
      active = false;
      newClient.quit();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, enabled]);

  return {
    client,
    isConnected,
    slowModeWaitTime,
    followerModeMinutes,
    broadcasterIdRef,
  };
}
