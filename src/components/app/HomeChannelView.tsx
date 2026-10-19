import type { Dispatch, SetStateAction } from "react";
import {
  FaChevronLeft,
  FaChevronRight,
  FaTwitch,
  FaYoutube,
  FaStar,
} from "react-icons/fa";
import StreamGrid from "../StreamGrid";
import type { StreamTransitionInfo } from "../StreamGrid";
import { IS_TWITCH_ONLY } from "../../lib/constants";
import type { PlatformSession } from "../../lib/types";
import type { TwitchChannel } from "../AppContainer";

interface MyChannelInfo {
  description: string;
  followerCount: number | null;
}

interface HomeChannelViewProps {
  twitchSession: PlatformSession;
  youtubeSession?: PlatformSession;
  myChannelInfo: MyChannelInfo;
  leftColumnVisible: boolean | undefined;
  setLeftColumnVisible: Dispatch<SetStateAction<boolean | undefined>>;
  setShowFavoriteChannels: Dispatch<SetStateAction<boolean>>;
  onChannelSelect: (
    channelId: string,
    transitionInfo?: StreamTransitionInfo,
  ) => void;
  twitchChannels: TwitchChannel[];
  favoriteChannels: string[];
  linkedYoutubeChannelIds: string[];
  onToggleFavorite: (channelId: string) => void;
  channelsLoading: boolean;
}

export default function HomeChannelView({
  twitchSession,
  youtubeSession,
  myChannelInfo,
  leftColumnVisible,
  setLeftColumnVisible,
  setShowFavoriteChannels,
  onChannelSelect,
  twitchChannels,
  favoriteChannels,
  linkedYoutubeChannelIds,
  onToggleFavorite,
  channelsLoading,
}: HomeChannelViewProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        height: "100%",
      }}
    >
      <YourChannelBanner
        twitchSession={twitchSession}
        youtubeSession={youtubeSession}
        myChannelInfo={myChannelInfo}
        leftColumnVisible={leftColumnVisible}
        setLeftColumnVisible={setLeftColumnVisible}
        setShowFavoriteChannels={setShowFavoriteChannels}
        onChannelSelect={onChannelSelect}
      />
      <StreamGrid
        channels={twitchChannels}
        favoriteChannels={favoriteChannels}
        linkedYoutubeChannelIds={linkedYoutubeChannelIds}
        onChannelSelect={(id, transitionInfo) =>
          onChannelSelect(id, transitionInfo)
        }
        onToggleFavorite={onToggleFavorite}
        loading={channelsLoading}
      />
    </div>
  );
}

interface YourChannelBannerProps {
  twitchSession: PlatformSession;
  youtubeSession?: PlatformSession;
  myChannelInfo: MyChannelInfo;
  leftColumnVisible: boolean | undefined;
  setLeftColumnVisible: Dispatch<SetStateAction<boolean | undefined>>;
  setShowFavoriteChannels: Dispatch<SetStateAction<boolean>>;
  onChannelSelect: (channelId: string) => void;
}

function YourChannelBanner({
  twitchSession,
  youtubeSession,
  myChannelInfo,
  leftColumnVisible,
  setLeftColumnVisible,
  setShowFavoriteChannels,
  onChannelSelect,
}: YourChannelBannerProps) {
  return (
    <div className="your-channel-banner">
      <button
        type="button"
        onClick={() => setLeftColumnVisible((v) => !v)}
        className="sidebar-toggle-button sidebar-toggle-button--home"
        title={leftColumnVisible ? "Close sidebar" : "Open sidebar"}
      >
        {leftColumnVisible ? (
          <FaChevronLeft size={14} />
        ) : (
          <FaChevronRight size={14} />
        )}
      </button>
      <div className="your-channel-left">
        {twitchSession.profileImageUrl && (
          <img
            src={twitchSession.profileImageUrl}
            alt=""
            className="your-channel-avatar"
          />
        )}
        <div className="your-channel-identity">
          <span className="your-channel-name">
            {twitchSession.displayName}
          </span>
          {!IS_TWITCH_ONLY && youtubeSession && (
            <span className="your-channel-youtube-chip">
              <FaYoutube size={12} />
              {youtubeSession.displayName}
            </span>
          )}
        </div>
      </div>
      {(myChannelInfo.description || myChannelInfo.followerCount !== null) && (
        <div className="your-channel-meta">
          {myChannelInfo.followerCount !== null && (
            <span className="your-channel-followers">
              {myChannelInfo.followerCount.toLocaleString()} followers
            </span>
          )}
          {myChannelInfo.description && (
            <span className="your-channel-description">
              {myChannelInfo.description}
            </span>
          )}
        </div>
      )}
      <div className="your-channel-actions">
        <button
          type="button"
          className="your-channel-btn your-channel-btn--favorites"
          onClick={() => setShowFavoriteChannels(true)}
        >
          <FaStar size={14} />
          Favorites
        </button>
        <button
          type="button"
          className="your-channel-btn"
          onClick={() => onChannelSelect(twitchSession.userId)}
        >
          Go to channel
        </button>
        <a
          className="your-channel-btn your-channel-btn--twitch"
          href={`https://www.twitch.tv/${twitchSession.username}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <FaTwitch size={14} />
          Open on Twitch
        </a>
        {!IS_TWITCH_ONLY && youtubeSession && (
          <a
            className="your-channel-btn your-channel-btn--youtube"
            href={`https://www.youtube.com/channel/${youtubeSession.userId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <FaYoutube size={14} />
            Open on YouTube
          </a>
        )}
      </div>
    </div>
  );
}
