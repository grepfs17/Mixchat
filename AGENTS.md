# Mixchat: AI Agent Guide

## Overview

**Mixchat** is an advanced unified live-streaming chat client for **Twitch** and **YouTube**, built with Astro 7.x (SSR + Server) and React 19.x. It surfaces both platforms' chats side-by-side or merged, supports third-party emotes (7TV, BTTV, FFZ) without browser extensions, and includes moderation tools, a song-queue system, giveaways, an HLS video player, music player, and stream-event notifications.
- Complete tech specs and file structure on SPEC.md

## Operating principles
- Working code only. Plausibility is not correctness. Verify before reporting done.
- Never fabricate file paths, APIs, commit hashes, command output, or test results. Read the file, run the command, or say what is unknown.
- Say when a premise appears wrong before implementing around it.
- Ask before proceeding only when a request has multiple plausible interpretations and the choice materially affects the result.
- Touch only what the task requires. Avoid drive-by refactors, formatting, or cleanup.
- Keep communication direct and concise. Skip flattery, filler, ceremonial openings, and emoji.
- Avoid em dashes (U+2014) and semicolons in comments, prose, and user-facing text. Use commas, colons, periods, or parentheses instead.
- Add comments only when necessary. Keep them concise and easy to read, and explain non-obvious intent instead of restating the code.

## Comand execution
- Use always pnpm, avoid npm commands. In case of using npx use pnpx or pnpm dlx instead.
- Prefer running code, tests, linters, and type checks over guessing.
- Read complete errors, logs, and stack traces before fixing them.
- Execute pnpx react-doctor@latest at the end to assure the code is healthy and there is no regressions.
- Update SPEC.md if some file was added or removed, if the file structure or tech specs have changed or a dependency was added or removed.


## Environment Variables

| Variable | Purpose |
|----------|---------|
| `PUBLIC_TWITCH_CLIENT_ID` | Twitch app client ID |
| `TWITCH_CLIENT_SECRET` | Twitch app client secret |
| `PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `YT_PROXY` | Comma-separated YouTube proxy URLs |
| `YT_PROXY_TOKEN` | Auth token for YouTube proxies |
| `YT_POTOKEN` | PoToken (bot guard) for YouTube API |
| `YT_VISITOR_DATA` | Visitor data for YouTube API |
| `YT_CLIENT` | YouTube client type (WEB, TVHTML5, etc.) |
| `YT_GENERATE_SESSION_LOCALLY` | Whether to generate YouTube session locally |
| `YT_USER_AGENT` | Custom UA for YouTube requests |
| `YT_CHAT_POLL_MIN_MS` | Minimum poll interval for live chat |
| `YT_METADATA_POLL_MIN_MS` | Minimum poll interval for metadata |
| `YT_DEBUG` | Enable YouTube debug logging |
| `ORIGIN` | Origin URL for referrer header |
| `PUBLIC_URL` | Public-facing application URL |
| `PUBLIC_TWITCH_ONLY` | Set to `"true"` to disable all Google/YouTube integrations (auth, chat, drive) |

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Start dev server (localhost:3000) |
| `pnpm build` | Production build (Astro SSR) |
| `pnpm preview` | Preview production build |
| `pnpm test` | Run Vitest test suite |
| `pnpm type-check` | Run TypeScript type checker (`tsc --noEmit`) |
| `pnpm astro` | Astro CLI |
| `pnpm doctor` | Run react-doctor for code quality |
