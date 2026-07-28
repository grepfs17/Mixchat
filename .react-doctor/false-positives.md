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
`if (!cancelled) setLoading(false)` inside `finally`.

- `src/hooks/app/useMyChannelInfo.ts:60` — `finally { if (!cancelled) setLoading(false); }`
- `src/hooks/chat/chatAppStateHelpers/useYouTubeSync.ts:142` — `finally { if (!cancelled) setYtLoading(false); }`

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
