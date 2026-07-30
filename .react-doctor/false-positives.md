# React Doctor — False Positives

Patterns below are confirmed false positives. Suppress them during triage.

---

## `react-doctor/dangerous-html-sink`

**Skip after verifying:** the value is built by `parseMessageWithEmotes()`, an
escaping serializer/highlighter that outputs safe HTML from Twitch/YouTube
chat content. No user-controlled raw HTML reaches the sink.

- `src/components/chat/shared/ChatterHistoryOverlay.tsx:351` — `parseMessageWithEmotes(msg.content, msg.emotes, …)`
- `src/components/chat/shared/TwitchMessageContent.tsx:245` — `parseMessageWithEmotes(msg.replyTo.content)`
- `src/components/chat/shared/TwitchMessageContent.tsx:301` — `parseMessageWithEmotes(msg.content, msg.emotes, …)`

---

## `react-doctor/media-has-caption`

**Skip after verifying:** the `<video>` element renders a live HLS stream
with no pre-recorded captions available. An `eslint-disable` comment is
already present at the call site.

- `src/components/StreamEmbed.tsx:648` — `<video>` for live Twitch HLS playback

---

## `react-doctor/effect-needs-cleanup`

**Skip after verifying:** the effect returns a cleanup that releases every
resource it registers — `clearTimeout` for timers, `observer.disconnect()` for
IntersectionObservers, `abortController.abort()` for fetch, `ws.close()` for
WebSockets, and a `cancelled` flag gating all async state setters.

- `src/components/LandingPage.tsx:166` — cleanup clears `heroTimer` and disconnects `observer`
- `src/components/StreamEmbed.tsx:279` — cleanup sets `cancelled`, aborts fetch, clears `retryTimer`, destroys HLS
- `src/components/chat/shared/YouTubeChat.tsx:151` — cleanup closes EventSource, clears reconnect timer
- `src/hooks/chat/useEventSub.ts:154` — cleanup aborts controller, clears all timers, closes WebSocket

---

## `react-doctor/prefer-use-sync-external-store`

**Skip after verifying:** the external store's `getSnapshot` (`getDisabledEmotes`)
returns a new `Set` on every call, breaking `Object.is` referential stability
and causing cascading re-renders with `useSyncExternalStore`. The
`useState` + `useEffect` pattern with targeted `emotes-reloaded` and
`storage` event listeners is the correct approach for this case.

- `src/lib/emotes/hooks.ts:41` — `useDisabledEmotes()`

---

## `react-doctor/no-loading-flag-reset-outside-finally`

**Skip after verifying:** loading state is reset inside a `finally` block
guarded by a `cancelled` flag. The static matcher misses the conditional
`if (!cancelled) setLoading(false)` inside `finally`, or a `cancelled`
guard at the top of the `catch` block that prevents stale writes.

- `src/hooks/app/useMyChannelInfo.ts:60` — `finally { if (!cancelled) setLoading(false); }`
- `src/hooks/chat/chatAppStateHelpers/useYouTubeSync.ts:142` — `finally { if (!cancelled) setYtLoading(false); }`
- `src/components/StreamEmbed.tsx:418` — catch block guarded by `if (cancelled || abortController.signal.aborted) return;` before `setLoading(false)`

---

## `react-doctor/no-array-index-as-key`

**Skip after verifying:** the indexed key is only used for text parts within
a single chat message. Parts never reorder or filter within a message, and the
key is namespaced (`t-${i}`) so it is unique per item.

- `src/components/YTMessageParts.tsx:134` — text parts keyed as `` `t-${i}` ``

---

## `react-doctor/no-set-state-after-await-in-effect`

**Skip after verifying:** every `setState` call after an `await` is guarded
by `if (!cancelled) return` or `if (!cancelled) set...(…)`. The cleanup
callback sets `cancelled = true` on unmount/re-run, preventing stale writes.
The static analyzer cannot trace the boolean through the closure.

- `src/components/StreamEmbed.tsx:279` — `if (!cancelled) setLoading(false)` after fetch
- `src/hooks/app/useYoutubeLink.ts:85` — `if (!cancelled && data.videoId)` after fetch
- `src/hooks/chat/chatAppStateHelpers/useModeration.ts:105` — `if (!cancelled && isMod)` after API check
- `src/hooks/chat/chatAppStateHelpers/useStreamInfo.ts:127` — `if (cancelled || !status) return` guard
- `src/hooks/chat/chatAppStateHelpers/useStreamInfo.ts:173` — `if (cancelled || !info) return` guard
- `src/hooks/chat/eventSubHelpers/useRaidDetection.ts:56` — `if (!cancelled && resolved)` after resolve
- `src/hooks/chat/useSongQueue.ts:185` — `if (cancelled || !stored) return` guard

---

## `react-doctor/no-derived-state`

**Skip after verifying:** `modModeActive` / `youtubeModModeActive` are derived
from props + state in a useEffect, but they are part of the hook's public
return API and callers call the setter to toggle. Lifting the derivation into
render would require restructuring the entire parent-child state contract.

- `src/hooks/chat/chatAppStateHelpers/useModeration.ts:100` — `setModModeActive(isModerator && …)`
- `src/hooks/chat/chatAppStateHelpers/useYouTubeModeration.ts:120` — `setYoutubeModModeActive(isYouTubeModerator && …)`
- `src/hooks/chat/eventSubHelpers/useRaidDetection.ts:64` — `setResolvedId(channelId)` for numeric IDs

---

## `react-doctor/no-ref-current-in-render`

**Skip after verifying:** the ref write happens inside a render-time
"adjusting state during render" guard (React docs pattern) or as a
stable-reference tracker for mutators outside state updaters. The ref
is never read during render output.

- `src/hooks/chat/chatAppStateHelpers/useYouTubeSync.ts:169` — `deletedRef.current = new Map()` in render-time channel-switch guard
- `src/hooks/chat/useMusicPlayer.ts:222` — `playlistsRef.current = playlists` tracks latest for pure updaters

---

## `react-doctor/client-localstorage-no-version`

**Skip after verifying:** the storage key already includes a `:v1` version
suffix (e.g. `"mixchat_sessions:v1"`).

- `src/hooks/app/useAuthSessions.ts:245` — `SESSIONS_KEY = "mixchat_sessions:v1"`

---

## `react-doctor/no-flush-sync`

**Skip after verifying:** `flushSync` is used intentionally to force pending
state updates to commit synchronously so that `playlistsRef.current` reflects
the freshest state before the updater reads it. `startTransition` cannot
provide this synchronous commit guarantee.

- `src/hooks/chat/useMusicPlayer.ts:8` — `flushSync(() => setPlaylists(...))` in `addTrackFromUrl`

---

## `react-doctor/no-promise-then-side-effect-in-effect-without-catch`

**Skip after verifying:** the `.then()` chain already has a `.catch()` handler
that handles both network errors and AbortError. The static matcher misses
the catch because it is chained at the end of the promise.

- `src/components/StreamEmbed.tsx:245` — `.then().then().catch()` with cancelled-flag guard in catch

---

## `react-doctor/prefer-html-dialog`

**WIP — planned refactoring.** These modals use complex custom overlay/backdrop
behavior (portals, click-outside, custom keyboard navigation, inline state)
that would require significant refactoring to convert to native `<dialog>`.
The existing `role="dialog"` + `aria-modal="true"` pattern provides equivalent
accessibility semantics. Converting to native `<dialog>` is tracked as future work.

- `src/components/FavoriteChannelsModal.tsx:63` — portal modal with click-outside close
- `src/components/OnboardingWizard.tsx:398` — multi-step wizard with custom navigation
- `src/components/chat/shared/StreamerToolsModal.tsx:842` — minimizable tool panel
- `src/components/chat/shared/TimeoutDialog.tsx:123` — keyboard-driven radio selection

---

## `react-doctor/no-pass-live-state-to-parent`

**Skip after verifying:** every instance uses a callback prop (e.g. `onMessages`,
`onConnectionChange`) inside a `useEffect` to notify the parent of state
changes. This is the standard React pattern for child-to-parent communication
when lifting state is impractical (e.g. SSE streams, connection monitors).
All callbacks are memoized with `useCallback` so the effect only re-runs when
the actual data changes.

- `src/components/chat/ChatApp.tsx:420` — `onMessages(messages)` for unified chat
- `src/components/chat/ChatApp.tsx:424` — `onConnectionChange(state)` for YT connection
- `src/components/chat/shared/YouTubeChat.tsx:444` — `onMessages(messages)` for unified chat
- `src/components/chat/shared/YouTubeChat.tsx:451` — `onConnectionChange(state)` for connection
- `src/hooks/app/useTwitchChannels.ts:185` — channel list callback
- `src/hooks/chat/eventSubHelpers/useRaidDetection.ts:96` — raid detection callback
- `src/hooks/chat/useSongQueue.ts:285` — song queue state callback

---

## `react-doctor/no-prop-callback-in-effect`

**Skip after verifying:** same pattern as `no-pass-live-state-to-parent` —
callback props invoked inside effects for child-to-parent communication.
All callbacks are stable (`useCallback`) and the effects have proper cleanup.

- `src/components/chat/shared/StreamerToolsModal.tsx:122` — `onChanged()` in HistorySection
- `src/components/chat/shared/YouTubeChat.tsx:444` — `onMessages(messages)`
- `src/components/chat/shared/YouTubeChat.tsx:451` — `onConnectionChange(state)`

---

## `react-doctor/no-pass-data-to-parent`

**Skip after verifying:** same pattern as above — data passed to parent via
callback props inside effects. Standard child-to-parent communication.

- `src/components/chat/ChatApp.tsx:420` — `onMessages(messages)`
- `src/components/chat/ChatApp.tsx:424` — `onConnectionChange(state)`

---

## `react-doctor/no-fetch-in-effect`

**Skip after verifying:** data fetching inside effects with proper cleanup
(AbortController, cancelled flag) is the standard React pattern for
component-level data loading. Both instances guard against stale writes.

- `src/hooks/app/useYoutubeLink.ts:85` — fetch with `cancelled` flag guard
- `src/hooks/chat/twitchChatHelpers/useConnection.ts:72` — connection probe with cleanup

---

## `react-doctor/no-effect-chain`

**Skip after verifying:** the effects handle separate concerns (local state
refresh, server fetch, detail fetch) and each has its own dependency array.
They are not chained — they are independent effects that happen to run in
sequence due to shared state.

- `src/components/chat/shared/StreamerToolsModal.tsx:373` — PastPlaylistsSection separate refresh effects

---

## `react-doctor/no-giant-component`

**WIP — planned refactoring.** Large component warnings are maintainability
suggestions. The codebase uses hook extraction (`useChatAppState`,
`useModeration`, etc.) to manage complexity. Splitting these components
further requires extracting sub-components — tracked as future work.

- `src/components/AppContainer.tsx:49`
- `src/components/EmbedConfigModal.tsx:69` - File already extracted
- `src/components/EmoteMenu.tsx:23`
- `src/components/LandingPage.tsx:162`
- `src/components/LoginPanel.tsx:55`
- `src/components/OnboardingWizard.tsx:220`
- `src/components/StreamEmbed.tsx:184`
- `src/components/YouTubeLinker.tsx:19`
- `src/components/chat/ChatApp.tsx:47`
- `src/components/chat/display/ChatHeader.tsx:162`
- `src/components/chat/display/index.tsx:73`
- `src/components/chat/shared/ChatterHistoryOverlay.tsx:27`
- `src/components/chat/shared/GiveawayPanel.tsx:38`
- `src/components/chat/shared/MessageInput.tsx:39`
- `src/components/chat/shared/MusicPlayerPanel.tsx:32`
- `src/components/chat/shared/PresetMessages.tsx:51`
- `src/components/chat/shared/SongQueuePanel.tsx:71`
- `src/components/chat/shared/StreamerToolsModal.tsx:222`
- `src/components/chat/shared/UnifiedInput.tsx:73`
- `src/components/chat/shared/YouTubeChat.tsx:98`
- `src/components/chat/shared/YouTubeMessageInput.tsx:41`
- `src/components/chat/unified/index.tsx:57`

---

## `react-doctor/no-multi-comp`

**Skip after verifying:** settings files co-locate small, single-purpose
render helpers (checkbox + label + description) alongside their parent
`get*Settings()` function. Each helper is ~10–30 lines and never reused
outside its settings file. Extracting them into separate files would create
~16 micro-files with one-line exports, adding navigation overhead without
improving testability or reusability.

- `src/components/settings/AppearanceSettings.tsx` — `FontSizeSlider`, `ChatFontSelect`, `ChatThemePicker`, `TimestampsToggle`
- `src/components/settings/ChatSettings.tsx` — `UnifyChatToggle`, `UseYoutubeEmbedToggle`, `ShowDeletedMessagesToggle`, `CompactActionsToggle`, `KeepModActionsVisibleToggle`, `ModActionsFirstToggle`, `DoubleClickConfirmModActionsToggle`
- `src/components/settings/LayoutSettings.tsx` — `EmbedDefaultSetting`, `DefaultPlayerSetting`, `HlsQualitySetting`, `AutoFoldSidebarSetting`
- `src/components/settings/StreamerSettings.tsx` — `StreamerToolsToggle`, `IgnoredUsersSection`, `EventSoundSection`

---

## `react-doctor/no-many-boolean-props`

**Skip after verifying:** boolean props come from `SettingsProps`, a shared
interface that represents independent user settings. Each boolean is a
standalone toggle in the settings UI. The flat structure is load-bearing:
`settingsBackup.ts`, `driveSync.ts`, `importSettings`, and `exportSettings`
all serialize/deserialize the flat JSON format. Consolidating into
sub-objects would break backup/restore and Google Drive sync, require
updating 10+ files, and add indirection that makes the code harder to
read. The current pattern (one boolean prop + one setter per setting) is
the standard React approach for settings forms.

- `src/components/EmbedConfigModal.tsx:69` — extends `SettingsProps` directly
- `src/components/LoginPanel.tsx:55` — extends `Partial<SettingsProps>`
- `src/components/chat/display/ChatHeader.tsx:162` — subset of boolean props
- `src/components/chat/display/index.tsx:73` — subset of boolean props
