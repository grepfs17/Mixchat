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

## `react-doctor/client-localstorage-no-version`

**Skip after verifying:** the storage key already includes a `:v1` version
suffix (e.g. `"mixchat_sessions:v1"`).

- `src/hooks/app/useAuthSessions.ts:245` — `SESSIONS_KEY = "mixchat_sessions:v1"`
