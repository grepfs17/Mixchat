import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { isFirefox } from "../lib/device";

const STORAGE_KEY = "mixchat.firefox-etp-notice-dismissed";

export default function FirefoxTrackingProtectionModal() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isFirefox()) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === "1") return;
    } catch {
      /* localStorage unavailable (private mode / blocked) — still show once */
    }
    setVisible(true);
  }, []);

  useEffect(() => {
    const handler = () => setVisible(true);
    window.addEventListener("mixchat:show-firefox-notice", handler);
    return () =>
      window.removeEventListener("mixchat:show-firefox-notice", handler);
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  if (!visible) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.75)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        animation: "fadeIn 0.2s ease",
      }}
      onClick={dismiss}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="firefox-etp-title"
        style={{
          background: "var(--color-bg-secondary)",
          border: "1px solid var(--color-border-medium)",
          borderRadius: "var(--radius-2xl)",
          padding: "28px 24px 22px",
          maxWidth: "380px",
          width: "100%",
          boxShadow: "var(--shadow-lg)",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: "28px",
              marginBottom: "8px",
              lineHeight: 1,
            }}
          >
            🛡️
          </div>
          <h2
            id="firefox-etp-title"
            style={{
              margin: 0,
              fontSize: "17px",
              fontWeight: 700,
              color: "var(--color-text-white)",
              letterSpacing: "-0.01em",
            }}
          >
            Firefox: fix Twitch Player login
          </h2>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: "13px",
              color: "var(--color-text-secondary)",
            }}
          >
            Firefox blocks third-party cookies by default, so the Twitch player
            can't tell you're logged in, subscribers still will get ad breaks.
            To fix it follow these steps:
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <Step
            number={1}
            title="Click the shield icon"
            description="in the address bar, left of the URL."
          />
          <Step
            number={2}
            title="Turn off Enhanced Tracking Protection"
            description="toggle it off for this site."
          />
          <Step
            number={3}
            title="Reload the page"
            description="the Twitch player can now sign you in and skip ads for subscribers."
          />
        </div>

        <button
          type="button"
          onClick={dismiss}
          style={{
            background: "var(--color-twitch)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-xl)",
            padding: "11px 0",
            fontSize: "15px",
            fontWeight: 600,
            cursor: "pointer",
            width: "100%",
            marginTop: "4px",
          }}
        >
          Got it!
        </button>
      </div>
    </div>,
    document.body,
  );
}

interface StepProps {
  number: number;
  title: string;
  description: string;
}

function Step({ number, title, description }: StepProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "14px",
        background: "var(--color-bg-tertiary)",
        borderRadius: "var(--radius-xl)",
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          flexShrink: 0,
          width: "28px",
          height: "28px",
          borderRadius: "var(--radius-full)",
          background: "rgba(145,70,255,0.15)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--color-text-white)",
          fontSize: "14px",
          fontWeight: 700,
        }}
      >
        {number}
      </div>
      <p
        style={{
          margin: 0,
          fontSize: "14px",
          color: "var(--color-text-primary)",
          lineHeight: "1.4",
        }}
      >
        <strong style={{ color: "var(--color-text-white)", fontWeight: 600 }}>
          {title}
        </strong>{" "}
        {description}
      </p>
    </div>
  );
}
