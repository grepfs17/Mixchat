import { useEffect, useState } from "react";

interface LandingPageProps {
  onTwitchLogin: () => void;
}

export default function LandingPage({ onTwitchLogin }: LandingPageProps) {
  const [visibleSections, setVisibleSections] = useState<Set<number>>(new Set());
  const [heroLoaded, setHeroLoaded] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setHeroLoaded(true), 100));
    [0, 1, 2, 3, 4, 5, 6].forEach((i) => {
      timers.push(setTimeout(() => {
        setVisibleSections((prev) => new Set(prev).add(i));
      }, 400 + i * 200));
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  const features = [
    {
      title: "Emote Autocomplete",
      description: "Start typing and instantly search through 7TV, BTTV, and FFZ emotes — no browser extensions required.",
      images: [{ src: "/demo/autocompleteemotes.png", alt: "Emote autocomplete popup showing emote search results" }],
      badge: "7TV / BTTV / FFZ",
    },
    {
      title: "Link YouTube Channels",
      description: "Connect your Twitch streamer to their youtube channel to view and participate in both chats simultaneously.",
      images: [{ src: "/demo/link-youtube-channels.png", alt: "YouTube channel linking interface" }],
      badge: "Cross-Platform",
    },
    {
      title: "Mobile Friendly",
      description: "Full chat experience on the go — optimized for responsive layout.",
      images: [
        { src: "/demo/mobile-capture-1.jpg", alt: "Mixchat mobile view showing sidebar and channel list" },
        { src: "/demo/mobile-capture-2.jpg", alt: "Mixchat mobile view showing chat and stream embed" },
      ],
      badge: "Responsive",
    },
    {
      title: "Unified Chat",
      description: "Combine Twitch and YouTube chat into a single stream.",
      images: [{ src: "/demo/unifiedChat.png", alt: "Unified chat view showing both Twitch and YouTube messages together" }],
      badge: "Twitch + YouTube",
    },
    {
      title: "Separated Views",
      description: "Prefer them apart? Split Twitch and YouTube chats side by side for a clean, organized experience.",
      images: [{ src: "/demo/separated-chats.png", alt: "Separated chat view with Twitch and YouTube side by side" }],
      badge: "Flexible Layout",
    },
    {
      title: "Moderator Tools",
      description: "Timeout, ban, and manage chat with context menus and mod actions.",
      images: [{ src: "/demo/moderator-mode-actions-commands.png", alt: "Moderator mode with timeout and ban actions" }],
      badge: "Mod Friendly",
    },
    {
      title: "Full Feature Set",
      description: "Live stream embeds, watchlist notifications, raid detection, and more — all without browser extensions.",
      images: [{ src: "/demo/complete.png", alt: "Complete Mixchat interface with all features visible" }],
      badge: "Everything Built In",
    },
  ];

  return (
    <div className="landing-page">
      <div className="landing-hero" style={{ opacity: heroLoaded ? 1 : 0, transform: heroLoaded ? 'translateY(0)' : 'translateY(20px)' }}>
        <img src="/logo.png" alt="Mixchat" className="landing-hero-logo" />
        <h1 className="landing-hero-title">
          Watch streams. Chat everywhere.
        </h1>
        <p className="landing-hero-subtitle">
          A Twitch &amp; YouTube chat client with 7TV, BTTV, and FFZ emotes built in — no extensions needed.
        </p>
        <button className="landing-cta-button" onClick={onTwitchLogin}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
          </svg>
          Login with Twitch
        </button>
        <div className="landing-hero-meta">
          <span className="landing-meta-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            No account data stored on servers
          </span>
          <span className="landing-meta-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            Your data stays in your browser
          </span>
        </div>
      </div>

      <div className="landing-features">
        {features.map((feature, i) => (
          <section
            key={i}
            className="landing-feature"
            style={{
              opacity: visibleSections.has(i) ? 1 : 0,
              transform: visibleSections.has(i) ? 'translateY(0)' : 'translateY(30px)',
            }}
          >
            <div className="landing-feature-text">
              <h2 className="landing-feature-title">{feature.title}</h2>
              <p className="landing-feature-description">{feature.description}</p>
            </div>
            <div className={`landing-feature-image-container ${feature.images.length > 1 ? 'landing-feature-image-container--dual' : ''}`}>
              <span className="landing-feature-badge">{feature.badge}</span>
              {feature.images.map((img, j) => (
                <img key={j} src={img.src} alt={img.alt} className="landing-feature-image" loading="lazy" />
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="landing-privacy">
        <div className="landing-privacy-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
        </div>
        <h2 className="landing-privacy-title">Your Data, Your Browser</h2>
        <p className="landing-privacy-description">
          Mixchat has <strong>no database</strong>. All your settings, followed channels,
          watchlists, and preferences are stored exclusively in your browser's local storage.
          Nothing is sent to any server. Want to back up? Export your settings. Want to start fresh? Clear your browser data.
        </p>
        <div className="landing-privacy-grid">
          <div className="landing-privacy-card">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <div>
              <strong>Export &amp; Import</strong>
              <span>Back up and restore your settings anytime</span>
            </div>
          </div>
          <div className="landing-privacy-card">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <div>
              <strong>Zero Server Storage</strong>
              <span>No accounts, no profiles, no tracking</span>
            </div>
          </div>
          <div className="landing-privacy-card">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>
            <div>
              <strong>Google Drive Backup</strong>
              <span>Optional cloud backup you control</span>
            </div>
          </div>
          <div className="landing-privacy-card">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <div>
              <strong>Open Source</strong>
              <span>Fully transparent, auditable codebase</span>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-cta">
        <h2 className="landing-cta-title">Ready to chat?</h2>
        <p className="landing-cta-subtitle">Log in with your Twitch account to get started — it takes seconds.</p>
        <button className="landing-cta-button landing-cta-button--large" onClick={onTwitchLogin}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
          </svg>
          Login with Twitch
        </button>
      </section>

      <footer className="landing-footer">
        <span>&copy; 2026 Mixchat by <a href="https://gitea.grepfs.xyz/grepfs17/Mixchat" target="_blank" rel="noopener noreferrer">grepfs17</a> &mdash; Licensed under <a href="https://opensource.org/licenses/MIT" target="_blank" rel="noopener noreferrer">MIT</a></span>
        <div className="landing-footer-links">
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
        </div>
      </footer>
    </div>
  );
}