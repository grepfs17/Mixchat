import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { TwitchMessage } from "../../lib/types";
import { searchEmotes } from "../../lib/emotes";
import { searchEmojis, type EmojiEntry } from "../../lib/emojiShortcodes";
import { MOD_COMMANDS } from "../../lib/constants";
import { isMobileDevice } from "../../lib/device";
import { useEmotes } from "./useEmotes";
import { useSlowMode } from "./useSlowMode";
import { useInsertAtCursor } from "./useInsertAtCursor";
import { useAutocompleteMenu } from "./useAutocompleteMenu";
import {
  useAutocomplete,
  type UseAutocompleteReturn,
} from "./useAutocomplete";

interface YTMessageLike {
  author: string;
}

export interface UseChatInputCoreOptions {
  /** Ref to the input element (textarea or input). Component owns this. */
  inputRef: RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  /** Twitch chat messages for @mention authors. */
  chatMessages?: TwitchMessage[];
  /** YouTube chat messages for @mention authors (UnifiedInput only). */
  ytChatMessages?: YTMessageLike[];
  /** Current user's display name (excluded from @mentions). */
  currentUsername?: string;
  /** Whether the current user is a moderator (enables /command autocomplete). */
  isModerator?: boolean;
  /** Loading state — triggers refocus effect. */
  isLoading?: boolean;
  /** Reply target id — triggers focus effect when set. */
  replyingToId?: string;
  /** Enable Twitch-specific autocomplete (emotes, commands). */
  enableTwitchFeatures?: boolean;
  /** Enable YouTube emoji :shortcode: autocomplete. */
  enableYoutubeEmoji?: boolean;
  /** Filter @mention autocomplete by source platform. */
  mentionSource?: "twitch" | "youtube" | "both";
  /** Slow-mode wait time (seconds). If set, cooldown starts after send. */
  slowModeWaitTime?: number | null;
  /** Called with the trimmed message text. Hook clears state after. */
  onSend: (text: string) => Promise<void>;
}

export type EmoteACItem = { name: string; url: string; source: string };
export type CommandACItem = {
  name: string;
  usage: string;
  description: string;
};
type UsernameACItem = string;

export interface UseChatInputCoreResult {
  /** Current message text. */
  message: string;
  /** Set message text. */
  setMessage: React.Dispatch<React.SetStateAction<string>>;

  /** Organised emotes for the emote picker. */
  emotesOrganized: ReturnType<typeof useEmotes>;

  /** Slow-mode cooldown remaining (seconds). */
  slowModeCooldown: number;
  /** Start a slow-mode cooldown for the given duration. */
  startCooldown: (seconds: number) => void;

  /** Autocomplete instance for Twitch emotes. */
  emoteAC: UseAutocompleteReturn<EmoteACItem>;
  /** Autocomplete instance for YouTube emoji. */
  emojiAC: UseAutocompleteReturn<EmojiEntry>;
  /** Autocomplete instance for @mentions. */
  usernameAC: UseAutocompleteReturn<UsernameACItem>;
  /** Autocomplete instance for /commands. */
  commandAC: UseAutocompleteReturn<CommandACItem>;

  /** Bounding rect of the input for positioning menus. */
  menuRect: DOMRect | null;
  /** Ref for the autocomplete menu container. */
  menuRef: React.RefObject<HTMLDivElement | null>;

  /** Insert text at cursor with optional prefix (e.g. "@"). */
  insertWithPrefix: (name: string, prefix?: string) => void;
  /** Insert text at a specific position. */
  insertAtPosition: (before: string, text: string, after?: string) => void;
  /** Replace the word at the cursor. */
  replaceCurrentWord: (text: string) => void;

  /** Stable author names for @mention autocomplete. */
  allAuthors: string[];

  /** Text change handler — wire to onChange of the input element. */
  handleChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  /** Keyboard handler — wire to onKeyDown of the input element. */
  handleKeyDown: (e: React.KeyboardEvent) => void;
}

/**
 * Shared hook that provides the autocomplete, send, and keyboard
 * orchestration shared between MessageInput and UnifiedInput (~300 lines).
 *
 * Each component calls this hook with appropriate flags, then focuses
 * on rendering its unique UI (platform toggles, emote/emoji pickers,
 * reply indicators, warnings).
 */
export function useChatInputCore(
  opts: UseChatInputCoreOptions,
): UseChatInputCoreResult {
  const {
    inputRef,
    chatMessages = [],
    ytChatMessages = [],
    currentUsername = "",
    isModerator = false,
    isLoading = false,
    replyingToId,
    enableTwitchFeatures = true,
    enableYoutubeEmoji = false,
    mentionSource,
    slowModeWaitTime = null,
    onSend,
  } = opts;

  const [message, setMessage] = useState("");
  const shouldRefocusRef = useRef(false);

  const emotesOrganized = useEmotes();
  const { cooldown: slowModeCooldown, startCooldown } = useSlowMode();

  // ---- Authors for @mention ----
  const allAuthors = useMemo(() => {
    const authorMap = new Map<string, string>();
    if (!mentionSource || mentionSource === "twitch" || mentionSource === "both") {
      for (const msg of chatMessages) {
        const lower = msg.author.toLowerCase();
        const existing = authorMap.get(lower);
        if (
          !existing ||
          (existing === existing.toLowerCase() &&
            msg.author !== msg.author.toLowerCase())
        ) {
          authorMap.set(lower, msg.author);
        }
      }
    }
    if (!mentionSource || mentionSource === "youtube" || mentionSource === "both") {
      for (const m of ytChatMessages) {
        if (m.author) {
          const lower = m.author.toLowerCase();
          if (!authorMap.has(lower)) authorMap.set(lower, m.author);
        }
      }
    }
    return Array.from(authorMap.values());
  }, [chatMessages, ytChatMessages, mentionSource]);

  // ---- Insert at cursor ----
  const { insertWithPrefix, insertAtPosition, replaceCurrentWord } =
    useInsertAtCursor({ message, setMessage, inputRef });

  // Ref to `closeAll` so `handleSend` can call it without depending on it
  // (closeAll is defined after the autocomplete instances, which depend on handleSend).
  const closeAllRef = useRef<(() => void) | null>(null);

  // ---- Send ----
  const handleSend = useCallback(async () => {
    const text = message.trim();
    if (!text) return;
    try {
      if (!isMobileDevice()) shouldRefocusRef.current = true;
      await onSend(text);
      setMessage("");
      closeAllRef.current?.();
      if (slowModeWaitTime && slowModeWaitTime > 0) {
        startCooldown(slowModeWaitTime);
      }
    } catch (err) {
      console.error("Chat send failed:", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, onSend, slowModeWaitTime, startCooldown]);

  // ---- Autocomplete instances ----
  const emoteAC = useAutocomplete<EmoteACItem>({
    onSelect: (emote) => {
      insertWithPrefix(emote.name);
    },
    onSend: handleSend,
  });

  const emojiAC = useAutocomplete<EmojiEntry>({
    onSelect: (entry) => {
      const cursor = inputRef.current?.selectionStart ?? message.length;
      const before = message.substring(0, cursor);
      insertAtPosition(before, entry.char);
    },
    onSend: handleSend,
  });

  const usernameAC = useAutocomplete<UsernameACItem>({
    onSelect: (username) => {
      insertWithPrefix(username, "@");
    },
    onSend: handleSend,
  });

  const commandAC = useAutocomplete<CommandACItem>({
    onSelect: (cmd) => {
      replaceCurrentWord(cmd.name);
    },
    onSend: handleSend,
  });

  // ---- Autocomplete menu management ----
  const { menuRect, menuRef, closeAll } = useAutocompleteMenu({
    inputRef,
    autocompleteInstances: [emoteAC, emojiAC, usernameAC, commandAC],
  });

  // Wire closeAll into the ref so handleSend can call it without a dep cycle.
  closeAllRef.current = closeAll;

  // ---- Text change handler ----
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const newMessage = e.target.value;
      setMessage(newMessage);
      const cursorPos = e.target.selectionStart ?? newMessage.length;
      const textBeforeCursor = newMessage.substring(0, cursorPos);
      const lastSpaceIndex = textBeforeCursor.lastIndexOf(" ");
      const currentWord = textBeforeCursor.substring(lastSpaceIndex + 1);

      // YouTube emoji :shortcode:
      if (enableYoutubeEmoji) {
        const lastColon = textBeforeCursor.lastIndexOf(":");
        if (lastColon !== -1) {
          const query = textBeforeCursor.substring(lastColon + 1);
          if (query.length >= 2 && !query.includes(" ")) {
            const matches = searchEmojis(query);
            if (matches.length > 0) {
              closeAll();
              emojiAC.show(matches);
              return;
            }
          }
        }
      }

      // @mention
      if (currentWord.startsWith("@") && currentWord.length > 1) {
        const query = currentWord.substring(1).toLowerCase();
        const matching = allAuthors
          .filter(
            (name) =>
              name.toLowerCase().includes(query) &&
              name.toLowerCase() !== currentUsername.toLowerCase(),
          )
          .sort();
        if (matching.length > 0) {
          closeAll();
          usernameAC.show(matching);
          return;
        }
      }

      // Slash commands (Twitch only)
      if (
        enableTwitchFeatures &&
        isModerator &&
        currentWord.startsWith("/") &&
        lastSpaceIndex === -1
      ) {
        const matching = MOD_COMMANDS.filter((cmd) =>
          cmd.name.startsWith(currentWord.toLowerCase()),
        );
        if (matching.length > 0) {
          closeAll();
          commandAC.show(matching);
          return;
        }
      }

      // Twitch emotes
      if (
        enableTwitchFeatures &&
        currentWord.length > 0 &&
        !currentWord.startsWith("@") &&
        !currentWord.startsWith("/")
      ) {
        const results = searchEmotes(currentWord);
        if (results.length > 0) {
          closeAll();
          emoteAC.show(results);
          return;
        }
      }

      closeAll();
    },
    [
      enableYoutubeEmoji,
      enableTwitchFeatures,
      allAuthors,
      currentUsername,
      isModerator,
      emoteAC,
      emojiAC,
      usernameAC,
      commandAC,
      closeAll,
    ],
  );

  // ---- Keyboard handler ----
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Try each autocomplete in priority order
      if (usernameAC.isOpen) {
        usernameAC.handleKeyDown(e);
        return;
      }
      if (commandAC.isOpen) {
        commandAC.handleKeyDown(e);
        return;
      }
      if (emoteAC.isOpen) {
        emoteAC.handleKeyDown(e);
        return;
      }
      if (emojiAC.isOpen) {
        emojiAC.handleKeyDown(e);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [usernameAC, commandAC, emoteAC, emojiAC, handleSend],
  );

  // ---- Effects ----
  // Refocus after send completes
  useEffect(() => {
    return () => {
      if (shouldRefocusRef.current) inputRef.current?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  useEffect(() => {
    if (!isLoading && shouldRefocusRef.current) {
      shouldRefocusRef.current = false;
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  // Focus input when replying
  useEffect(() => {
    if (replyingToId && inputRef.current) inputRef.current.focus();
  }, [replyingToId, inputRef]);

  return {
    message,
    setMessage,
    emotesOrganized,
    slowModeCooldown,
    startCooldown,
    emoteAC,
    emojiAC,
    usernameAC,
    commandAC,
    menuRect,
    menuRef,
    insertWithPrefix,
    insertAtPosition,
    replaceCurrentWord,
    allAuthors,
    handleChange,
    handleKeyDown,
  };
}
