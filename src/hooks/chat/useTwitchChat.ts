import { useEffect, useRef } from "react";
import type { TwitchMessage } from "../../lib/types";
import type { MentionSoundType } from "../../lib/twitchChatAudio";
import {
  useTwitchChatConnection,
  useTwitchChatMessageHandler,
  useTwitchChatEventHandlers,
  useTwitchChat7TV,
  useTwitchChatSend,
} from "./twitchChatHelpers";

// Re-export so existing imports keep working
export type { MentionSoundType } from "../../lib/twitchChatAudio";
export {
  MENTION_SOUND_OPTIONS,
  primeAudioContext,
  playMentionSoundPreview,
} from "../../lib/twitchChatAudio";

export function useTwitchChat(
  channelName: string,
  accessToken: string,
  username: string,
  onMessage: (message: TwitchMessage) => void,
  enabled: boolean = true,
  mentionSoundEnabled: boolean = true,
  mentionVolume: number = 0.5,
  mentionSoundType: MentionSoundType = "ding",
  eventSounds: Record<string, string> = {},
  eventSoundVolume: number = 1,
  onOwnBadgesLoaded?: (
    badges: Record<string, string>,
    badgeDetails: Record<string, { url: string; title: string }>,
  ) => void,
  onMessageDeleted?: (messageId: string) => void,
  userId: string = "",
  broadcasterId: string = "",
  onUserMessagesDeleted?: (userId: string, userName?: string) => void,
) {
  // Refs for stale-closure-safe access inside IRC handlers
  const mentionSoundEnabledRef = useRef(mentionSoundEnabled);
  const mentionVolumeRef = useRef(mentionVolume);
  const mentionSoundTypeRef = useRef(mentionSoundType);
  const eventSoundsRef = useRef(eventSounds);
  const eventSoundVolumeRef = useRef(eventSoundVolume);
  const onMessageDeletedRef = useRef(onMessageDeleted);
  const onUserMessagesDeletedRef = useRef(onUserMessagesDeleted);
  const accessTokenRef = useRef(accessToken);
  const usernameRef = useRef(username);
  const onMessageRef = useRef(onMessage);
  const onOwnBadgesLoadedRef = useRef(onOwnBadgesLoaded);

  useEffect(() => {
    mentionSoundEnabledRef.current = mentionSoundEnabled;
  }, [mentionSoundEnabled]);
  useEffect(() => {
    mentionVolumeRef.current = mentionVolume;
  }, [mentionVolume]);
  useEffect(() => {
    mentionSoundTypeRef.current = mentionSoundType;
  }, [mentionSoundType]);
  useEffect(() => {
    eventSoundsRef.current = eventSounds;
  }, [eventSounds]);
  useEffect(() => {
    eventSoundVolumeRef.current = eventSoundVolume;
  }, [eventSoundVolume]);
  useEffect(() => {
    onMessageDeletedRef.current = onMessageDeleted;
  }, [onMessageDeleted]);
  useEffect(() => {
    onUserMessagesDeletedRef.current = onUserMessagesDeleted;
  }, [onUserMessagesDeleted]);
  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);
  useEffect(() => {
    usernameRef.current = username;
  }, [username]);
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);
  useEffect(() => {
    onOwnBadgesLoadedRef.current = onOwnBadgesLoaded;
  }, [onOwnBadgesLoaded]);

  // Connection lifecycle (anonymous IRC client, connect/disconnect, room settings)
  const {
    client,
    isConnected,
    slowModeWaitTime,
    followerModeMinutes,
    broadcasterIdRef,
  } = useTwitchChatConnection({
    channelName,
    enabled,
    accessTokenRef,
  });

  // IRC PRIVMSG handler
  useTwitchChatMessageHandler({
    client,
    enabled,
    onMessageRef,
    usernameRef,
    accessTokenRef,
    mentionSoundEnabledRef,
    mentionVolumeRef,
    mentionSoundTypeRef,
    eventSoundsRef,
    eventSoundVolumeRef,
    broadcasterIdRef,
    onOwnBadgesLoadedRef,
  });

  // All other IRC event handlers (action, announcement, sub, raid, mod, etc.)
  useTwitchChatEventHandlers({
    client,
    enabled,
    onMessageRef,
    onMessageDeletedRef,
    onUserMessagesDeletedRef,
    usernameRef,
    accessTokenRef,
    eventSoundsRef,
    eventSoundVolumeRef,
    broadcasterIdRef,
    mentionSoundEnabledRef,
    mentionVolumeRef,
    mentionSoundTypeRef,
    onOwnBadgesLoadedRef,
  });

  useTwitchChat7TV({ enabled, onMessageRef });

  // sendMessage callback, routed through Helix (the IRC client is read-only)
  const sendMessage = useTwitchChatSend({
    userId,
    broadcasterId,
    channelName,
  });

  return { isConnected, sendMessage, slowModeWaitTime, followerModeMinutes };
}
