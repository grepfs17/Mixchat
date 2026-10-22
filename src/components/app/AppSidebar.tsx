import type { Dispatch, SetStateAction } from "react";
import { FaTimes } from "react-icons/fa";
import LoginPanel from "../LoginPanel";
import { IS_TWITCH_ONLY } from "../../lib/constants";
import type { TwitchChannel } from "../AppContainer";
import type { AuthSessions } from "../../hooks/app/useAuthSessions";

interface AppSidebarProps {
  leftColumnVisible: boolean | undefined;
  setLeftColumnVisible: Dispatch<SetStateAction<boolean | undefined>>;
  sessions: AuthSessions;
  sortedChannels: TwitchChannel[];
  selectedTwitchChannel: string;
  favoriteChannels: string[];
  linkedYoutubeChannelIds: string[];
  onToggleFavorite: (channelId: string) => void;
  onChannelSelect: (channelId: string) => void;
  onTwitchLogin: () => void;
  onTwitchLogout: () => void;
  onYoutubeLogin: () => void;
  onYoutubeLogout: () => void;
  onYoutubeDriveLogin: () => void;
  onManageWatchlist: () => void;
  onManageYoutubeLinks: () => void;
  onGoHome: () => void;
}

export default function AppSidebar({
  leftColumnVisible,
  setLeftColumnVisible,
  sessions,
  sortedChannels,
  selectedTwitchChannel,
  favoriteChannels,
  linkedYoutubeChannelIds,
  onToggleFavorite,
  onChannelSelect,
  onTwitchLogin,
  onTwitchLogout,
  onYoutubeLogin,
  onYoutubeLogout,
  onYoutubeDriveLogin,
  onManageWatchlist,
  onManageYoutubeLinks,
  onGoHome,
}: AppSidebarProps) {
  return (
    <div
      data-sidebar-section
      className={leftColumnVisible ? "" : "sidebar-collapsed"}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0",
        overflow: "hidden",
        overflowY: leftColumnVisible ? "auto" : undefined,
        padding: "0",
        borderRight: "1px solid #1c1c1c",
        background: "linear-gradient(160deg, #131313 0%, #0d0d0d 100%)",
      }}
    >
      <div
        style={{
          display: "none",
          justifyContent: "flex-end",
          padding: "8px",
          backgroundColor: "transparent",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
        className="sidebar-close-btn-container"
      >
        <button
          type="button"
          onClick={() => setLeftColumnVisible(false)}
          style={{
            background: "none",
            border: "none",
            color: "#999",
            cursor: "pointer",
            padding: "4px 8px",
            fontSize: "20px",
            lineHeight: "1",
            display: "flex",
            alignItems: "center",
          }}
          title="Close sidebar"
        >
          <FaTimes size={18} />
        </button>
      </div>
      <LoginPanel
        twitchConnected={!!sessions.twitch}
        twitchUser={sessions.twitch?.displayName}
        twitchProfileImage={sessions.twitch?.profileImageUrl}
        twitchUserName={sessions.twitch?.username}
        twitchUserId={sessions.twitch?.userId}
        twitchChannels={sortedChannels}
        selectedTwitchChannel={selectedTwitchChannel}
        favoriteChannels={favoriteChannels}
        onToggleFavorite={onToggleFavorite}
        onChannelChange={(channelId) => onChannelSelect(channelId)}
        onRequestClose={() => {
          if (window.innerWidth < 1366) setLeftColumnVisible(false);
        }}
        onTwitchLogin={onTwitchLogin}
        onTwitchLogout={onTwitchLogout}
        youtubeConnected={IS_TWITCH_ONLY ? false : !!sessions.youtube}
        youtubeUser={sessions.youtube?.displayName}
        onYoutubeLogin={IS_TWITCH_ONLY ? undefined : onYoutubeLogin}
        onYoutubeLogout={IS_TWITCH_ONLY ? undefined : onYoutubeLogout}
        onManageWatchlist={onManageWatchlist}
        onManageYoutubeLinks={IS_TWITCH_ONLY ? undefined : onManageYoutubeLinks}
        linkedYoutubeChannelIds={linkedYoutubeChannelIds}
        hasYoutubeSession={IS_TWITCH_ONLY ? false : !!sessions.youtube}
        hasDriveScope={IS_TWITCH_ONLY ? false : !!sessions.youtube?.hasDriveScope}
        onYoutubeDriveLogin={IS_TWITCH_ONLY ? () => {} : onYoutubeDriveLogin}
        onReauthYoutube={IS_TWITCH_ONLY ? () => {} : onYoutubeLogin}
        onGoHome={onGoHome}
      />
    </div>
  );
}
