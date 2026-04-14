import { useState, useMemo } from 'react';
import type { TwitchChannel } from './AppContainer';


type SortOption = 'favorites' | 'name' | 'viewers';

interface StreamGridProps {
    channels: TwitchChannel[];
    favoriteChannels: string[];
    onChannelSelect: (channelId: string) => void;
    onToggleFavorite: (channelId: string) => void;
}

function formatViewers(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
}

/** Build the Twitch CDN live-preview thumbnail URL from the template or the login name. */
function getThumbnailSrc(channel: TwitchChannel, w = 320, h = 180): string {
    if (channel.thumbnailUrl) {
        return channel.thumbnailUrl.replace('{width}', String(w)).replace('{height}', String(h));
    }
    // Fall back to the well-known Twitch CDN pattern
    return `https://static-cdn.jtvnw.net/previews-ttv/live_user_${channel.name}-${w}x${h}.jpg`;
}

export default function StreamGrid({
    channels,
    favoriteChannels,
    onChannelSelect,
    onToggleFavorite,
}: StreamGridProps) {
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState<SortOption>('favorites');
    const [thumbErrors, setThumbErrors] = useState<Set<string>>(new Set());

    const filtered = useMemo(() => {
        let result = channels;

        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(
                (ch) =>
                    ch.displayName.toLowerCase().includes(q) ||
                    ch.name.toLowerCase().includes(q) ||
                    (ch.gameName ?? '').toLowerCase().includes(q) ||
                    (ch.title ?? '').toLowerCase().includes(q),
            );
        }

        return [...result].sort((a, b) => {
            if (sortBy === 'favorites') {
                const af = favoriteChannels.includes(a.id);
                const bf = favoriteChannels.includes(b.id);
                if (af !== bf) return af ? -1 : 1;
                // Secondary: most viewers
                return (b.viewerCount ?? 0) - (a.viewerCount ?? 0);
            }
            if (sortBy === 'name') {
                return a.displayName.localeCompare(b.displayName);
            }
            // viewers
            return (b.viewerCount ?? 0) - (a.viewerCount ?? 0);
        });
    }, [channels, favoriteChannels, search, sortBy]);

    return (
        <div className="stream-grid-container">
            <div className="stream-grid-header">
                <div className="stream-grid-title-row">
                    <span className="live-dot" aria-hidden="true" />
                    <h2>Live Now</h2>
                    <span className="stream-count-badge">{channels.length}</span>
                </div>

                <div className="stream-grid-controls">
                    <div className="stream-search-wrap">
                        <span className="stream-search-icon" aria-hidden="true">⌕</span>
                        <input
                            type="text"
                            className="stream-search"
                            placeholder="Search streams, games…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            autoComplete="off"
                            spellCheck={false}
                        />
                    </div>
                    <div className="stream-sort-group" role="group" aria-label="Sort by">
                        <button
                            className={`sort-btn${sortBy === 'favorites' ? ' active' : ''}`}
                            onClick={() => setSortBy('favorites')}
                            title="Sort by favorites first"
                        >
                            <StarIcon /> Favorites
                        </button>
                        <button
                            className={`sort-btn${sortBy === 'name' ? ' active' : ''}`}
                            onClick={() => setSortBy('name')}
                            title="Sort alphabetically"
                        >
                            <SortAlphaIcon /> A-Z
                        </button>
                        <button
                            className={`sort-btn${sortBy === 'viewers' ? ' active' : ''}`}
                            onClick={() => setSortBy('viewers')}
                            title="Sort by viewer count"
                        >
                            <ViewersIcon /> Viewers
                        </button>
                    </div>
                </div>
            </div>

            <div className="stream-grid-scroll">
                {channels.length === 0 ? (
                    <div className="stream-grid-empty">
                        <div className="stream-grid-empty-icon">📺</div>
                        <p>No one is live right now</p>
                        <p className="hint">Check back later or explore more channels</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="stream-grid-empty">
                        <div className="stream-grid-empty-icon">🔍</div>
                        <p>No streams match &ldquo;{search}&rdquo;</p>
                    </div>
                ) : (
                    <div className="stream-grid">
                        {filtered.map((channel) => {
                            const isFav = favoriteChannels.includes(channel.id);
                            const thumbFailed = thumbErrors.has(channel.id);
                            const thumbSrc = getThumbnailSrc(channel);
                            const game = channel.gameName || channel.title || '';

                            return (
                                <div
                                    key={channel.id}
                                    className={`stream-card${isFav ? ' is-favorite' : ''}`}
                                    onClick={() => onChannelSelect(channel.id)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => e.key === 'Enter' && onChannelSelect(channel.id)}
                                    aria-label={`Watch ${channel.displayName}`}
                                >
                                    <div className="stream-card-thumb">
                                        {thumbFailed ? (
                                            <div className="stream-card-thumb-placeholder">📺</div>
                                        ) : (
                                            <img
                                                src={thumbSrc}
                                                alt={`${channel.displayName} stream preview`}
                                                loading="lazy"
                                                onError={() =>
                                                    setThumbErrors((prev) => new Set(prev).add(channel.id))
                                                }
                                            />
                                        )}
                                        <span className="stream-card-live-badge">LIVE</span>
                                        {channel.viewerCount !== undefined && channel.viewerCount > 0 && (
                                            <span className="stream-card-viewers">
                                                <EyeIcon />
                                                {formatViewers(channel.viewerCount)}
                                            </span>
                                        )}
                                        <button
                                            className={`stream-card-fav-btn${isFav ? ' active' : ''}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onToggleFavorite(channel.id);
                                            }}
                                            title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                                            aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
                                        >
                                            ★
                                        </button>
                                    </div>

                                    <div className="stream-card-info">
                                        <div className="stream-card-avatar-row">
                                            {channel.profileImageUrl && (
                                                <img
                                                    src={channel.profileImageUrl}
                                                    alt=""
                                                    className="stream-card-avatar"
                                                    aria-hidden="true"
                                                />
                                            )}
                                            <div className="stream-card-names">
                                                <span className="stream-card-display-name">
                                                    {channel.displayName}
                                                </span>
                                            </div>
                                        </div>

                                        {game && (
                                            <div className="stream-card-game" title={game}>
                                                {game}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}


function StarIcon() {
    return (
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 1l1.85 3.75L14 5.48l-3 2.92.71 4.13L8 10.4l-3.71 2.13.71-4.13L2 5.48l4.15-.73L8 1z" />
        </svg>
    );
}

function SortAlphaIcon() {
    return (
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M2 11h3.5l.5.9h1.5L4.75 5H3.25L0 11.9H1.5L2 11zm1-1.5 1-2.5 1 2.5H3zM9 5v1.5l3.5 4H9V12h5v-1.5l-3.5-4H14V5H9z" />
        </svg>
    );
}

function ViewersIcon() {
    return (
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 3C4.5 3 1.5 5.5 0 8c1.5 2.5 4.5 5 8 5s6.5-2.5 8-5c-1.5-2.5-4.5-5-8-5zm0 8a3 3 0 110-6 3 3 0 010 6zm0-4.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" />
        </svg>
    );
}

function EyeIcon() {
    return (
        <svg
            viewBox="0 0 16 16"
            fill="currentColor"
            aria-hidden="true"
            style={{ width: 11, height: 11, flexShrink: 0 }}
        >
            <path d="M8 3C4.5 3 1.5 5.5 0 8c1.5 2.5 4.5 5 8 5s6.5-2.5 8-5c-1.5-2.5-4.5-5-8-5zm0 8a3 3 0 110-6 3 3 0 010 6zm0-4.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" />
        </svg>
    );
}
