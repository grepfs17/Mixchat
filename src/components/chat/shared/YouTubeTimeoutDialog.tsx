import TimeoutDialog, {
  type TimeoutDialogConfig,
} from "./TimeoutDialog";
import {
  YOUTUBE_MAX_TIMEOUT_SECONDS,
  YOUTUBE_MIN_TIMEOUT_SECONDS,
  YOUTUBE_TIMEOUT_PRESETS,
  formatTimeoutDuration,
} from "../../../lib/youTubeTimeoutPresets";

interface YouTubeTimeoutDialogProps {
  channelId: string;
  username: string;
  onConfirm: (channelId: string, seconds: number, username: string) => void;
  onClose: () => void;
}

const YOUTUBE_CONFIG: TimeoutDialogConfig = {
  presets: YOUTUBE_TIMEOUT_PRESETS,
  minSeconds: YOUTUBE_MIN_TIMEOUT_SECONDS,
  maxSeconds: YOUTUBE_MAX_TIMEOUT_SECONDS,
  formatDuration: formatTimeoutDuration,
  subtitle: "This chat only. Applies to the current live broadcast.",
  defaultPresetIndex: 1, // 5 minutes
};

/**
 * YouTube-flavoured timeout dialog. Renders the unified `TimeoutDialog`
 * with YouTube-specific presets, limits, and subtitle. Maps the
 * platform's `channelId` to the dialog's `userId` prop.
 */
export default function YouTubeTimeoutDialog(
  props: YouTubeTimeoutDialogProps,
) {
  return (
    <TimeoutDialog
      userId={props.channelId}
      username={props.username}
      onConfirm={props.onConfirm}
      onClose={props.onClose}
      config={YOUTUBE_CONFIG}
    />
  );
}
