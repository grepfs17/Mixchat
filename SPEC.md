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
| `@twurple/api`, `@twurple/auth`, `@twurple/chat` | Twitch IRC chat, Helix API, EventSub |
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
│   │   │   ├── SplitLayout.tsx
│   │   │   └── ThemeMascots.tsx
│   │   ├── AppContainer.tsx # Root app component (layout, sidebar, auth, grid)
│   │   ├── LoginPanel.tsx   # Sidebar with channel list + settings
│   │   ├── StreamEmbed.tsx  # Twitch embed / HLS player
│   │   ├── StreamGrid.tsx   # Grid of live channels
│   │   ├── LandingPage.tsx  # Unauthenticated landing
│   │   ├── OnboardingWizard.tsx  # First-run setup wizard
│   │   └── ...              # Misc components (WatchlistManager, YouTubeLinker, etc.)
│   ├── hooks/               # Custom React hooks
│   │   ├── app/             # App-level hooks (auth, channels, settings, embed, stream monitor)
│   │   ├── chat/            # Chat hooks (state, messages, moderation, emotes, song queue)
│   │   │   ├── chatAppStateHelpers/  # Decomposed helpers for ChatApp state
│   │   │   ├── twitchChatHelpers/     # Twitch connection lifecycle helpers
│   │   │   └── eventSubHelpers/       # EventSub consumer hooks
│   │   └── ui/              # Generic UI hooks (countdown timer)
│   ├── lib/                 # Pure business logic & utilities (no React import)
│   │   ├── twitch.ts        # Twitch Helix API client (moderation, users, streams, follows)
│   │   ├── youtube.ts       # YouTube InnerTube client (proxy-aware, PoToken, throttled)
│   │   ├── emotes/          # Emote system (7TV, BTTV, FFZ, Twitch, search, parser)
│   │   ├── songQueue/       # Song queue system (server+client: types, IDB, API, extraction)
│   │   ├── musicPlayer/     # Music player (client-side IndexedDB)
│   │   ├── streamerTools/   # Giveaways, history, chat helpers, past playlists
│   │   ├── settings/        # Settings types
│   │   ├── themes.ts        # Chat themes (CSS variable definitions)
│   │   ├── types.ts         # Core types (TwitchMessage, PlatformSession, ChatTheme, etc.)
│   │   ├── constants.ts     # App constants (mod commands, YT user agent)
│   │   ├── oauthSession.ts  # OAuth popup + postMessage listener
│   │   ├── google.ts        # Google API fetch wrapper (rate limiting, quota tracking)
│   │   ├── googleDrive.ts   # Google Drive backup/restore for settings
│   │   └── ...              # Badges, chat history, chat colors, potoken, emojiShortcodes, etc.
│   ├── server/              # Server-side state stores
│   │   ├── songQueueStore.ts   # In-memory song queue storage
│   │   ├── songQueueConfig.ts  # Song queue configuration (rate limits, etc.)
│   │   └── songQueueApi.ts     # Song queue API route helpers
│   ├── pages/               # Astro pages + API routes
│   │   ├── index.astro      # Main app page
│   │   ├── channel/[name].astro  # Direct channel link page
│   │   ├── s/[sessionId].astro   # Embed page (stripped-down chat)
│   │   ├── auth/            # OAuth callback pages (twitch, youtube)
│   │   └── api/             # API endpoints (song-queue, youtube-proxy, moderation, etc.)
│   ├── styles/              # CSS stylesheets (theme system, component styles)
│   ├── contexts/            # React contexts (ModerationContext)
│   └── client/              # Client-side entry points (songQueuePublic)
├── test/                    # Mirror of src structure for tests
├── public/                  # Static assets
```

## Architecture & Key Patterns

### 1. Data Flow

- **Auth**: OAuth popup → callback page → postMessage → parent window stores session in localStorage
- **Twitch Chat**: Twurple IRC client → `useTwitchChat` hook → message handler → `useChatMessages` → renders via ChatDisplay
- **YouTube Chat**: Server-side polling via `youtubei.js` InnerTube → SSE or periodic fetch → `YouTubeChat` component
- **Storage**: All user settings persisted to `localStorage` with versioned keys. Google Drive backup/restore available.
- **Server State**: Song queue uses server-side in-memory store (`songQueueStore`) with live polling via API routes.

### 2. Component Architecture

- **AppContainer** is the root component managing layout (sidebar + main area + modals), orchestrating sessions, channels, embed, settings, and stream monitoring.
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

- `src/lib/emotes/` — modular providers: `7tv.ts`, `bttv.ts`, `ffz.ts`, `twitch.ts`.
- `parser.ts` — parses message text, replaces emote codes with `<img>` elements.
- `search.ts` — global emote search across all providers.
- `hooks.ts` — React hooks for fetching emotes per channel.
- `state.ts` — global emote cache (Map-based, populated from provider APIs).
- All emotes rendered via CSS `background-image` with lazy loading.

### 6. Moderation

- **Twitch**: Uses Twitch Helix API (ban, timeout, unban, delete, clear, warn, announce, shoutout, automod) via `src/lib/twitch.ts` → proxied through `/api/twitch-proxy`.
- **YouTube**: Uses YouTube Data API v3 (delete, timeout, ban) with quota tracking (50 units per ban, 10K daily default).
- Moderation state (`ModerationContext`) shared across message rendering components.

### 7. YouTube Proxy System

- All InnerTube API calls can be routed through a Vercel proxy farm (see `youtube.ts`).
- Hash-based videoId distribution + failover + cooldown for failed proxies.
- Optional auto-generated PoToken (bot guard token) via `src/lib/potoken.ts`.

### 8. Song Queue

- **Server**: In-memory store (`songQueueStore`) per channel with rate limiting (`songQueueConfig`). RESTful API routes at `/api/song-queue/`.
- **Client**: `useSongQueue` hook polls the server. Messages in chat can be "ingested" to auto-detect song requests.
- **Extraction**: `src/lib/songQueue/extract.ts` — parses YouTube URLs from chat messages, validates via oEmbed/duration probe.
- **Public API**: `src/client/songQueuePublic.ts` — standalone client for embedding song requests on stream pages.

### 9. Music Player

- Fully client-side: songs stored in IndexedDB (`src/lib/musicPlayer/idb.ts`).
- Playlist management, shuffle, repeat, crossfade support.
- Built-in audio element with basic visualization.

### 10. EventSub (Twitch)

- `src/hooks/chat/useEventSub.ts` — manages EventSub subscription lifecycle.
- Individual consumer hooks in `eventSubHelpers/`: hype train, polls, predictions, raids, channel points, bits, automod.
- Uses Twitch Helix EventSub API with subscription deduplication.

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
1. User clicks "Login with Twitch/Google" → popup opens.
2. Backend handles OAuth callback at `/api/auth/twitch/callback` or `/api/auth/youtube/callback`.
3. Session data sent back to opener via `postMessage({ type: "mixchat_session", session })`.
4. Parent window receives, stores in `localStorage`.
5. On app load, sessions restored from `localStorage` via `useAuthSessions`.

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

### Adding a new emote provider
1. Create provider module in `src/lib/emotes/` (e.g., `newProvider.ts`).
2. Implement fetch by channel and global emotes.
3. Register in `src/lib/emotes/index.ts`.
4. Add search support in `src/lib/emotes/search.ts`.
