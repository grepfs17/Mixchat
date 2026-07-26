import { useState } from "react";
import { FaTimes } from "react-icons/fa";

interface BannerCloseButtonProps {
  onDismiss: () => void;
  ariaLabel: string;
  /**
   * Optional CSS class prefix for tone-specific styling. The wrapper,
   * tooltip, and button each receive `{tone}-close-wrapper`,
   * `{tone}-close-tooltip`, and `{tone}-close` respectively, so existing
   * per-tone CSS continues to work.
   */
  toneClass?: string;
}

/**
 * Banner close button with the "Press again to close" confirm pattern.
 *
 * The first click reveals a tooltip; the second click (before blur)
 * commits the dismiss. This matches the previous in-line behaviour that
 * was duplicated across CelebrationBanner, HypeTrainBanner, PollBanner,
 * and PredictionBanner.
 */
export default function BannerCloseButton({
  onDismiss,
  ariaLabel,
  toneClass = "banner",
}: BannerCloseButtonProps) {
  const [confirmClose, setConfirmClose] = useState(false);

  return (
    <div className={`banner-close-wrapper ${toneClass}-close-wrapper`}>
      {confirmClose && (
        <span className={`banner-close-tooltip ${toneClass}-close-tooltip`}>
          Press again to close
        </span>
      )}
      <button type="button"
        className={`banner-close ${toneClass}-close`}
        onClick={() => {
          if (confirmClose) {
            onDismiss();
          } else {
            setConfirmClose(true);
          }
        }}
        onBlur={() => setConfirmClose(false)}
        aria-label={ariaLabel}
      >
        <FaTimes size={14} />
      </button>
    </div>
  );
}
