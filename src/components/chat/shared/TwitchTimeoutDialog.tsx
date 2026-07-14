import TimeoutDialog, {
  type TimeoutDialogConfig,
} from "./TimeoutDialog";
import {
  TWITCH_MAX_TIMEOUT_SECONDS,
  TWITCH_MIN_TIMEOUT_SECONDS,
  TWITCH_TIMEOUT_PRESETS,
  formatTwitchTimeoutDuration,
} from "../../../lib/twitchTimeoutPresets";

interface TwitchTimeoutDialogProps {
  userId: string;
  username: string;
  onConfirm: (userId: string, seconds: number, username: string) => void;
  onClose: () => void;
}

const TWITCH_CONFIG: TimeoutDialogConfig = {
  presets: TWITCH_TIMEOUT_PRESETS,
  minSeconds: TWITCH_MIN_TIMEOUT_SECONDS,
  maxSeconds: TWITCH_MAX_TIMEOUT_SECONDS,
  formatDuration: formatTwitchTimeoutDuration,
  subtitle: "Applies to this channel. Max 14 days.",
  defaultPresetIndex: 3, // 5 minutes
};

/**
 * Twitch-flavoured timeout dialog. Renders the unified `TimeoutDialog`
 * with Twitch-specific presets, limits, and subtitle.
 */
export default function TwitchTimeoutDialog(props: TwitchTimeoutDialogProps) {
  return <TimeoutDialog {...props} config={TWITCH_CONFIG} />;
}
