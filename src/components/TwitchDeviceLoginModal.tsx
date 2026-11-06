import { createPortal } from "react-dom";
import type { TwitchDeviceState } from "../hooks/app/useAuthSessions";
import { openTwitchActivation } from "../lib/desktopShell";

interface Props {
  device: TwitchDeviceState | null;
  onCancel: () => void;
}

/**
 * Desktop-only modal for the Twitch Device Code Grant flow. Shows the
 * user-code, a link to twitch.tv/activate, and waits for approval.
 */
export default function TwitchDeviceLoginModal({ device, onCancel }: Props) {
  if (!device) return null;

  const waiting = device.status === "waiting";
  const activateUrl =
    device.verificationUri || "https://www.twitch.tv/activate";

  const copyCode = () => {
    try {
      void navigator.clipboard?.writeText(device.userCode);
    } catch {
      /* clipboard may be unavailable */
    }
  };

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
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="twitch-device-title"
        style={{
          background: "var(--color-bg-secondary)",
          border: "1px solid var(--color-border-medium)",
          borderRadius: "var(--radius-2xl)",
          padding: "28px 24px 22px",
          maxWidth: "420px",
          width: "100%",
          boxShadow: "var(--shadow-lg)",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
        }}
      >
        <h2
          id="twitch-device-title"
          style={{
            margin: 0,
            fontSize: "17px",
            fontWeight: 700,
            color: "var(--color-text-white)",
            textAlign: "center",
          }}
        >
          Connect Twitch
        </h2>

        {waiting ? (
          <>
            <p
              style={{
                margin: 0,
                fontSize: "13px",
                color: "var(--color-text-secondary)",
                textAlign: "center",
              }}
            >
              Enter this code on Twitch to finish signing in.
            </p>
            <div
              style={{
                fontFamily: "monospace",
                fontSize: "30px",
                fontWeight: 700,
                letterSpacing: "6px",
                textAlign: "center",
                color: "var(--color-text-white)",
                background: "var(--color-bg-tertiary)",
                borderRadius: "var(--radius-xl)",
                padding: "16px 12px",
                userSelect: "all",
              }}
            >
              {device.userCode}
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button type="button" onClick={copyCode} style={secondaryBtn}>
                Copy code
              </button>
              <button
                type="button"
                onClick={() => openTwitchActivation(activateUrl)}
                style={primaryBtn}
              >
                Open twitch.tv/activate
              </button>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: "12px",
                color: "var(--color-text-muted)",
                textAlign: "center",
              }}
            >
              Waiting for approval…
            </p>
            <button type="button" onClick={onCancel} style={secondaryBtn}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <p
              style={{
                margin: 0,
                fontSize: "13px",
                color: "var(--color-text-primary)",
                textAlign: "center",
              }}
            >
              {device.error || "Twitch sign-in failed."}
            </p>
            <button type="button" onClick={onCancel} style={primaryBtn}>
              Close
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

const primaryBtn: React.CSSProperties = {
  flex: 1,
  background: "var(--color-twitch)",
  color: "#fff",
  border: "none",
  borderRadius: "var(--radius-xl)",
  padding: "11px 16px",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
  textAlign: "center",
};

const secondaryBtn: React.CSSProperties = {
  flex: 1,
  background: "var(--color-bg-tertiary)",
  color: "var(--color-text-primary)",
  border: "1px solid var(--color-border-medium)",
  borderRadius: "var(--radius-xl)",
  padding: "11px 16px",
  fontSize: "14px",
  fontWeight: 600,
  cursor: "pointer",
  textAlign: "center",
};
