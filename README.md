# Mixchat

Advanced Twitch and YouTube chat client with support for 7TV, BTTV, and FFZ emotes. It provides a unified interface for streaming environments, including stream replies, badges, and native HLS video support.
![Mixchat Demo](https://gitea.grepfs.xyz/grepfs17/Mixchat/raw/branch/main/public/demo/complete.png)

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

I wouldn't say no to a tip :D
<p>
 <a href="https://ko-fi.com/masterofhollows" >
<img width="100" src="https://cdn.prod.website-files.com/5c14e387dab576fe667689cf/670f5a02fad2b4c413af6d15_support_me_on_kofi_badge_beige.png" alt="Support me on Ko-fi">
 </a>
</p>