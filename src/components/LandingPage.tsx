import { DISPLAY_VERSION } from "../lib/version";
import { FaTwitch, FaYoutube } from "react-icons/fa";
import FloatingEmotes from "./FloatingEmotes";

interface LandingPageProps {
  onTwitchLogin: () => void;
  twitchOnly?: boolean;
}

export default function LandingPage({ onTwitchLogin, twitchOnly }: LandingPageProps) {
  return (
    <div className="landing-page">
      <FloatingEmotes />
      <main className="landing-hero">
        <img
          src={twitchOnly ? "/logo-twitch.webp" : "/logo.webp"}
          alt="Mixchat"
          className="landing-hero-logo"
        />
        <button type="button" className="landing-cta-button" onClick={onTwitchLogin}>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
          </svg>
          Login with Twitch
        </button>
      </main>

      <section className="landing-intro">
        <p className="landing-intro-description">
          Mixchat is a unified live chat client for Twitch and YouTube. Follow
          your streams, chat with third-party emotes, and moderate both platforms
          from one place, without browser extensions.
        </p>
        <div className="landing-platforms">
          <span className="landing-platform">
            <span className="landing-platform-icon" style={{ color: "#9146ff" }}>
              <FaTwitch aria-hidden="true" />
            </span>
            Twitch
          </span>
          <span className="landing-platform">
            <span className="landing-platform-icon" style={{ color: "#ff0000" }}>
              <FaYoutube aria-hidden="true" />
            </span>
            YouTube
          </span>
          <span className="landing-platform">
            <span
              className="landing-platform-icon"
              style={{ color: "#00b4ff" }}
              aria-hidden="true"
            >
              <svg width="18" height="13" viewBox="8 24 108.2 80" fill="currentColor">
                <path d="M90.986 45.953L95.9196 37.3498L98.584 32.801L93.65 24.1978V24H67.3036L77.1712 41.2064L79.9344 45.953H90.986Z" />
                <path d="M36.6158 103.703L66.2184 52.0842L69.8692 45.7554L60.0016 28.549L57.2388 24.099H15.598L10.6642 32.7022L8 37.251L12.9338 45.8542V46.052H44.5098L19.841 89.068L16.3874 95.1992L21.3212 103.802V104H36.6158" />
                <path d="M77.862 103.703H92.9592L112.694 69.29L116.148 63.357L111.214 54.7538V54.556H96.0184L86.1508 71.7624L85.46 73.048L75.5924 55.8415L74.902 54.556L65.0344 71.7624L62.2716 76.5088L77.0728 102.318L77.862 103.703Z" />
              </svg>
            </span>
            7TV
          </span>
          <span className="landing-platform">
            <span className="landing-platform-icon" aria-hidden="true">
              <img src="/marquee/bttv.webp" alt="" width="16" height="16" />
            </span>
            BTTV
          </span>
          <span className="landing-platform">
            <span className="landing-platform-icon" aria-hidden="true">
              <img src="/marquee/ffz.webp" alt="" width="16" height="16" />
            </span>
            FFZ
          </span>
        </div>
      </section>

      <section className="landing-privacy">
        <div className="landing-privacy-icon">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        </div>
        <h2 className="landing-privacy-title">Your Data, Your Device</h2>
        <p className="landing-privacy-description">
          Mixchat has <strong>no database</strong>. All your settings, followed
          channels, watchlists, and preferences are stored exclusively on your
          device. Nothing is sent to any server. Want to back up? Export your
          settings. Want to start fresh? Clear the app data.
        </p>
        <div className="landing-privacy-grid">
          <div className="landing-privacy-card">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <div>
              <strong>Export &amp; Import</strong>
              <span>Back up and restore your settings anytime</span>
            </div>
          </div>
          <div className="landing-privacy-card">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <div>
              <strong>Zero Server Storage</strong>
              <span>No accounts, no profiles, no tracking</span>
            </div>
          </div>
          {!twitchOnly && (
            <div className="landing-privacy-card">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
              <div>
                <strong>Google Drive Backup</strong>
                <span>Optional cloud backup you control</span>
              </div>
            </div>
          )}
          <div className="landing-privacy-card">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div>
              <strong>Open Source</strong>
              <span>Fully transparent, auditable codebase</span>
            </div>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <span>
          &copy; 2026 Mixchat{". "}
          {DISPLAY_VERSION}
        </span>
        <div className="landing-footer-links">
          <a
            href="https://github.com/grepfs17/Mixchat"
            target="_blank"
            rel="noopener noreferrer"
          >
            Mixchat
          </a>
          <a
            href="https://github.com/grepfs17/MixchatDesktop"
            target="_blank"
            rel="noopener noreferrer"
          >
            Mixchat Desktop
          </a>
          <a
            href="https://www.gnu.org/licenses/agpl-3.0.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            AGPL-3.0
          </a>
        </div>
      </footer>
    </div>
  );
}
