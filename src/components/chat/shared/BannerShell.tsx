import type { ReactNode } from "react";
import BannerCloseButton from "./BannerCloseButton";

type BannerTone =
  | "celebration"
  | "hype-train"
  | "poll"
  | "prediction"
  | "pinned";

interface BannerShellProps {
  tone: BannerTone;
  /** `aria-live` value for the alert container. */
  ariaLive: "polite" | "assertive";
  /** Aria-label for the close button, e.g. `"Dismiss poll notification"`. */
  closeAriaLabel: string;
  /** The badge node (e.g. `<span className="poll-banner-badge">Live Poll</span>`). */
  badge: ReactNode;
  /** Icon node (e.g. `<FaPoll />`). */
  icon: ReactNode;
  /** Title node rendered next to the icon (varies per banner). */
  title: ReactNode;
  /** Called when the user double-clicks the close button. */
  onDismiss: () => void;
  /** Body content. Each banner controls its own body class names. */
  children: ReactNode;
  /** Optional footer content. Each banner controls its own footer class names. */
  footer?: ReactNode;
  /**
   * Optional content rendered between the wrapper and the header. Used by
   * Celebration (confetti strip) and HypeTrain (progress overlay).
   */
  beforeChildren?: ReactNode;
}

/**
 * Shared shell for Celebration, HypeTrain, Poll, and Prediction banners.
 * Per-tone class names preserve the existing per-banner CSS.
 */
export default function BannerShell({
  tone,
  ariaLive,
  closeAriaLabel,
  badge,
  icon,
  title,
  onDismiss,
  children,
  footer,
  beforeChildren,
}: BannerShellProps) {
  return (
    <div className={`banner-shell ${tone}-banner`} role="alert" aria-live={ariaLive}>
      {beforeChildren}
      <div className={`banner-header ${tone}-header`}>
        <div className={`banner-title ${tone}-title`}>
          {badge}
          {icon}
          {title}
        </div>
        <BannerCloseButton onDismiss={onDismiss} ariaLabel={closeAriaLabel} toneClass={tone} />
      </div>
      <div className={`banner-body ${tone}-body`}>{children}</div>
      {footer && (
        <div className={`banner-footer ${tone}-footer`}>{footer}</div>
      )}
    </div>
  );
}
