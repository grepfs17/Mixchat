## Core Stack

| Layer | Technology |
|-------|-----------|
| Framework | Astro 7.x (SSR, Node adapter, standalone output) |
| UI Library | React 19.x + React DOM |
| Language | TypeScript (7.x) with strict mode |
| Bundler | Vite 7.x (via Astro) |
| Package Mgr | pnpm (workspace monorepo-ready) |
| Testing | Vitest 4.x + jsdom + Testing Library |
| CSS | Plain CSS files with CSS custom properties (themes) |
| Icons | react-icons (FA icons) |
| Sanitization | DOMPurify |

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `@twurple/chat` | Twitch IRC chat (anonymous read-only client-side connection) |
| `youtubei.js` | YouTube InnerTube API (chat, metadata, player) |
| `hls.js` | HLS video player for M3U8 streams |
| `bgutils-js` | Bot guard utilities (PoToken generation for YouTube) |
| `jsdom` | DOM environment for BotGuard PoToken generation in Node |
| `twemoji` | Emoji rendering fallback |

## Project Structure

```
mixchat/
├── src/
│   ├── components/          # React components
│   │   ├── chat/            # Chat UI (largest subsystem)
│   │   │   ├── shared/      # Shared chat components (input, banners, panels, modals)
│   │   │   ├── unified/     # Unified chat (merged Twitch+YouTube)
│   │   │   ├── display/     # Display-mode chat components
│   │   │   ├── ChatApp.tsx  # Central chat orchestrator component
│   │   │   ├── ChatAppChrome.tsx  # Chat banners + streamer tool chrome
│   │   │   ├── ChatAppContent.tsx # Split/unified chat layout branches
│   │   │   ├── SplitLayout.tsx
│   │   │   └── ThemeMascots.tsx
│   │   ├── dev/             # Dev-only components (chat styling gallery)
│   │   ├── wheel/           # Wheel Spin tool (canvas wheel, options, history, manager)
│   │   ├── app/             # AppContainer sub-components (sidebar, home, chat view, modals, loading screen)
│   │   ├── AppContainer.tsx # Root app component (orchestrates hooks, delegates layout to app/)
│   │   ├── LoginPanel.tsx   # Sidebar with channel list + settings
│   │   ├── StreamEmbed.tsx  # Twitch embed / HLS player
│   │   ├── StreamGrid.tsx   # Grid of live channels
│   │   ├── LandingPage.tsx  # Unauthenticated landing
│   │   ├── OnboardingWizard.tsx  # First-run setup wizard
│   │   ├── FirefoxTrackingProtectionModal.tsx  # Firefox ETP notice popup (home + global)
│   │   └── ...              # Misc components (WatchlistManager, YouTubeLinker, etc.)
│   ├── hooks/               # Custom React hooks
│   │   ├── app/             # App-level hooks (auth, channels, settings, embed, stream monitor, onboarding, loading, selection)
│   │   ├── chat/            # Chat hooks (state, messages, moderation, emotes, song queue, lazy history)
│   │   │   ├── chatAppStateHelpers/  # Decomposed helpers for ChatApp state
│   │   │   ├── twitchChatHelpers/     # Twitch connection lifecycle helpers
│   │   │   └── eventSubHelpers/       # EventSub consumer hooks
│   │   └── ui/              # Generic UI hooks (countdown timer)
│   ├── lib/                 # Pure business logic & utilities (no React import)
│   │   ├── twitch.ts        # Twitch Helix API client (moderation, users, streams, follows)
│   │   ├── twitchGifs.ts    # Twitch Giphy GIF tag parsing + chat text segmentation
│   │   ├── twitchReply.ts   # Twitch reply mention-prefix stripping for quoted previews
│   │   ├── youtube.ts       # YouTube InnerTube client (proxy-aware, PoToken, throttled)
│   │   ├── emotes/          # Emote system (7TV, BTTV, FFZ, Twitch, search, parser)
│   │   ├── songQueue/       # Song queue system (server+client: types, IDB, API, extraction)
│   │   ├── musicPlayer/     # Music player (client-side IndexedDB)
│   │   ├── streamerTools/   # Giveaways, polls, predictions, history, chat helpers, past playlists
│   │   ├── streamTools/     # Shared stream-tools state, relay types + client API
│   │   ├── wheel/           # Wheel Spin (types, client API, canvas draw, IDB owner tokens)
│   │   ├── settings/        # Settings types
│   │   ├── themes.ts        # Chat themes (CSS variable definitions)
│   │   ├── types.ts         # Core types (TwitchMessage, PlatformSession, ChatTheme, etc.)
│   │   ├── constants.ts     # App constants (mod commands, YT user agent)
│   │   ├── version.ts       # Display version + the git branch baked in at build time
│   │   ├── oauthSession.ts  # OAuth popup + postMessage listener
│   │   ├── desktopShell.ts  # Runtime shell detection + system-browser opener + Twitch help window bridge
│   │   ├── secureRequest.ts  # Request-scheme check that gates the Secure flag on auth cookies
│   │   ├── google.ts        # Google API fetch wrapper (rate limiting, quota tracking)
│   │   ├── googleDrive.ts   # Google Drive backup/restore for settings
│   │   └── ...              # Badges, chat history, chat colors, potoken, emojiShortcodes, etc.
│   ├── server/              # Server-side state stores
│   │   ├── songQueueStore.ts   # In-memory song queue storage
│   │   ├── songQueueConfig.ts  # Song queue configuration (rate limits, etc.)
│   │   ├── songQueueApi.ts     # Song queue API route helpers
│   │   ├── wheelStore.ts       # Wheel Spin JSON file store (create/update/delete/public read)
│   │   ├── wheelConfig.ts      # Wheel store base directory resolution
│   │   ├── wheelApi.ts         # Wheel API route helpers (json, owner token, channel parsing)
│   │   ├── wheelAuth.ts        # Server-verified channel ownership + Twitch moderator access
│   │   ├── streamToolsConfig.ts  # Stream tools data directory resolution
│   │   ├── streamToolsSettings.ts # Per-channel Stream tools access settings (enabled, allowMods, modAccess, allowedMods)
│   │   ├── streamToolsState.ts    # Shared Giveaway + Music Player state (versioned, atomic)
│   │   ├── streamToolPollRelay.ts # Ephemeral mod -> broadcaster poll command relay
│   │   ├── youtubeAuth.ts      # Stable viewer identity/session keys for authenticated YouTube live chat
│   │   ├── googleHandoff.ts    # Short-lived Tauri Google OAuth handoff store (PKCE, single use)
│   │   └── providerTokens.ts   # Refresh provider access tokens from httpOnly refresh cookies
│   ├── pages/               # Astro pages + API routes
│   │   ├── index.astro      # Main app page
│   │   ├── channel/[name].astro  # Direct channel link page
│   │   ├── s/[sessionId].astro   # Embed page (stripped-down chat)
│   │   ├── wheel/index.astro     # Wheel Spin manager (opens from Stream tools in a new tab)
│   │   ├── wheel/[wheelId].astro # Shared/public wheel page
│   │   ├── dev/chat-preview.astro # Dev-only chat styling gallery (blocked in prod by middleware)
│   │   ├── auth/            # OAuth callback pages (twitch, youtube)
│   │   ├── desktop/         # Desktop-only pages (twitch-activate redirect)
│   │   ├── help/twitch-login.astro # Desktop Twitch login guide (auto-opens during device login)
│   │   └── api/             # API endpoints (song-queue, wheel, stream-tools, youtube-proxy, moderation, etc.)
│   │       ├── auth/google/desktop/  # Tauri Google OAuth handoff start + poll
│   │       └── desktop/open.ts       # Desktop-only system-browser opener
│   ├── styles/              # CSS stylesheets (theme system, component styles)
│   ├── contexts/            # React contexts (ModerationContext)
│   └── client/              # Client-side entry points (songQueuePublic)
├── test/                    # Mirror of src structure for tests
├── public/                  # Static assets
```

## Architecture & Key Patterns

### 1. Data Flow

- **Auth**: OAuth popup → callback page → postMessage → parent window stores session in localStorage
- **Twitch Chat**: client-side `@twurple/chat` (anonymous read-only IRC) → `useTwitchChat` hook → `useChatMessages` → renders via ChatDisplay. Sending goes through `/api/twitch-proxy` (Helix Send Chat Message). Giphy GIF chat messages (GIF Keyboard) are parsed from the IRC `gifs` tag (`start-end|<gifID>|<gifURL>`) in `src/lib/twitchGifs.ts` and rendered inline as `<img class="chat-gif">` in `TwitchMessageContent`. `@mentions` are rendered in the mentioned user's chat colour (username → colour map built from loaded messages in `src/lib/chatColors.ts`), and reply previews colour the `@author` header and strip a repeated `@author` prefix from the quoted content (`src/lib/twitchReply.ts`).
- **YouTube Chat**: Server-side polling via `youtubei.js` InnerTube → SSE or periodic fetch → `YouTubeChat` component. Guests share one anonymous session per video; viewers with a YouTube token get an isolated authenticated session (keyed by a hash of the httpOnly refresh token) so moderator-only AutoMod holds are never leaked to other viewers. Authenticated sessions refresh their own OAuth token and namespace the per-video poll throttle. The viewer token is attached only to live-chat/metadata requests: sending it on player/next makes YouTube drop the session to guest and hides AutoMod holds. If an authenticated chat fails with a non-transient error, it is rebuilt in place on the guest client (AutoMod holds are cleared) instead of ending the stream. Guest chats that fail end after 30s with the HTTP status in the error message.
- **Storage**: All user settings persisted to `localStorage` with versioned keys. Google Drive backup/restore available. Chat messages are additionally persisted to IndexedDB (`src/lib/chatHistoryStorage.ts`) for lazy-loading older history (see §11).
- **Server State**: Song queue uses server-side in-memory store (`songQueueStore`) with live polling via API routes.

### 2. Component Architecture

- **AppContainer** is the root component orchestrating sessions, channels, embed, settings, and stream monitoring. Its layout is delegated to focused sub-components under `src/components/app/` (AppSidebar, HomeChannelView, ChatView, AppModals, LoadingScreen), with onboarding, initial-loading, and channel-selection logic in dedicated `src/hooks/app/` hooks. The initial LoadingScreen renders real stages (session restore, token refresh, followed-channel fetch) with a progress bar instead of a generic spinner.
- **ChatApp** is the central chat component receiving all settings as props and delegating to individual chat panels, banners, and modal overlays.
- All `useXxx` hooks are self-contained custom hooks that own their state, effects, and derived values.

### 3. State Management

- Custom hooks with `useState`/`useEffect`/`useCallback` (no Redux, no Zustand).
- Props drilled through component hierarchy (intentional, no global state library).
- React Context used only for `ModerationContext` (mod actions shared across message components).

### 4. Chat Theme System

- Themes defined in `src/lib/themes.ts` as CSS variable overrides.
- 9 built-in themes (default, one-dark, catppuccin, night-owl, monokai, sublime-material, mushu, lunita, twitch).
- Applied via `data-chat-theme` attribute on root element.

### 5. Emote System

- `src/lib/emotes/`: modular providers: `7tv.ts`, `bttv.ts`, `ffz.ts`, `twitch.ts`.
- `parser.ts`: parses message text, replaces emote codes with `<img>` elements.
- `modifiers.ts`: BTTV (`w!`, `h!`, `v!`, `z!`, …) and FFZ (`ffzX`, `ffzW`, `ffzCursed`, …) emote modifier vocabulary and CSS-effect mapping.
- `search.ts`: global emote search across all providers.
- `usage.ts`: local per-emote usage counts, used to rank autocomplete suggestions.
- `hooks.ts`: React hooks for fetching emotes per channel.
- `state.ts`: global emote cache (Map-based, populated from provider APIs).
- Supports BTTV prefix modifiers (attached/chained, e.g. `w!h!KEKW`) and FFZ
  effect words typed after an emote (`KEKW ffzX`). `z!` overlays an emote onto
  the preceding one. FFZ Hidden modifier emotes are excluded from the emote map.
- All emotes rendered via CSS `background-image` with lazy loading.

### 6. Moderation

- **Twitch**: Uses Twitch Helix API (ban, timeout, unban, delete, clear, warn, announce, shoutout, automod, create/end poll, create/manage prediction) via `src/lib/twitch.ts` → proxied through `/api/twitch-proxy`. The proxy forwards `PATCH` so polls can be ended and predictions can be locked, resolved, or canceled.
- **YouTube**: Uses YouTube Data API v3 (delete, timeout, ban) with quota tracking (50 units per ban, 10K daily default). AutoMod approve/deny is executed through the viewer-specific authenticated InnerTube session that received the hold (`LiveChatAutoModMessage` endpoints are kept server-side only).
- Moderation state (`ModerationContext`) shared across message rendering components.

### 7. YouTube Proxy System

- All InnerTube API calls can be routed through a Vercel proxy farm (see `youtube.ts`).
- Hash-based videoId distribution + failover + cooldown for failed proxies. A 403 on a viewer's AutoMod approve/deny action is returned as-is and does not mark the proxy failed.
- The proxy secret stays in `Authorization`; a viewer's OAuth token is forwarded separately as `X-YouTube-User-Authorization` so authenticated live-chat sessions work through the proxy.
- Optional auto-generated PoToken (bot guard token) via `src/lib/potoken.ts`.

### 8. Song Queue

- **Server**: In-memory store (`songQueueStore`) per channel with rate limiting (`songQueueConfig`). RESTful API routes at `/api/song-queue/`.
- **Client**: `useSongQueue` hook polls the server. Messages in chat can be "ingested" to auto-detect song requests.
- **Extraction**: `src/lib/songQueue/extract.ts`: parses YouTube URLs from chat messages, validates via oEmbed/duration probe.
- **Public API**: `src/client/songQueuePublic.ts`: standalone client for embedding song requests on stream pages.

### 9. Music Player

- Fully client-side: songs stored in IndexedDB (`src/lib/musicPlayer/idb.ts`).
- Playlist management, shuffle, repeat, crossfade support.
- Built-in audio element with basic visualization.

### 10. EventSub (Twitch)

- `src/hooks/chat/useEventSub.ts`: manages EventSub subscription lifecycle.
- Individual consumer hooks in `eventSubHelpers/`: hype train, polls, predictions, raids, bits, automod.
- Uses Twitch Helix EventSub API with subscription deduplication.
- Channel point redemptions are **not** EventSub-based (the old broadcaster-only `channel.channel_points_custom_reward_redemption.add` subscription was removed). `eventSubHelpers/useChannelPointRedemptionsPubSub.ts` is the redemption feed: it listens on Twitch PubSub topic `community-points-channel-v1.<broadcasterId>` and works for any authenticated user on any channel. Duplicate redemptions across IRC / PubSub are collapsed by a shared `rewardId+userId` window in `useChatMessages` / `useLiveEvents`. Its connection state is surfaced in the chat header status dropdown. Requires the PubSub websocket origin in the CSP (`wss://pubsub-edge.twitch.tv`).

### 11. Chat History & Lazy Loading

- **Rendered limit vs stored limit**: chat surfaces only keep a bounded in-memory window (the "Max messages in chat" setting, default 200). Older messages stay in IndexedDB (retained for `CHAT_HISTORY_MAX_AGE_HOURS`, currently 5 days).
- **Storage**: `src/lib/chatHistoryStorage.ts` persists every message keyed `platform:id` per channel. A `channel_timestamp` compound index (DB v4) backs paged reads via `getChannelHistory(channel, { before, limit, platforms })`, newest-first internally, returned ascending.
- **Lazy loading**: `src/hooks/chat/useLazyChatHistory.ts` is shared by `ChatDisplay`, `UnifiedChat`, and `YouTubeChat`. Scrolling near the top fetches the next page, prepends it, and restores scroll position (anchoring) so the viewport does not jump. Loaded history is bounded by `maxHistory`.
- **No gaps**: messages that roll off the front of the live window while it is full are absorbed into the loaded-history window, keeping the timeline contiguous. Removals from a not-yet-full window are treated as deletions and are **not** resurrected.
- **Pruning**: `pruneMessages` runs hourly (and on mount) to drop records older than the retention window.

### 12. Chat Stats

- **Entry point**: A bar-chart button in the stream-info actions row (`ChatHeader` → `StreamInfoBar`) opens an overlay next to the "Open Twitch moderator page" button.
- **Stats**: The accumulator in `src/lib/chatStats.ts` folds messages in as they stream by, so counts survive the in-memory window cap (evicted messages are already accounted for). It tracks unique chatters, unique users with the Twitch moderator badge, and repeated-message groups (content normalized case-insensitively with whitespace collapsed), retaining each entry's timestamps. Deleted/optimistic and non-chat message types are excluded from message counts. Message ids are deduped in a session-scoped `seen` set that is never pruned, so a message counted live is not recounted when it reappears in a stream backfill or a recent-messages reload. The accumulator resets on channel switch or when the stream start changes.
- **Per-stream scope**: Stats cover the current broadcast only, bounded below by `streamStartedAt` from `useStreamInfo` (plumbed through `useChatAppState` → `ChatApp` → `ChatDisplay`). Live folding ignores pre-stream messages, and the backfill reads IndexedDB with `getAllChannelHistory(channel, { since: streamStart })`. When the channel is not live there is no stream start, so stats fall back to the current session (non-preloaded messages only). The 5-day IndexedDB retention is unchanged. Only the stats scope is limited.
- **Time window**: A filter bar selects `Stream` (default, the whole current stream), `30 min`, `5 min`, or `2 min`. `buildChatStats(store, limit, window, notBefore)` rebuilds the whole result against `max(notBefore, window cutoff)` (repeated entries need count ≥ 2 inside it. Messages, chatters and mods are counted inside it too). Relative windows are refreshed every 15s while the overlay is open so they age even when chat is idle. The overlay header and footer state which scope is shown ("This stream · since HH:MM" or "This session").
- **Rendering**: `src/components/chat/shared/ChatStatsOverlay.tsx` (styles in `src/styles/chat/ChatStatsOverlay.css`) shows a time-window filter bar, then Chatters and Messages summary cards on one row, followed by an always-expanded Mods section listing the moderator users. The collapsed-by-default "Most repeated messages" section expands the top-50 repeated messages (count ≥ 2), each listing its users. Both lists have a "Copy names" action. Repeated-message counts can be cleared per entry (refresh icon on each row) or all at once via a "reset all counters" button on the section header, which requires a second confirming click. Resetting entries leaves the Chatters/Messages/Mods stats intact.

### 13. Wheel Spin (streamer tool)

- **Entry point**: The "Wheel Spin" item in the Stream tools list (`src/components/chat/shared/StreamerToolsModal.tsx`). Unlike the in-modal tools it opens in a **new browser tab** at `/wheel?channel=<channelKey>`. The tool appears for the streamer and for Twitch moderators when the streamer allowed moderator access (`showStreamTools`).
- **Page**: `src/pages/wheel/index.astro` (manager) and `src/pages/wheel/[wheelId].astro` (shared/public view) both render `src/components/wheel/WheelApp.tsx` (`client:only="react"`). Styles live in `src/styles/wheel.css` and use the app theme tokens (`vars.css` / `themes.css`). The stored chat theme is applied on mount.
- **Canvas wheel**: `src/lib/wheel/draw.ts` (pure) renders the slices with the app accent palette. `wheelGeometry(size)` puts the rim at `0.49` of the canvas so the wheel fills it, and `computeWheelFontSize` binary-searches the largest font satisfying both constraints a label has: its length hub-to-rim (clearing hub and rim by `LABEL_GUTTER`) and its height across the wedge. The wedge is evaluated at the label's **innermost** end, where the slice is narrowest — measuring at the midpoint let long labels on ~16 slices spill into their neighbours. Both bounds shrink with the font, so one search covers them, replacing the old count-based guesswork. `WheelStage` measures the canvas (not the padded stage) so the drawing box matches the layout box. `src/components/wheel/WheelStage.tsx` owns rotation, the 8s CSS spin transition, the spin/win sounds (`public/wheel/wheel-effect.mp3`, `public/wheel/win-effect.mp3`), and derives the winner from the final angle. The option list is snapshotted at spin start (and editing controls are disabled while spinning) so the drawn slices always agree with the announced winner.
- **Data model**: `WheelRecord` (id, name, options[], channelName/channelPlatform, `ownerTokenHash`, timestamps, `isPublic`, `allowDuplicates`, `version`, `history`) in `src/lib/wheel/types.ts`. Options are trimmed and capped at `MAX_WHEEL_OPTIONS` (200) for both the single-add field and the bulk textarea, whose placeholder states the cap; once reached the panel shows a "Maximum of 200 options reached" hint and disables the add actions (removing stays available). Repeats are dropped case-insensitively unless `allowDuplicates` is set, which lets one option fill as many slices as the user adds (so it is more likely to win). Winners are stored newest-first on the record and capped at `MAX_WHEEL_HISTORY`.
- **Persistence**: One JSON file per wheel at `{baseDir}/{wheelId}.json` via `src/server/wheelStore.ts` (atomic temp-file + rename, per-wheel in-process mutex). Base dir resolves from `MIXCHAT_WHEEL_DIR`, else `<cwd>/data/wheels` (`src/server/wheelConfig.ts`). Public reads strip `ownerTokenHash`.
- **API**: `GET/POST /api/wheel` (list by channel / create) and `GET/PATCH/DELETE /api/wheel/[wheelId]` (public-or-owner read: owner-token **or** channel-trust mutations). `POST` with `X-HTTP-Method-Override: DELETE` is supported for proxies. Helpers in `src/server/wheelApi.ts`. Rate-limited via `src/lib/rateLimit.ts`.
- **Authorization**: A `channelKey` is only a claim. The channel-trust path (list, create, channel read, channel mutate/delete) additionally requires a server-verified identity from the httpOnly provider cookie: `src/server/wheelAuth.ts` resolves the Twitch login (`/helix/users`) or YouTube channel id (`channels.list?mine=true`) and compares it to the claimed channel. When the access-token cookie is missing or rejected, it mints a new one from the refresh-token cookie via `src/server/providerTokens.ts` (the same refresh used by `/api/refresh-token`) and retries, so the standalone `/wheel` page self-heals expired sessions. Verified identities are cached briefly. Failed refreshes are cooled down. Owner tokens (IndexedDB, `src/lib/wheel/tokenStore.ts`) bypass the provider check but never grant access to another channel's wheel. Provider lookup failures fail closed (401/403).
- **CRUD**: The manager can create, rename, edit options, toggle **Allow duplicates**, and delete. The toggle lives in the Options panel header, is part of the unsaved draft (so it travels with *Save changes*), and switching it off immediately de-duplicates the draft. `PATCH` takes `allowDuplicates` alongside `options`; when only `options` arrive, the stored flag decides whether repeats survive. Editing requires the owner token, a verified matching channel identity, or moderator access. Sharing controls were removed from the manager once streamer/moderator channel access existed, but the `isPublic` field and `/wheel/<id>` public page remain so previously shared links keep working.
- **Layout**: one column with no sidebar gutter, so the wheel and every panel centre on `.wheel-layout`. The sidebar is `position: absolute` outside the layout box (`right: calc(100% + 24px)`), parked in the page's left margin; below 1920px there is no margin to spare, so it drops back into the flow above the main column. The stage is `min(100%, 100dvh - 250px)` so the wheel and its Spin button still fit a 1080p viewport instead of being cut off. There is no ambient particle background.
- **Spinning**: only the broadcaster may spin. `GET /api/stream-tools/access?channelKey=` answers `owner` / `moderator` / `none` (owner first, then the moderator path of `authorizeChannel`). `WheelApp` starts from `none` and fails closed when the lookup errors, so the spin button stays locked until ownership is confirmed, with a warning banner for moderators; everything else stays editable. A moderator is locked out even when an owner token is present (creating a wheel hands the creator its token), so only the broadcaster role or, on a standalone link with no channel claim, an owner token unlocks the spin. While a spin is running every edit control is disabled, including switching or deleting wheels and clearing winners. `WheelStage` clears its pending spin timeout on unmount so navigating away cannot record a winner for an unmounted view.
- **Live sync**: `WheelApp` polls `GET /api/wheel/<id>` every 2s (name, options, winners) and the channel's wheel list every 10s (creations, deletions, renames). A changed `version` replaces the local copy and, unless the viewer has unsaved edits or a spin in progress, the name/options drafts too. This is how a save, rename, delete, or winner recorded by the other party appears without a reload. Client calls throw `WheelApiError` carrying `status`/`Retry-After`; on a 429 both pollers pause for that duration instead of continuing to hit the limiter. `wheel-list` allows 120/min, matching `wheel-read`, because it is now a polled read. A 404 on the active wheel means it was deleted elsewhere: `forgetWheel` clears the selection, falls through to the next wheel (or the empty state) and records the id in `deletedIdsRef`, which also filters it out of any list response that was already in flight so a stale poll cannot revive it.
- **Winner history**: stored newest-first on the wheel record (capped at `MAX_WHEEL_HISTORY`), so the streamer and moderators see the same list. Recording a winner (`addHistory`) through channel trust is owner-only, so a moderator's channel-authorized PATCH is rejected, though owner-token writes still work. A late history response is ignored when another wheel has been selected since the spin.
- **Winner overlay**: `WheelWinnerOverlay` renders a confetti layer from `src/components/wheel/WheelConfetti.tsx`. Pieces are built once per mount (70 by default, `buildConfetti` takes an injectable `random` for tests) and animated purely in CSS via the `wheel-confetti-fall` keyframe, with each piece's horizontal drift baked into a `--confetti-drift` custom property — no timers and no rAF loop. The layer is `aria-hidden` and `pointer-events: none`, and sits behind the winner box (`position: relative; z-index: 1`) so the name stays readable. It renders nothing under `prefers-reduced-motion: reduce`, which also disables the keyframes as a second line of defence. `PATCH` accepts `addHistory` (prepend) and `clearHistory`.

### 14. Stream tools (streamer + moderator control)

- **Naming**: the UI label is **Stream tools** (the internal settings key `streamerToolsEnabled` is unchanged to avoid a settings migration).
- **Access model**: the streamer's local `streamerToolsEnabled` switch is the master switch and is mirrored to a server-side per-channel setting (`enabled`). A second flag, `allowMods`, is toggled from the Stream tools modal and is only writable by the broadcaster. Under it sits a **Give access to** radio group: `modAccess: "all"` (default) grants every Twitch moderator, `modAccess: "selected"` grants only the entries in `allowedMods` (`{ id, login }`, deduped by id with the login lowercased for display). Selections are bounded: `MAX_ALLOWED_MODS` (500) entries of at most `MAX_MOD_FIELD_LENGTH` (64) chars each. The write route rejects anything larger, and the store drops out-of-limit entries on read and on write. The "Only selected moderators" option expands a checkbox list of the channel's moderators loaded by `useChannelModerators` from `GET /helix/moderation/moderators` through `/api/twitch-proxy` (needs the `moderation:read` scope, so sessions created before it show a reconnect hint instead of the list). Rows render only once the fetch has settled, so a grant never flashes as "not a moderator" while the list is still loading, and grants Twitch no longer lists stay visible marked "not a moderator" so they can be cleared. The checkbox carries an info icon that opens a nested dialog summarising what moderators can and cannot do; Escape unwinds that dialog before the Stream tools one. Public read: `GET /api/stream-tools/settings?channelKey=...`; owner-only write: `PUT /api/stream-tools/settings`, which parses the body with `readJsonBody` (16 KB cap) and rejects malformed or oversized selections (`src/server/streamToolsSettings.ts`, base dir `MIXCHAT_STREAM_TOOLS_DIR` else `<cwd>/data/stream-tools`). Stored settings written before `modAccess`/`allowedMods` existed read back as `"all"` / `[]`.
- **Moderator verification**: `src/server/wheelAuth.ts` accepts `{ allowModerators: true }`. When the claimed identity does not match the channel, and the channel is Twitch, and `enabled && allowMods`, it rejects callers whose Twitch user id is not in `allowedMods` when `modAccess` is `"selected"` (matched on id, so a renamed login cannot move a grant, and a missing id fails closed; this is only a pre-filter), then resolves the caller id + the broadcaster id (`getTwitchUserByLogin`) and checks `GET /helix/moderation/channels?user_id=...` with the caller's own token (scope `user:read:moderated_channels`). Moderator status is cached for 60s; settings are read fresh so revoking access takes effect immediately. **YouTube moderators are never granted access.** Owner tokens and matching identities still work as before.
- **UI gating**: `ChatApp` computes `showStreamTools = enabled && (isOnOwnChannel || (isTwitchModerator && allowMods && (modAccess !== "selected" || allowedMods.some(m => m.id === myUserId))))` via `useStreamToolsSettings` (5s polling). `useModeration` now clears `isModerator` on channel change so a mod of the previous channel cannot keep the button. Desktop builds only ever show tools to the broadcaster.
- **Shared Giveaway**: `useGiveaway` takes an optional `channelKey`; when set, config/phase/timer/entries/winner live in `src/server/streamToolsState.ts` and are polled every 2s (`/api/stream-tools/giveaway`). Every authorized client posts matching chat entries (`action: ingest`, deduped by `platform:userId` server-side), the server auto-reveals once `endsAt` passes, and `action: claimAnnounce` makes exactly one client post the winner message. Poll results and action responses are applied only when their `version` is newer, so a GET that started before start/cancel/reveal cannot revert the UI. Entry fields are length-limited and rebuilt from validated properties, request bodies are capped (`src/server/jsonBody.ts`), and the entry count stays at `MAX_ENTRIES`. The **Recent winners** history is also server-side: the server appends an entry when a giveaway transitions to `revealed` (manual reveal or auto-reveal, never twice for the same giveaway), keeps the newest 50, returns it as `history` on every read and action response, and `action: clearHistory` wipes it for all clients at once. Without a `channelKey` (desktop, tests) the original local behaviour is kept, including the `localStorage` history.
- **Polls**: Native Twitch polls are available to Affiliates and Partners only. `ChatApp` derives `affiliateEligible` from `twitchSession.broadcasterType`; non-eligible broadcasters still see the tool but `PollPanel` shows a warning and disables creation. The **Poll** tool creates and ends Twitch polls through Helix (`POST/PATCH /helix/polls`) using the broadcaster's httpOnly token. `usePollCreator` owns the config form and calls `createTwitchPoll` / `endTwitchPoll`; Twitch limits are enforced in `src/lib/streamerTools/poll.ts` (question 1-60 chars, 2-5 unique choices of 1-25 chars, duration 15-1800s, optional Channel Points and Bits voting). `/createpoll` and `/endpoll` are local commands swallowed before chat; both work for the broadcaster and, when the streamer allows mods, for approved moderators.
- **Mod poll relay**: Helix requires the broadcaster token, so a moderator's create/end request is queued in `src/server/streamToolPollRelay.ts` (`/api/stream-tools/poll`). The broadcaster's open client polls the relay every 2s, claims the pending command, executes it with its own token, and acks the result. Moderator clients read the relayed poll state; the broadcaster mirrors `channel.poll.*` EventSub updates back to the relay so mods see live votes. Only the broadcaster (`authorizeChannel` without `allowModerators`) may claim/ack/sync/reset; approved mods may only enqueue create/end. Pending requests expire after 2 minutes and the relay is in-memory, so it is lost on server restart and requires a single server process. Predictions are not relayed yet and remain broadcaster-only.
- **Predictions**: Native Twitch predictions are available to Affiliates and Partners only and require Channel Points, so `PredictionPanel` shows the same eligibility warning and disables creation for non-eligible broadcasters. The **Prediction** tool creates and manages Channel Points predictions through Helix (`POST/PATCH /helix/predictions`). `usePredictionCreator` owns the config form and exposes `start`, `lock`, `resolve(winningOutcomeId)`, `cancel`, and `startNew`; limits live in `src/lib/streamerTools/prediction.ts` (title 1-45 chars, 2-10 unique outcomes of 1-25 chars, prediction window 30-1800s). Channel Points must be enabled on the channel. `/createprediction` opens the tool, `/lockprediction` locks the active prediction, and `/cancelprediction` cancels it; all are local commands swallowed before reaching chat. Resolving requires choosing the winning outcome in the panel. Live state comes from the existing `channel.prediction.*` EventSub subscriptions and renders in `PredictionPanel`. Requires the `channel:manage:predictions` scope, so existing sessions must reconnect Twitch once.
- **Shared Music Player**: `useMusicPlayer` takes `{ channelKey, isHost }`. Playlists + settings + `isPlaying` are stored in the same channel state and pushed with a 250ms debounce using optimistic concurrency (`PUT /api/stream-tools/music` returns 409 + the current state when the version moved). The version check and write share the channel lock (`mutateStreamToolsStateIfVersion`), so two writers with the same expected version cannot both pass. Switching channels resets the loaded flag, version, and local playlist state, and in-flight responses are ignored for the previous channel. Track fields are length-limited and rebuilt (unknown properties are dropped), and request bodies are capped (`src/server/jsonBody.ts`). Only the broadcaster's client is the **audio host**: it renders the YouTube player and follows `isPlaying`/`volume`/`currentIndex`; moderator clients render a "Playing on the broadcaster's device" placeholder and can still edit playlists, seek state, and play/pause. Existing local IndexedDB playlists are migrated to the server once, and only for the host.
- **Song Queue**: `loadSessionForChannel` / `mutateSessionWithAccess` in `src/server/songQueueApi.ts` add a channel-trust fallback to every owner-token route (read, patch, close, append, item patch/delete, play, announce claim, past read/patch/delete, bulk delete). Creating a channel-bound session (`POST /api/song-queue` with `channelName`/`channelPlatform`) now requires verified channel ownership (broadcaster or allowed moderator), so an anonymous caller cannot poison the queue that `GET /api/song-queue/active` hands out, while queues without a channel still work as standalone share links. `GET /api/song-queue/active` lets an authorized moderator adopt the channel's current open queue without the owner token, and `useSongQueue` polls it every 3s so streamer and moderators stay in sync. A stored ended (tokenless) session is cleared and the channel's newer active queue is adopted on reload and when a poll or refresh discovers the end. `POST /api/song-queue/[sessionId]/announce` claims the current item's "now playing" announcement on the session, so only one open client posts it to chat.
- **Desktop**: `IS_DESKTOP` hides Wheel Spin and Song Queue from the tool list, disables the song-queue hook, and never grants moderator access (the desktop server is local, so a remote moderator cannot reach it).

### 15. First-message marks

- **Existing Twitch marks**: messages carrying the Twitch `first-msg` IRC tag (`TwitchMessage.isFirstMessage`) keep their original badge unchanged: the teal **"First Message"** label/highlight, shown unconditionally regardless of any setting.
- **Setting**: the Global Settings → Chat checkbox **Mark first messages per stream** (`markFirstMessages`, localStorage `mixchat_mark_first_messages_per_stream`, default off) additionally marks each author's first message in the current stream with a **distinct indigo "First message on stream" badge** (label + highlight, `EVENT_CONFIG["first-message-on-stream"]`), client-side, for both platforms (covers tag-less Twitch messages and all YouTube messages).
- **Per-channel scope**: under the checkbox (when enabled) a multi-select lists the user's Twitch following list (`allTwitchChannels` from `useTwitchChannels`, threaded AppContainer → AppSidebar → LoginPanel → EmbedConfigModal) with a search filter. The picked channel logins are stored in `markFirstMessageChannels` (localStorage `mixchat_mark_first_messages_channels`, in the settings backup). An empty selection applies on every channel; otherwise `ChatAppContent` gates the flag with `isFirstMessageChannelInScope(selectedTwitchChannelName, ...)` before passing it to the chat surfaces. Selected channels that are no longer followed render as stale rows so they can be cleared.
- **Badge priority** (`TwitchEventIcon`): the tag badge wins over everything (unchanged); the stream badge renders only when no other event label applies, so cheers/subs keep their own labels. When a message has the tag, the stream badge is suppressed and the teal style is used.
- **Tracking**: `src/hooks/chat/useFirstMessageIds.ts` scans a surface's rendered message list, keyed per platform (`platform:id`), scoped by `channel + streamStartedAt` (session fallback when offline, same rule as chat stats; resets on scope change). Each author keeps their earliest in-scope message id even after it leaves the rendered window, so marks do not drift onto a later message; a later-arriving earlier message (lazy history) moves the mark. `ChatDisplay`, `UnifiedChat`, and `YouTubeChat` each run the hook and pass a per-message `showFirstMessage` prop down to `TwitchMessageContent` / `YouTubeMessageContent` (Twitch effective mark = tag OR setting-gated scan result; the class/style follow which badge applies). YouTube marks render the shared `.message.first-message` style with indigo vars plus the `First message on stream` `yt-event-label`, and only on plain messages (event messages keep their own label).

## Project Conventions

### Naming
- **Components**: PascalCase (e.g., `ChatApp.tsx`, `StreamEmbed.tsx`)
- **Hooks**: `useCamelCase` (e.g., `useChatAppState.ts`, `useTwitchChat.ts`)
- **Libraries**: Lowercase (e.g., `twitch.ts`, `youtube.ts`, `badges.ts`)
- **CSS files**: Match component name (e.g., `ChatApp.css` → component in `ChatApp.tsx`)
- **Test files**: Mirror src structure under `test/` (e.g., `test/lib/emotes.test.ts`)

### Coding Patterns
- **No barrel exports**: Prefer direct imports from file paths.
- **Explicit props**: Components define their own props inline or via exported interface.
- **CSS classes over inline styles**: Components use CSS classes defined in co-located or shared CSS files.
- **Inline styles allowed** for dynamic values (e.g., `style={{ color: userColor }}`).
- **Schema imports**: Use `import pkg from "../../package.json" with { type: "json" };` for JSON imports.
- **Path alias**: `@/*` maps to `./src/*` (TypeScript paths config).

### CSS Architecture
- **Theme variables** in `src/styles/themes.css` and `src/styles/vars.css`.
- **Global reset** in `src/styles/global.css`.
- Each component has an associated CSS file in `src/styles/`.
- Chat-specific CSS lives under `src/styles/chat/`.

### Testing
- **Framework**: Vitest with jsdom environment.
- **Setup**: `test/setup.ts` (global mocks for dialogs, crypto, etc.).
- **Pattern**: Tests mirror the source tree under `test/`.
- **Commands**: `pnpm test`, `pnpm type-check`.

### Storage
- **localStorage keys** are versioned: `mixchat_{key}:v{number}`
- **Storage migration** handled in `src/lib/storageMigration.ts`.
- Settings are backed up to Google Drive via `src/lib/driveSync.ts`.

### Auth Flow

**Web (hosted site):**
1. User clicks "Login with Twitch/Google" → popup opens.
2. Backend handles OAuth callback at `/auth/twitch/callback` or `/auth/youtube/callback`.
3. Session data sent back to opener via `postMessage({ type: "mixchat_session", session })`.
4. Parent window receives, stores in `localStorage`.
5. On app load, sessions restored from `localStorage` via `useAuthSessions`.

**Desktop (public-client OAuth, built with `PUBLIC_APP_PLATFORM=desktop`):**
- `src/lib/constants.ts` exposes `IS_DESKTOP` (from `PUBLIC_APP_PLATFORM`) and the shared `TWITCH_SCOPES`.
- Twitch uses the OAuth **Device Code Grant** via `/api/auth/twitch/device/start` (returns the user code) and `/api/auth/twitch/device/poll` (sets the auth cookies on approval). A Public Twitch app is used, so no client secret. UI: `src/components/TwitchDeviceLoginModal.tsx`.
- Google/YouTube uses **PKCE** with a Google "Desktop app" OAuth client. The desktop build has two delivery modes:
  - **Tauri (`?mixchat-shell=tauri` or `window.__MIXCHAT_SHELL__ === "tauri"`)**: `POST /api/auth/google/desktop/start` creates a pending handoff (`src/server/googleHandoff.ts`) and returns the Google URL. The app opens it with `POST /api/desktop/open`, which spawns the system browser from the local server. The callback recognizes the handoff state, exchanges the code with the stored PKCE verifier, and stores the result in the handoff. The app polls `POST /api/auth/google/desktop/poll`, which sets the httpOnly auth cookies in the app's own cookie jar and returns the session. This avoids the embedded-webview block, the missing `window.opener`, and the page reload caused by navigating the WebView2 window.
  - **Legacy popup**: `/api/auth/google/pkce` issues the challenge and stores the verifier cookie, and the popup callback posts the session through `window.opener`.
- Handoff records live for 10 minutes, are capped at 20, and are single use. Drive-only grants use the same flow with `flow: "drive"`.
- `astro.config.mjs` sets `ssr.noExternal: true` and keeps `jsdom` external in desktop builds. `jsdom` reads a stylesheet relative to `__dirname`, which breaks when bundled into ESM, so the Tauri prepare step installs only `jsdom` next to the server bundle. Everything else is bundled and needs no `node_modules`.
- The embedded Twitch player authenticates with Twitch's own web session, not the API access token. The app opens `/desktop/twitch-activate?url=...` (`src/pages/desktop/twitch-activate.ts`) instead of `twitch.tv` directly, so the shell can promote it to a child webview (`twitch-activate`) that shares the WebView2 profile, and that one login also stores Twitch cookies for the player. The handler only redirects to `https://*.twitch.tv` URLs, so when the shell does not intercept it the flow still works. The device poll then creates the API session. When the device login starts, the shell also opens the login guide (`/help/twitch-login`) in a `twitch-help` child webview, and when the login succeeds or is cancelled it closes both child windows through the `/desktop/twitch-close` route. **Account > Log in to Twitch player** remains as a fallback that opens `https://www.twitch.tv/login` and reloads the main window on close.
- Twitch token refresh (`/api/refresh-token`, `src/server/providerTokens.ts`) omits the client secret for desktop builds (Public app). Google refresh (`refresh-token`, `providerTokens`, `gdrive.ts`) still sends its desktop client secret.
- Desktop builds resolve `/api/parent-domain` from the loopback request host instead of the baked `site`, so the Twitch embed's `parent` matches the app origin.
- Desktop builds bind the server to `127.0.0.1` (`astro.config.mjs` `server.host`), because `@astrojs/node` standalone otherwise resolves the default `host: true` to `0.0.0.0` and would expose `/api/desktop/open` and the OAuth handoff endpoints to the LAN. A runtime `HOST` env var still overrides this.
- The confidential web flows are unchanged. `src/pages/auth/twitch/callback.ts` returns 404 in desktop mode.

## Common Tasks Guide

### Adding a new setting
1. Add state + setter in `useChatSettings` hook.
2. Add prop to `SettingsProps` interface in `src/lib/settings/types.ts`.
3. Thread through `AppContainer` → `LoginPanel` (for sidebar) and/or `OnboardingWizard`.
4. Wire into `ChatApp` if needed for chat behavior.

### Adding a new event type for Twitch EventSub
1. Create consumer hook in `src/hooks/chat/eventSubHelpers/`.
2. Wire subscription in `useEventSub.ts` (add to `subscriptionConfigs`).
3. Connect to `useChatAppState` via `chatAppStateHelpers`.
4. Create banner/notification component in `src/components/chat/shared/`.

### Showing build metadata (version / git branch)

- `src/lib/version.ts` exports `DISPLAY_VERSION` (from `package.json`, prerelease suffix stripped) and `GIT_BRANCH`.
- The branch is **not** read at runtime: `astro.config.mjs` runs `git rev-parse --abbrev-ref HEAD` (falling back to a short SHA when detached, `""` when git is unavailable) and injects it through Vite's `define` as `__GIT_BRANCH__`, so both the SSR template and the client bundle get a plain string.
- `version.ts` guards with `typeof __GIT_BRANCH__ === "string"`, so a context without the define (Vitest) degrades to `""` instead of throwing on an undeclared identifier.
- The footer (`src/layouts/MainLayout.astro`) renders `Branch: <name>` in a chip next to `DISPLAY_VERSION`, and omits it when empty; both chips are hidden below 900px.

### Adding a new emote provider
1. Create provider module in `src/lib/emotes/` (e.g., `newProvider.ts`).
2. Implement fetch by channel and global emotes.
3. Register in `src/lib/emotes/index.ts`.
4. Add search support in `src/lib/emotes/search.ts`.
