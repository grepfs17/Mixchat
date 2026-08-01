import { useCallback, useReducer } from "react";
import { FaPlus, FaTrash, FaYoutube, FaPencilAlt } from "react-icons/fa";
import {
  getYoutubeLinks,
  addYoutubeLink,
  removeYoutubeLink,
  toggleYoutubeLinkActive,
  updateYoutubeLink,
} from "../lib/youtubeLinks";
import type { YouTubeLink } from "../lib/youtubeLinks";
import type { TwitchChannel } from "../components/AppContainer";

interface YouTubeLinkerProps {
  availableChannels: TwitchChannel[];
  onClose: () => void;
  onLinksChanged?: () => void;
}

export interface State {
  youtubeLinks: YouTubeLink[];
  selectedChannelId: string;
  searchQuery: string;
  youtubeUrl: string;
  error: string;
  editingId: string | null;
  editUrl: string;
  editError: string;
}

export type Action =
  | { type: "SET_LINKS"; payload: YouTubeLink[] }
  | { type: "SET_SEARCH_QUERY"; payload: string }
  | { type: "SET_SELECTED_CHANNEL"; payload: { id: string; query: string } }
  | { type: "SET_YOUTUBE_URL"; payload: string }
  | { type: "RESET_ADD_FORM"; payload: YouTubeLink[] }
  | { type: "SET_ADD_ERROR"; payload: string }
  | { type: "START_EDIT"; payload: { id: string; url: string } }
  | { type: "SET_EDIT_URL"; payload: string }
  | { type: "SET_EDIT_ERROR"; payload: string }
  | { type: "CANCEL_EDIT" }
  | { type: "FINISH_EDIT"; payload: YouTubeLink[] };

export function initLinks(links: YouTubeLink[]): State {
  return {
    youtubeLinks: links,
    selectedChannelId: "",
    searchQuery: "",
    youtubeUrl: "",
    error: "",
    editingId: null,
    editUrl: "",
    editError: "",
  };
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_LINKS":
      return { ...state, youtubeLinks: action.payload };
    case "SET_SEARCH_QUERY":
      return { ...state, searchQuery: action.payload, selectedChannelId: "" };
    case "SET_SELECTED_CHANNEL":
      return {
        ...state,
        selectedChannelId: action.payload.id,
        searchQuery: action.payload.query,
      };
    case "SET_YOUTUBE_URL":
      return { ...state, youtubeUrl: action.payload, error: "" };
    case "RESET_ADD_FORM":
      return {
        ...state,
        youtubeLinks: action.payload,
        selectedChannelId: "",
        searchQuery: "",
        youtubeUrl: "",
        error: "",
      };
    case "SET_ADD_ERROR":
      return { ...state, error: action.payload };
    case "START_EDIT":
      return {
        ...state,
        editingId: action.payload.id,
        editUrl: action.payload.url,
        editError: "",
      };
    case "SET_EDIT_URL":
      return { ...state, editUrl: action.payload, editError: "" };
    case "SET_EDIT_ERROR":
      return { ...state, editError: action.payload };
    case "CANCEL_EDIT":
      return { ...state, editingId: null, editUrl: "", editError: "" };
    case "FINISH_EDIT":
      return {
        ...state,
        youtubeLinks: action.payload,
        editingId: null,
        editUrl: "",
        editError: "",
      };
    default:
      return state;
  }
}

export default function YouTubeLinker({
  availableChannels,
  onClose,
  onLinksChanged,
}: YouTubeLinkerProps) {
  const [state, dispatch] = useReducer(reducer, getYoutubeLinks(), initLinks);

  const {
    youtubeLinks,
    selectedChannelId,
    searchQuery,
    youtubeUrl,
    error,
    editingId,
    editUrl,
    editError,
  } = state;

  const handleAddLink = () => {
    if (!selectedChannelId || !youtubeUrl.trim()) return;

    // Validate URL format
    const trimmed = youtubeUrl.trim();
    if (
      !trimmed.startsWith("https://www.youtube.com/") &&
      !trimmed.startsWith("https://youtube.com/") &&
      !trimmed.startsWith("http://www.youtube.com/") &&
      !trimmed.startsWith("http://youtube.com/")
    ) {
      dispatch({
        type: "SET_ADD_ERROR",
        payload:
          "Please enter a valid YouTube channel URL (e.g. https://www.youtube.com/@channelname)",
      });
      return;
    }

    const channel = availableChannels.find((c) => c.id === selectedChannelId);
    if (channel) {
      addYoutubeLink({
        twitchChannelId: channel.id,
        twitchDisplayName: channel.displayName,
        youtubeUrl: trimmed,
      });
      dispatch({ type: "RESET_ADD_FORM", payload: getYoutubeLinks() });
      onLinksChanged?.();
    }
  };

  const handleRemoveLink = (twitchChannelId: string) => {
    removeYoutubeLink(twitchChannelId);
    dispatch({ type: "SET_LINKS", payload: getYoutubeLinks() });
    onLinksChanged?.();
  };

  const handleToggleActive = (twitchChannelId: string) => {
    toggleYoutubeLinkActive(twitchChannelId);
    dispatch({ type: "SET_LINKS", payload: getYoutubeLinks() });
    onLinksChanged?.();
  };

  const handleEditStart = (twitchChannelId: string, currentUrl: string) => {
    dispatch({
      type: "START_EDIT",
      payload: { id: twitchChannelId, url: currentUrl },
    });
  };

  const handleEditSave = () => {
    if (!editingId) return;

    const trimmed = editUrl.trim();
    if (
      !trimmed.startsWith("https://www.youtube.com/") &&
      !trimmed.startsWith("https://youtube.com/") &&
      !trimmed.startsWith("http://www.youtube.com/") &&
      !trimmed.startsWith("http://youtube.com/")
    ) {
      dispatch({
        type: "SET_EDIT_ERROR",
        payload:
          "Please enter a valid YouTube channel URL (e.g. https://www.youtube.com/@channelname)",
      });
      return;
    }

    updateYoutubeLink(editingId, trimmed);
    dispatch({ type: "FINISH_EDIT", payload: getYoutubeLinks() });
    onLinksChanged?.();
  };

  const handleEditCancel = () => {
    dispatch({ type: "CANCEL_EDIT" });
  };

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  const isAlreadyLinked = (channelId: string) =>
    youtubeLinks.some((l) => l.twitchChannelId === channelId);

  const unlinkedChannels = availableChannels.filter(
    (c) => !isAlreadyLinked(c.id),
  );

  const filteredChannels =
    searchQuery.trim() === ""
      ? unlinkedChannels
      : unlinkedChannels.filter(
          (c) =>
            c.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.name.toLowerCase().includes(searchQuery.toLowerCase()),
        );

  return (
    <div className="ytlinker-overlay" onClick={onClose}>
      <div
        className="ytlinker-manager"
        role="dialog"
        aria-modal="true"
        aria-label="Link YouTube Channels"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <h2>
          <FaYoutube
            style={{
              color: "#FF0000",
              marginRight: "8px",
              verticalAlign: "middle",
            }}
          />
          Link YouTube Channels
        </h2>
        <p className="ytlinker-subtitle">
          Link a YouTube channel to a followed streamer to see their YouTube
          live chat
        </p>

        <div className="ytlinker-add-section">
          <div className="ytlinker-inputs">
            <div className="ytlinker-channel-select">
              <label className="ytlinker-label" htmlFor="yt-linker-channel-search">Twitch Channel</label>
              <input
                id="yt-linker-channel-search"
                type="text"
                placeholder="Search followed channels..."
                aria-label="Search followed channels"
                value={searchQuery}
                onChange={(e) => {
                  dispatch({ type: "SET_SEARCH_QUERY", payload: e.target.value });
                }}
                className="ytlinker-search"
              />
              <div className="ytlinker-dropdown">
                {filteredChannels.length === 0 ? (
                  <div className="ytlinker-no-channels">
                    {searchQuery
                      ? "No channels match your search"
                      : "All followed channels already have a YouTube link"}
                  </div>
                ) : (
                  filteredChannels.map((channel) => (
                    <button type="button"
                      key={channel.id}
                      className="ytlinker-channel-item"
                      onClick={() => {
                        dispatch({
                          type: "SET_SELECTED_CHANNEL",
                          payload: { id: channel.id, query: channel.displayName },
                        });
                      }}
                    >
                      {channel.profileImageUrl && (
                        <img
                          src={channel.profileImageUrl}
                          alt=""
                          className="item-avatar"
                        />
                      )}
                      <div className="ytlinker-channel-info">
                        <div className="ytlinker-channel-display-name">
                          {channel.displayName}
                        </div>
                        <div className="ytlinker-channel-username">
                          @{channel.name}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
              {selectedChannelId && (
                <div className="ytlinker-selected-display">
                  ✓{" "}
                  {unlinkedChannels.find((c) => c.id === selectedChannelId)
                    ?.displayName || searchQuery}
                </div>
              )}
            </div>

            <div className="ytlinker-url-input">
              <label className="ytlinker-label" htmlFor="yt-linker-url">YouTube Channel URL</label>
              <input
                id="yt-linker-url"
                type="text"
                placeholder="https://www.youtube.com/@channelname"
                aria-label="YouTube channel URL"
                value={youtubeUrl}
                onChange={(e) => {
                  dispatch({ type: "SET_YOUTUBE_URL", payload: e.target.value });
                }}
                className="ytlinker-search"
              />
            </div>
          </div>

          {error && <div className="ytlinker-error">{error}</div>}

          <button type="button"
            className="ytlinker-add-button"
            onClick={handleAddLink}
            disabled={!selectedChannelId || !youtubeUrl.trim()}
          >
            <FaPlus /> Link
          </button>
        </div>

        <div className="ytlinker-items">
          {youtubeLinks.length === 0 ? (
            <p className="ytlinker-empty">No YouTube channels linked yet</p>
          ) : (
            youtubeLinks.map((link) => {
              const channel = availableChannels.find(
                (c) => c.id === link.twitchChannelId,
              );
              const isActive = link.active !== false;
              const isEditing = editingId === link.twitchChannelId;
              return (
                <div
                  key={link.twitchChannelId}
                  className={`ytlinker-item${!isActive ? " ytlinker-item--inactive" : ""}${isEditing ? " ytlinker-item--editing" : ""}`}
                >
                  <div className="ytlinker-item-info">
                    {channel?.profileImageUrl && (
                      <img
                        src={channel.profileImageUrl}
                        alt=""
                        className="item-avatar"
                      />
                    )}
                    <div className="ytlinker-item-details">
                      <div className="ytlinker-item-name">
                        {link.twitchDisplayName}
                      </div>
                      {isEditing ? (
                        <div className="ytlinker-edit-row">  <input
    type="text"
    value={editUrl}
    onChange={(e) => {
      dispatch({ type: "SET_EDIT_URL", payload: e.target.value });
    }}
    onKeyDown={(e) => {
      if (e.key === "Enter") handleEditSave();
      if (e.key === "Escape") handleEditCancel();
    }}
    className="ytlinker-edit-input"
    aria-label="Edit video URL"
                            autoFocus
                          />
                          {editError && (
                            <div className="ytlinker-error">{editError}</div>
                          )}
                        </div>
                      ) : (
                        <a
                          href={link.youtubeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ytlinker-item-url"
                        >
                          {link.youtubeUrl}
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="ytlinker-item-actions">
                    {isEditing ? (
                      <>
                        <button type="button"
                          className="ytlinker-edit-save"
                          onClick={handleEditSave}
                          title="Save changes"
                        >
                          ✓
                        </button>
                        <button type="button"
                          className="ytlinker-edit-cancel"
                          onClick={handleEditCancel}
                          title="Cancel edit"
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button"
                          className="ytlinker-edit-button"
                          onClick={() =>
                            handleEditStart(
                              link.twitchChannelId,
                              link.youtubeUrl,
                            )
                          }
                          title="Edit YouTube URL"
                        >
                          <FaPencilAlt />
                        </button>
                        <button type="button"
                          className={`ytlinker-toggle${isActive ? " ytlinker-toggle--active" : ""}`}
                          onClick={() =>
                            handleToggleActive(link.twitchChannelId)
                          }
                          title={isActive ? "Deactivate link" : "Activate link"}
                          aria-label={
                            isActive
                              ? "Deactivate YouTube link"
                              : "Activate YouTube link"
                          }
                        >
                          <span className="ytlinker-toggle-track">
                            <span className="ytlinker-toggle-thumb" />
                          </span>
                        </button>
                        <button type="button"
                          className="ytlinker-remove-button"
                          onClick={() => handleRemoveLink(link.twitchChannelId)}
                          title="Remove YouTube link"
                        >
                          <FaTrash />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="ytlinker-footer">
          <p className="ytlinker-info-text">
            <FaYoutube style={{ marginRight: "6px", color: "#FF0000" }} />
            When viewing a linked channel, YouTube live chat will appear above
            the Twitch chat
          </p>
          <button type="button" className="ytlinker-close-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
