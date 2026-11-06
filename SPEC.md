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
│   │   ├── streamerTools/   # Giveaways, history, chat helpers, past playlists
│   │   ├── streamTools/     # Shared stream-tools state types + client API
│   │   ├── wheel/           # Wheel Spin (types, client API, canvas draw, IDB owner tokens)
│   │   ├── settings/        # Settings types
│   │   ├── themes.ts        # Chat themes (CSS variable definitions)
│   │   ├── types.ts         # Core types (TwitchMessage, PlatformSession, ChatTheme, etc.)
│   │   ├── constants.ts     # App constants (mod commands, YT user agent)
│   │   ├── version.ts       # Display version + the git branch baked in at build time
│   │   ├── oauthSession.ts  # OAuth popup + postMessage listener
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
│   │   ├── streamToolsSettings.ts # Per-channel Stream tools access settings (enabled, allowMods)
│   │   ├── streamToolsState.ts    # Shared Giveaway + Music Player state (versioned, atomic)
│   │   ├── youtubeAuth.ts      # Stable viewer identity/session keys for authenticated YouTube live chat
│   │   └── providerTokens.ts   # Refresh provider access tokens from httpOnly refresh cookies
│   ├── pages/               # Astro pages + API routes
│   │   ├── index.astro      # Main app page
│   │   ├── channel/[name].astro  # Direct channel link page
│   │   ├── s/[sessionId].astro   # Embed page (stripped-down chat)
│   │   ├── wheel/index.astro     # Wheel Spin manager (opens from Stream tools in a new tab)
│   │   ├── wheel/[wheelId].astro # Shared/public wheel page
│   │   ├── dev/chat-preview.astro # Dev-only chat styling gallery (blocked in prod by middleware)
│   │   ├── auth/            # OAuth callback pages (twitch, youtube)
│   │   └── api/             # API endpoints (song-queue, wheel, stream-tools, youtube-proxy, moderation, etc.)
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

- **Twitch**: Uses Twitch Helix API (ban, timeout, unban, delete, clear, warn, announce, shoutout, automod) via `src/lib/twitch.ts` → proxied through `/api/twitch-proxy`.
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
- **Spinning**: only the broadcaster may spin. `GET /api/stream-tools/access?channelKey=` answers `owner` / `moderator` / `none` (owner first, then the moderator path of `authorizeChannel`) and `WheelApp` disables the spin button for moderators with a warning banner; everything else stays editable. While a spin is running every edit control is disabled, including switching or deleting wheels and clearing winners.
- **Live sync**: `WheelApp` polls `GET /api/wheel/<id>` every 2s (name, options, winners) and the channel's wheel list every 10s (creations, deletions, renames). A changed `version` replaces the local copy and, unless the viewer has unsaved edits or a spin in progress, the name/options drafts too. This is how a save, rename, delete, or winner recorded by the other party appears without a reload. Client calls throw `WheelApiError` carrying `status`/`Retry-After`; on a 429 both pollers pause for that duration instead of continuing to hit the limiter. `wheel-list` allows 120/min, matching `wheel-read`, because it is now a polled read. A 404 on the active wheel means it was deleted elsewhere: `forgetWheel` clears the selection, falls through to the next wheel (or the empty state) and records the id in `deletedIdsRef`, which also filters it out of any list response that was already in flight so a stale poll cannot revive it.
- **Winner history**: stored newest-first on the wheel record (capped at `MAX_WHEEL_HISTORY`), so the streamer and moderators see the same list. `PATCH` accepts `addHistory` (prepend) and `clearHistory`.

### 14. Stream tools (streamer + moderator control)

- **Naming**: the UI label is **Stream tools** (the internal settings key `streamerToolsEnabled` is unchanged to avoid a settings migration).
- **Access model**: the streamer's local `streamerToolsEnabled` switch is the master switch and is mirrored to a server-side per-channel setting (`enabled`). A second flag, `allowMods`, is toggled from the Stream tools modal and is only writable by the broadcaster. The checkbox carries an info icon that opens a nested dialog summarising what moderators can and cannot do; Escape unwinds that dialog before the Stream tools one. Public read: `GET /api/stream-tools/settings?channelKey=...`; owner-only write: `PUT /api/stream-tools/settings` (`src/server/streamToolsSettings.ts`, base dir `MIXCHAT_STREAM_TOOLS_DIR` else `<cwd>/data/stream-tools`).
- **Moderator verification**: `src/server/wheelAuth.ts` accepts `{ allowModerators: true }`. When the claimed identity does not match the channel, and the channel is Twitch, and `enabled && allowMods`, it resolves the caller id + the broadcaster id (`getTwitchUserByLogin`) and checks `GET /helix/moderation/channels?user_id=...` with the caller's own token (scope `user:read:moderated_channels`). Moderator status is cached for 60s; settings are read fresh so revoking access takes effect immediately. **YouTube moderators are never granted access.** Owner tokens and matching identities still work as before.
- **UI gating**: `ChatApp` computes `showStreamTools = enabled && (isOnOwnChannel || (isTwitchModerator && allowMods))` via `useStreamToolsSettings` (5s polling). `useModeration` now clears `isModerator` on channel change so a mod of the previous channel cannot keep the button. Desktop builds only ever show tools to the broadcaster.
- **Shared Giveaway**: `useGiveaway` takes an optional `channelKey`; when set, config/phase/timer/entries/winner live in `src/server/streamToolsState.ts` and are polled every 2s (`/api/stream-tools/giveaway`). Every authorized client posts matching chat entries (`action: ingest`, deduped by `platform:userId` server-side), the server auto-reveals once `endsAt` passes, and `action: claimAnnounce` makes exactly one client post the winner message. Without a `channelKey` (desktop, tests) the original local behaviour is kept.
- **Shared Music Player**: `useMusicPlayer` takes `{ channelKey, isHost }`. Playlists + settings + `isPlaying` are stored in the same channel state and pushed with a 250ms debounce using optimistic concurrency (`PUT /api/stream-tools/music` returns 409 + the current state when the version moved). Only the broadcaster's client is the **audio host**: it renders the YouTube player and follows `isPlaying`/`volume`/`currentIndex`; moderator clients render a "Playing on the broadcaster's device" placeholder and can still edit playlists, seek state, and play/pause. Existing local IndexedDB playlists are migrated to the server once, and only for the host.
- **Song Queue**: `loadSessionForChannel` / `mutateSessionWithAccess` in `src/server/songQueueApi.ts` add a channel-trust fallback to every owner-token route (read, patch, close, append, item patch/delete, play, past read/patch/delete, bulk delete). `GET /api/song-queue/active` lets an authorized moderator adopt the channel's current open queue without the owner token, and `useSongQueue` polls it every 3s so streamer and moderators stay in sync.
- **Desktop**: `IS_DESKTOP` hides Wheel Spin and Song Queue from the tool list, disables the song-queue hook, and never grants moderator access (the desktop server is local, so a remote moderator cannot reach it).

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
- Google/YouTube uses **PKCE** with a Google "Desktop app" OAuth client: `/api/auth/google/pkce` issues the challenge and stores the verifier cookie. `src/pages/auth/youtube/callback.ts` exchanges the code with `code_verifier` **and** the client secret (Google rejects secretless PKCE for its token endpoint, even for desktop clients).
- Twitch token refresh (`/api/refresh-token`, `src/server/providerTokens.ts`) omits the client secret for desktop builds (Public app). Google refresh (`refresh-token`, `providerTokens`, `gdrive.ts`) still sends its desktop client secret.
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
