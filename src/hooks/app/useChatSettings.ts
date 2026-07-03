import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatFont, ChatTheme } from "../../lib/types";
import { applyTheme } from "../../lib/themes";
import { loadEventSounds, saveEventSounds } from "../../lib/eventSoundStorage";
import type { MentionSoundType } from "../chat/useTwitchChat";
import type { ModModeTarget } from "../../contexts/ModerationContext";

function useLocalStorageState<T>(
  key: string,
  defaultValue: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    if (typeof localStorage === "undefined") return defaultValue;
    const saved = localStorage.getItem(key);
    if (saved === null) return defaultValue;
    try {
      return JSON.parse(saved) as T;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
}

export type UseChatSettingsResult = {
  embedDefaultOpen: boolean;
  setEmbedDefaultOpen: React.Dispatch<React.SetStateAction<boolean>>;
  showStreamEmbed: boolean;
  setShowStreamEmbed: React.Dispatch<React.SetStateAction<boolean>>;
  unifyChatEnabled: boolean;
  setUnifyChatEnabled: (value: boolean) => void;
  useYoutubeEmbed: boolean;
  setUseYoutubeEmbed: (value: boolean) => void;
  fontSize: number;
  setFontSize: React.Dispatch<React.SetStateAction<number>>;
  chatFont: ChatFont;
  setChatFont: React.Dispatch<React.SetStateAction<ChatFont>>;
  mentionSoundEnabled: boolean;
  setMentionSoundEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  mentionVolume: number;
  setMentionVolume: React.Dispatch<React.SetStateAction<number>>;
  mentionSoundType: MentionSoundType;
  setMentionSoundType: React.Dispatch<React.SetStateAction<MentionSoundType>>;
  showDeletedMessages: boolean;
  setShowDeletedMessages: React.Dispatch<React.SetStateAction<boolean>>;
  compactActions: boolean;
  setCompactActions: React.Dispatch<React.SetStateAction<boolean>>;
  keepModActionsVisible: boolean;
  setKeepModActionsVisible: React.Dispatch<React.SetStateAction<boolean>>;
  modActionsFirst: boolean;
  setModActionsFirst: React.Dispatch<React.SetStateAction<boolean>>;
  splitChatEnabled: boolean;
  setSplitChatEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  chatTheme: ChatTheme;
  setChatTheme: React.Dispatch<React.SetStateAction<ChatTheme>>;
  hideViewerCount: boolean;
  setHideViewerCount: React.Dispatch<React.SetStateAction<boolean>>;
  hideChatTimestamps: boolean;
  setHideChatTimestamps: React.Dispatch<React.SetStateAction<boolean>>;
  eventSounds: Record<string, string>;
  eventSoundVolume: number;
  setEventSoundVolume: React.Dispatch<React.SetStateAction<number>>;
  ignoredUsers: string[];
  setIgnoredUsers: React.Dispatch<React.SetStateAction<string[]>>;
  handleEventSoundChange: (eventType: string, soundData: string | null) => void;
  modModeTargets: Record<string, ModModeTarget>;
  setModModeTargetForChannel: (
    channelId: string,
    target: ModModeTarget,
  ) => void;
  streamerToolsEnabled: boolean;
  setStreamerToolsEnabled: React.Dispatch<React.SetStateAction<boolean>>;
};

export function useChatSettings(): UseChatSettingsResult {
  // Embed default open is the persisted preference; the runtime embed-visible
  // toggle is initialised from it on first render and then lives independently.
  const [embedDefaultOpen, setEmbedDefaultOpen] = useLocalStorageState<boolean>(
    "mixchat_embed_default_open",
    true,
  );
  const [showStreamEmbed, setShowStreamEmbed] = useState(embedDefaultOpen);

  const [unifyChatEnabled, setUnifyChatEnabledRaw] =
    useLocalStorageState<boolean>("mixchat_unify_chat", false);
  const [useYoutubeEmbed, setUseYoutubeEmbedRaw] =
    useLocalStorageState<boolean>("mixchat_use_youtube_embed", true);
  // unifyChat and youtubeEmbed are mutually exclusive — turning one on forces
  // the other off so the user can't end up with conflicting embed modes.
  const setUnifyChatEnabled = useCallback((value: boolean) => {
    setUnifyChatEnabledRaw(value);
    if (value) setUseYoutubeEmbedRaw(false);
  }, []);
  const setUseYoutubeEmbed = useCallback((value: boolean) => {
    setUseYoutubeEmbedRaw(value);
    if (value) setUnifyChatEnabledRaw(false);
  }, []);

  const [fontSize, setFontSize] = useLocalStorageState<number>(
    "mixchat_font_size",
    14,
  );
  const [chatFont, setChatFont] = useLocalStorageState<ChatFont>(
    "mixchat_chat_font",
    "inter",
  );
  const [mentionSoundEnabled, setMentionSoundEnabled] =
    useLocalStorageState<boolean>("mixchat_mention_sound", true);
  const [mentionVolume, setMentionVolume] = useLocalStorageState<number>(
    "mixchat_mention_volume",
    0.2,
  );
  const [mentionSoundType, setMentionSoundType] =
    useLocalStorageState<MentionSoundType>(
      "mixchat_mention_sound_type",
      "ding",
    );
  const [showDeletedMessages, setShowDeletedMessages] =
    useLocalStorageState<boolean>("mixchat_show_deleted_messages", true);
  const [compactActions, setCompactActions] = useLocalStorageState<boolean>(
    "mixchat_compact_actions",
    false,
  );
  const [keepModActionsVisible, setKeepModActionsVisible] =
    useLocalStorageState<boolean>("mixchat_keep_mod_actions_visible", false);
  const [modActionsFirst, setModActionsFirst] = useLocalStorageState<boolean>(
    "mixchat_mod_actions_first",
    false,
  );
  const [splitChatEnabled, setSplitChatEnabled] = useLocalStorageState<boolean>(
    "mixchat_split_chat",
    false,
  );
  const [chatTheme, setChatTheme] = useLocalStorageState<ChatTheme>(
    "mixchat_chat_theme",
    "default",
  );
  const [hideViewerCount, setHideViewerCount] = useLocalStorageState<boolean>(
    "mixchat_hide_viewer_count",
    false,
  );
  const [hideChatTimestamps, setHideChatTimestamps] =
    useLocalStorageState<boolean>("mixchat_hide_chat_timestamps", false);

  // Event sounds are stored in IndexedDB (with a one-time localStorage
  // migration performed inside loadEventSounds). The loadedRef guards
  // against persisting the empty initial value back before the first load
  // completes, which would wipe the user's sounds on hard reloads.
  const [eventSounds, setEventSounds] = useState<Record<string, string>>({});
  const loadedEventSoundsRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadEventSounds()
      .then((sounds) => {
        if (!cancelled) {
          setEventSounds(sounds || {});
          loadedEventSoundsRef.current = true;
        }
      })
      .catch(() => {
        loadedEventSoundsRef.current = true;
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loadedEventSoundsRef.current) return;
    saveEventSounds(eventSounds).catch(() => {});
  }, [eventSounds]);

  const [eventSoundVolume, setEventSoundVolume] = useLocalStorageState<number>(
    "mixchat_event_sound_volume",
    1,
  );
  const [ignoredUsers, setIgnoredUsers] = useLocalStorageState<string[]>(
    "mixchat_ignored_users",
    [],
  );
  const [modModeTargets, setModModeTargets] = useLocalStorageState<
    Record<string, ModModeTarget>
  >("mixchat_mod_mode_targets", {});
  const [streamerToolsEnabled, setStreamerToolsEnabled] =
    useLocalStorageState<boolean>("mixchat_streamer_tools_enabled", true);

  // Apply theme to document whenever it changes.
  useEffect(() => {
    applyTheme(chatTheme);
  }, [chatTheme]);

  const handleEventSoundChange = useCallback(
    (eventType: string, soundData: string | null) => {
      setEventSounds((prev) => {
        const updated = { ...prev };
        if (soundData === null) {
          delete updated[eventType];
        } else {
          updated[eventType] = soundData;
        }
        return updated;
      });
    },
    [],
  );

  const setModModeTargetForChannel = useCallback(
    (channelId: string, target: ModModeTarget) => {
      setModModeTargets((prev) => ({ ...prev, [channelId]: target }));
    },
    [],
  );

  return {
    embedDefaultOpen,
    setEmbedDefaultOpen,
    showStreamEmbed,
    setShowStreamEmbed,
    unifyChatEnabled,
    setUnifyChatEnabled,
    useYoutubeEmbed,
    setUseYoutubeEmbed,
    fontSize,
    setFontSize,
    chatFont,
    setChatFont,
    mentionSoundEnabled,
    setMentionSoundEnabled,
    mentionVolume,
    setMentionVolume,
    mentionSoundType,
    setMentionSoundType,
    showDeletedMessages,
    setShowDeletedMessages,
    compactActions,
    setCompactActions,
    keepModActionsVisible,
    setKeepModActionsVisible,
    modActionsFirst,
    setModActionsFirst,
    splitChatEnabled,
    setSplitChatEnabled,
    chatTheme,
    setChatTheme,
    hideViewerCount,
    setHideViewerCount,
    hideChatTimestamps,
    setHideChatTimestamps,
    eventSounds,
    eventSoundVolume,
    setEventSoundVolume,
    ignoredUsers,
    setIgnoredUsers,
    handleEventSoundChange,
    modModeTargets,
    setModModeTargetForChannel,
    streamerToolsEnabled,
    setStreamerToolsEnabled,
  };
}
