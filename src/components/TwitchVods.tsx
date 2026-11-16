import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { FaExternalLinkAlt, FaPlay } from "react-icons/fa";
import { TwitchJSEmbed } from "./StreamEmbed";

interface TwitchVideo {
  id: string;
  title: string;
  thumbnailUrl: string;
  url: string;
  duration: string;
  viewCount: number;
  createdAt: string;
  type: string;
}

interface TwitchClip {
  id: string;
  url: string;
  title: string;
  thumbnailUrl: string;
  duration: number;
  viewCount: number;
  createdAt: string;
  creatorName: string;
}

export interface ActiveMedia {
  type: "vod" | "clip";
  id: string;
  url?: string;
}

interface TwitchVodsProps {
  channelName: string;
  channelIsLive: boolean | null;
  twitchAccessToken?: string;
  activeMedia: ActiveMedia | null;
  onSelectMedia: (media: ActiveMedia | null) => void;
}

type OfflineTab = "vods" | "clips";
export type ClipPeriod = "day" | "week" | "month" | "all";

const CLIP_EXPLORER_BASE = "https://twitchclipexplorer.grepfs.xyz/";

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatDuration(raw: string): string {
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw ?? "");
  if (!match) return raw || "0:00";
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatClipDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatViews(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return DATE_FORMATTER.format(date);
}

export function clipExplorerUrl(clipUrl: string): string {
  return `${CLIP_EXPLORER_BASE}?v=${encodeURIComponent(clipUrl)}`;
}

function SkeletonGrid() {
  return (
    <div className="twitch-vods__grid">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="twitch-vod-card twitch-vod-card--skeleton">
          <span className="twitch-vod-card__thumb twitch-vod-card__thumb--skeleton" />
          <span className="twitch-vod-card__body">
            <span className="twitch-vod-card__bar twitch-vod-card__bar--title" />
            <span className="twitch-vod-card__bar twitch-vod-card__bar--meta" />
          </span>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="twitch-vods__empty">
      <p>{message}</p>
    </div>
  );
}

function useInfiniteScroll(
  hasMore: boolean,
  loading: boolean,
  onLoadMore: () => void,
  rootMargin = "240px",
) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const onLoadMoreRef = useRef(onLoadMore);

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    if (!hasMore || loading) return;
    if (typeof IntersectionObserver === "undefined") return;
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        observer.disconnect();
        onLoadMoreRef.current();
      },
      { rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, rootMargin]);

  return sentinelRef;
}

function InfiniteScrollFooter({
  sentinelRef,
  loading,
  error,
  onRetry,
}: {
  sentinelRef: RefObject<HTMLDivElement | null>;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="twitch-vods__infinite">
      {error ? (
        <div className="twitch-vods__more">
          <p className="twitch-vods__more-error">{error}</p>
          <button
            type="button"
            className="twitch-vods__more-btn"
            onClick={onRetry}
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          <div ref={sentinelRef} className="twitch-vods__sentinel" />
          {loading && (
            <div className="twitch-vods__loading-more" role="status">
              <span className="twitch-vods__spinner" aria-hidden="true" />
              Loading more…
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TwitchClipPlayer({
  clipId,
  parentDomain,
}: {
  clipId: string;
  parentDomain: string;
}) {
  return (
    <iframe
      className="twitch-clip-player"
      src={`https://clips.twitch.tv/embed?clip=${encodeURIComponent(
        clipId,
      )}&parent=${encodeURIComponent(parentDomain)}&autoplay=true`}
      title="Twitch clip"
      allow="autoplay; fullscreen; picture-in-picture"
      allowFullScreen
      // Twitch's clip player needs scripts and its own origin for playback.
      // It is cross-origin, so it cannot remove the sandbox from this page.
      // react-doctor-disable-next-line react-doctor/iframe-missing-sandbox
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"
    />
  );
}

function MediaCardContent({
  id,
  title,
  thumbnailUrl,
  duration,
  meta,
  fallbackLabel,
  hasThumbError,
  onThumbError,
}: {
  id: string;
  title: string;
  thumbnailUrl: string;
  duration: string;
  meta: string;
  fallbackLabel: string;
  hasThumbError: boolean;
  onThumbError: (id: string) => void;
}) {
  return (
    <>
      <span className="twitch-vod-card__thumb">
        {hasThumbError ? (
          <span className="twitch-vod-card__thumb-fallback">
            {fallbackLabel}
          </span>
        ) : (
          <img
            src={thumbnailUrl}
            alt=""
            loading="lazy"
            onError={() => onThumbError(id)}
          />
        )}
        <span className="twitch-vod-card__duration">{duration}</span>
        <span className="twitch-vod-card__play" aria-hidden="true">
          <FaPlay size={11} />
        </span>
      </span>
      <span className="twitch-vod-card__body">
        <span className="twitch-vod-card__title">{title}</span>
        <span className="twitch-vod-card__meta">{meta}</span>
      </span>
    </>
  );
}

function VodList({
  channelName,
  onSelectVideo,
}: {
  channelName: string;
  onSelectVideo: (id: string) => void;
}) {
  const [videos, setVideos] = useState<TwitchVideo[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [thumbErrors, setThumbErrors] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setLoadingMore(false);
    setError(null);
    setLoadMoreError(null);
    setVideos([]);
    setCursor(null);
    setThumbErrors(new Set());

    fetch(`/api/twitch-videos?login=${encodeURIComponent(channelName)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error || "Failed to load videos");
        }
        return (await res.json()) as {
          videos?: TwitchVideo[];
          cursor?: string | null;
        };
      })
      .then((data) => {
        if (cancelled) return;
        setVideos(Array.isArray(data.videos) ? data.videos : []);
        setCursor(data.cursor ?? null);
      })
      .catch((err: Error) => {
        if (cancelled || err.name === "AbortError") return;
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [channelName]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setLoadingMore(true);
    setLoadMoreError(null);

    try {
      const res = await fetch(
        `/api/twitch-videos?login=${encodeURIComponent(
          channelName,
        )}&after=${encodeURIComponent(cursor)}`,
        { signal: controller.signal },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error || "Failed to load more videos");
      }
      const data = (await res.json()) as {
        videos?: TwitchVideo[];
        cursor?: string | null;
      };
      const ownsRequest =
        !controller.signal.aborted && abortRef.current === controller;
      if (!ownsRequest) return;
      const nextVideos = Array.isArray(data.videos) ? data.videos : [];
      setVideos((prev) => (ownsRequest ? [...prev, ...nextVideos] : prev));
      setCursor((prev) => (ownsRequest ? data.cursor ?? null : prev));
    } catch (err) {
      const ownsRequest =
        !controller.signal.aborted && abortRef.current === controller;
      if (!ownsRequest || (err as Error).name === "AbortError") return;
      const message = (err as Error).message;
      setLoadMoreError((prev) => (ownsRequest ? message : prev));
    } finally {
      const ownsRequest = abortRef.current === controller;
      setLoadingMore((prev) => (ownsRequest ? false : prev));
      if (ownsRequest) abortRef.current = null;
    }
  };

  const sentinelRef = useInfiniteScroll(
    !!cursor && !loadMoreError,
    loadingMore,
    loadMore,
  );

  if (loading) return <SkeletonGrid />;
  if (error) return <EmptyState message={error} />;
  if (videos.length === 0) {
    return <EmptyState message="No VODs available for this channel" />;
  }

  return (
    <>
      <div className="twitch-vods__grid">
        {videos.map((video) => (
          <button
            type="button"
            key={video.id}
            className="twitch-vod-card"
            onClick={() => onSelectVideo(video.id)}
            title={video.title}
          >
            <MediaCardContent
              id={video.id}
              title={video.title}
              thumbnailUrl={video.thumbnailUrl}
              duration={formatDuration(video.duration)}
              meta={`${formatViews(video.viewCount)} views · ${formatDate(
                video.createdAt,
              )}`}
              fallbackLabel="VOD unavailable"
              hasThumbError={thumbErrors.has(video.id)}
              onThumbError={(id) =>
                setThumbErrors((prev) => new Set(prev).add(id))
              }
            />
          </button>
        ))}
      </div>
      {cursor && (
        <InfiniteScrollFooter
          sentinelRef={sentinelRef}
          loading={loadingMore}
          error={loadMoreError}
          onRetry={loadMore}
        />
      )}
    </>
  );
}

function ClipList({
  channelName,
  period,
  featuredOnly,
  onSelectClip,
}: {
  channelName: string;
  period: ClipPeriod;
  featuredOnly: boolean;
  onSelectClip: (id: string, url: string) => void;
}) {
  const [clips, setClips] = useState<TwitchClip[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [thumbErrors, setThumbErrors] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  const buildUrl = (after: string | null) => {
    const params = new URLSearchParams({
      login: channelName,
      period,
    });
    if (featuredOnly) params.set("featured", "true");
    if (after) params.set("after", after);
    return `/api/twitch-clips?${params.toString()}`;
  };

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setLoadingMore(false);
    setError(null);
    setLoadMoreError(null);
    setClips([]);
    setCursor(null);
    setThumbErrors(new Set());

    fetch(buildUrl(null), { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error || "Failed to load clips");
        }
        return (await res.json()) as {
          clips?: TwitchClip[];
          cursor?: string | null;
        };
      })
      .then((data) => {
        if (cancelled) return;
        setClips(Array.isArray(data.clips) ? data.clips : []);
        setCursor(data.cursor ?? null);
      })
      .catch((err: Error) => {
        if (cancelled || err.name === "AbortError") return;
        setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
      abortRef.current?.abort();
      abortRef.current = null;
    };
    // buildUrl is derived from these values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, period, featuredOnly]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setLoadingMore(true);
    setLoadMoreError(null);

    try {
      const res = await fetch(buildUrl(cursor), { signal: controller.signal });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error || "Failed to load more clips");
      }
      const data = (await res.json()) as {
        clips?: TwitchClip[];
        cursor?: string | null;
      };
      const ownsRequest =
        !controller.signal.aborted && abortRef.current === controller;
      if (!ownsRequest) return;
      const nextClips = Array.isArray(data.clips) ? data.clips : [];
      setClips((prev) => (ownsRequest ? [...prev, ...nextClips] : prev));
      setCursor((prev) => (ownsRequest ? data.cursor ?? null : prev));
    } catch (err) {
      const ownsRequest =
        !controller.signal.aborted && abortRef.current === controller;
      if (!ownsRequest || (err as Error).name === "AbortError") return;
      const message = (err as Error).message;
      setLoadMoreError((prev) => (ownsRequest ? message : prev));
    } finally {
      const ownsRequest = abortRef.current === controller;
      setLoadingMore((prev) => (ownsRequest ? false : prev));
      if (ownsRequest) abortRef.current = null;
    }
  };

  const sentinelRef = useInfiniteScroll(
    !!cursor && !loadMoreError,
    loadingMore,
    loadMore,
  );

  if (loading) return <SkeletonGrid />;
  if (error) return <EmptyState message={error} />;
  if (clips.length === 0) {
    return (
      <EmptyState message="No clips found. Try adjusting the filters above." />
    );
  }

  return (
    <>
      <div className="twitch-vods__grid">
        {clips.map((clip) => (
          <div key={clip.id} className="twitch-clip-card">
            <button
              type="button"
              className="twitch-clip-card__main"
              onClick={() => onSelectClip(clip.id, clip.url)}
              title={clip.title}
            >
              <MediaCardContent
                id={clip.id}
                title={clip.title}
                thumbnailUrl={clip.thumbnailUrl}
                duration={formatClipDuration(clip.duration)}
                meta={`${formatViews(clip.viewCount)} views · ${formatDate(
                  clip.createdAt,
                )}${clip.creatorName ? ` · ${clip.creatorName}` : ""}`}
                fallbackLabel="Clip unavailable"
                hasThumbError={thumbErrors.has(clip.id)}
                onThumbError={(id) =>
                  setThumbErrors((prev) => new Set(prev).add(id))
                }
              />
            </button>
            <a
              className="twitch-clip-card__explorer"
              href={clipExplorerUrl(clip.url)}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in Clip Explorer"
              aria-label="Open in Clip Explorer"
            >
              <FaExternalLinkAlt size={10} />
              <span>Clip Explorer</span>
            </a>
          </div>
        ))}
      </div>
      {cursor && (
        <InfiniteScrollFooter
          sentinelRef={sentinelRef}
          loading={loadingMore}
          error={loadMoreError}
          onRetry={loadMore}
        />
      )}
    </>
  );
}

export default function TwitchVods({
  channelName,
  channelIsLive,
  twitchAccessToken,
  activeMedia,
  onSelectMedia,
}: TwitchVodsProps) {
  const [tab, setTab] = useState<OfflineTab>("vods");
  const [clipPeriod, setClipPeriod] = useState<ClipPeriod>("month");
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [parentDomain, setParentDomain] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    // Twitch checks `parent` against the real ancestor origin, so prefer the
    // browser's hostname over the server-configured site domain. The API value
    // remains the fallback for environments without `window`.
    const browserHost =
      typeof window !== "undefined" ? window.location.hostname : "";

    fetch("/api/parent-domain", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : { parentDomain: "localhost" }))
      .then((data) => {
        if (cancelled) return;
        setParentDomain(browserHost || data.parentDomain || "localhost");
      })
      .catch(() => {
        if (cancelled || controller.signal.aborted) return;
        setParentDomain(browserHost || "localhost");
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  if (activeMedia) {
    return (
      <div className="twitch-vods">
        <div className="twitch-vods__player">
          {parentDomain ? (
            activeMedia.type === "clip" ? (
              <TwitchClipPlayer
                key={activeMedia.id}
                clipId={activeMedia.id}
                parentDomain={parentDomain}
              />
            ) : (
              <TwitchJSEmbed
                key={activeMedia.id}
                videoId={activeMedia.id}
                parentDomain={parentDomain}
                oauthToken={twitchAccessToken}
              />
            )
          ) : (
            <div className="twitch-vods__player-loading">Loading player…</div>
          )}
        </div>
      </div>
    );
  }

  const tabs: Array<{ id: OfflineTab; label: string }> = [
    { id: "vods", label: "Latest VODs" },
    { id: "clips", label: "Featured Clips" },
  ];

  return (
    <div className="twitch-vods">
      <div className="twitch-vods__header">
        {channelIsLive === false && (
          <span className="twitch-vods__offline">OFFLINE</span>
        )}
        {channelIsLive === true && (
          <span className="twitch-vods__online">LIVE</span>
        )}
        <div
          className="twitch-vods__tabs"
          role="tablist"
          aria-label="Offline channel content"
        >
          {tabs.map((item) => (
            <button
              type="button"
              key={item.id}
              role="tab"
              aria-selected={tab === item.id}
              className={`twitch-vods__tab${
                tab === item.id ? " twitch-vods__tab--active" : ""
              }`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="twitch-vods__channel">{channelName}</span>
      </div>

      {tab === "clips" && (
        <div className="twitch-vods__filters">
          <label className="twitch-vods__featured">
            <input
              type="checkbox"
              checked={featuredOnly}
              onChange={(e) => setFeaturedOnly(e.target.checked)}
            />
            Featured only
          </label>
          <label className="twitch-vods__filter">
            Filter by:
            <select
              className="twitch-vods__select"
              value={clipPeriod}
              onChange={(e) => setClipPeriod(e.target.value as ClipPeriod)}
            >
              <option value="day">Last 24 hours</option>
              <option value="week">Last 7 days</option>
              <option value="month">Last 30 days</option>
              <option value="all">All time</option>
            </select>
          </label>
        </div>
      )}

      <div className="twitch-vods__scroll">
        {tab === "vods" ? (
          <VodList
            channelName={channelName}
            onSelectVideo={(id) => onSelectMedia({ type: "vod", id })}
          />
        ) : (
          <ClipList
            channelName={channelName}
            period={clipPeriod}
            featuredOnly={featuredOnly}
            onSelectClip={(id, url) =>
              onSelectMedia({ type: "clip", id, url })
            }
          />
        )}
      </div>
    </div>
  );
}
