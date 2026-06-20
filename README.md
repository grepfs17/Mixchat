# Mixchat

Advanced Twitch and YouTube chat client with support for 7TV, BTTV, and FFZ emotes. It provides a unified interface for streaming environments, including stream replies, badges, and native HLS video support.

![Mixchat Demo](https://forgejo.grepfs.xyz/grepfs17/Mixchat/raw/branch/main/public/demo/complete.webp)

## Core Features

- Multi-platform integration for Twitch and YouTube chat.
- Extensive emote support from 7TV, BTTV, and FFZ.
- Enhanced interactive features including stream replies and badges.
- Native HLS support for viewing live streams.

## Technical Foundation

- **Framework**: Astro 6.x
- **UI Library**: React 18.x
- **Adapter**: Node.js (Server-side rendering)
- **APIs**: Twurple (Twitch), youtube-chat (YouTube)

## Getting Started

### Prerequisites

- Node.js (LTS version)
- pnpm (Recommended package manager)

### Installation

```bash
pnpm install
```

### Environment Configuration

1. Copy `.env.example` to `.env`.
2. Configure your Twitch and YouTube API credentials.

### Development

Start the development server:

```bash
pnpm dev
```

The application will be accessible at `http://localhost:3000`.

### Production

Create an optimized build:

```bash
pnpm build
```

The production server uses the Astro Node adapter.

## YouTube Proxy

YouTube can block server IPs with 403 errors. MixChat optionally routes all InnerTube API calls through a separate Vercel proxy that has its own IP and session management. Set `YT_PROXY` and `YT_PROXY_TOKEN` in your `.env` to enable. See [mixchat-yt-proxy](https://github.com/grepfs17/mixchat-yt-proxy) for setup.

## YouTube Live Chat Moderation

When the signed-in YouTube account owns or moderates a linked live stream, MixChat exposes Twitch-style mod actions for YouTube messages: delete, timeout (60s / 5m / 10m / 1h via the inline hover button or context menu) and permanent ban. Actions are routed through the official YouTube Data API v3 (`liveChat.messages.delete` / `liveChat.bans.insert`) using the `youtube.force-ssl` scope that is already requested at sign-in.

The Data API costs **50 quota units per ban** and the default daily quota is **10,000 units** (~200 moderation actions per day before exhaustion). The temporary ban field `banDurationSeconds` accepts values from 1 to 86,400 (1 day). Errors are surfaced as toast notifications; `403 insufficientPermissions` becomes "No permission", `404 modificationNotAllowed` becomes "Can't remove a moderator or the owner's message".

I wouldn't say no to a tip :D
<p>
 <a href="https://ko-fi.com/masterofhollows" >
<img width="100" src="https://cdn.prod.website-files.com/5c14e387dab576fe667689cf/670f5a02fad2b4c413af6d15_support_me_on_kofi_badge_beige.png" alt="Support me on Ko-fi">
 </a>
</p>