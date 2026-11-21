import { DISPLAY_VERSION } from "../lib/version";

interface LandingPageProps {
  onTwitchLogin: () => void;
  twitchOnly?: boolean;
}

export default function LandingPage({ onTwitchLogin, twitchOnly }: LandingPageProps) {
  return (
    <div className="landing-page">
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
        </div>
      </footer>
    </div>
  );
}
