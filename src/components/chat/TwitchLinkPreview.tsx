import React, { useEffect, useRef, useState } from "react";
import { FaTwitch, FaPlay } from "react-icons/fa";
import type { TwitchLinkParts } from "../../lib/twitchLink";
import type { TwitchLinkPreviewResponse } from "../../pages/api/twitch-link-preview";

type Data = TwitchLinkPreviewResponse | null;

/**
 * Inline Twitch preview card placed where a `twitch.tv/...` URL would
 * otherwise render as a tiny clickable link. Fetches metadata from
 * `/api/twitch-link-preview` once on mount and shows a skeleton until the
 * response arrives. If metadata is unreachable (not logged in, deleted
 * channel…) we silently fall back to a styled text link — the URL still
 * works, just without the card.
 *
 * Click anywhere on the card → opens the linked Twitch URL in a new tab.
 */
function TwitchLinkPreviewBase({ url, parts }: { url: string; parts: TwitchLinkParts }) {
  const [data, setData] = useState<Data>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const reqIdRef = useRef(0);

  useEffect(() => {
    const reqId = reqIdRef.current + 1;
    reqIdRef.current = reqId;
    setState("loading");
    setData(null);
    fetch(`/api/twitch-link-preview?url=${encodeURIComponent(url)}`, {
      credentials: "same-origin",
    })
      .then(async (r) => {
        if (reqId !== reqIdRef.current) return;
        if (r.status === 404 || r.status === 401 || r.status === 400) {
          // Either URL was removed, or the link isn't a Twitch URL the
          // server recognises. Either way, fall back gracefully.
          setState("error");
          return;
        }
        if (!r.ok) {
          setState("error");
          return;
        }
        const json = (await r.json()) as TwitchLinkPreviewResponse;
        if (reqId !== reqIdRef.current) return;
        setData(json);
        setState("ready");
      })
      .catch(() => {
        if (reqId !== reqIdRef.current) return;
        setState("error");
      });
  }, [url]);

  if (state === "loading") {
    return <PreviewSkeleton parts={parts} href={parts.href} />;
  }
  if (state === "error" || !data) {
    // Display the URL as the user typed it (so they can still click through),
    // but link to the canonical href so trailing punctuation in the chat
    // text (a comma or period) does not end up in the destination URL.
    const visible = parts.url || url;
    return (
      <a
        href={parts.href}
        target="_blank"
        rel="noopener noreferrer"
        className="twitch-link-fallback"
        title="Open on Twitch"
      >
        <FaTwitch size={11} style={{ marginRight: 4, verticalAlign: "-1px" }} />
        <span>{visible}</span>
      </a>
    );
  }
  return <PreviewCard data={data} />;
}

function PreviewSkeleton({
  parts,
  href,
}: {
  parts: TwitchLinkParts;
  href: string;
}) {
  const showKindBadge = parts.kind !== "clip";
  const kindLabel =
    parts.kind === "video" ? "VOD" : "TWITCH";
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="twitch-link-preview twitch-link-preview--loading"
      aria-busy="true"
    >
      <div className="twitch-link-preview__thumb twitch-link-preview__thumb--skeleton">
        <FaTwitch size={20} />
      </div>
      <div className="twitch-link-preview__body">
        {showKindBadge && (
          <div className="twitch-link-preview__kind">
            <FaTwitch size={10} />
            <span>{kindLabel}</span>
          </div>
        )}
        <div className="twitch-link-preview__title twitch-link-preview__title--skeleton">
          Loading preview…
        </div>
        <div className="twitch-link-preview__meta twitch-link-preview__meta--skeleton">
          <span className="twitch-link-preview__avatar twitch-link-preview__avatar--skeleton" />
          <span>·</span>
          <span>fetching…</span>
        </div>
      </div>
    </a>
  );
}

function getPreviewMeta(data: TwitchLinkPreviewResponse): string {
  const clipLine = data.creator?.displayName || data.creator?.login;
  const videoLine = data.views
    ? `${data.views.toLocaleString()} views${data.duration ? ` · ${data.duration}` : ""}`
    : data.duration
      ? data.duration
      : null;
  if (data.kind === "clip") {
    return clipLine ? `Clipped by ${clipLine}` : "Twitch clip";
  }
  if (data.kind === "video") {
    return videoLine || "Twitch VOD";
  }
  if (data.live) {
    const liveLine = data.gameName
      ? `${data.gameName} · ${(data.viewers ?? 0).toLocaleString()} viewers`
      : `${(data.viewers ?? 0).toLocaleString()} viewers`;
    return liveLine || "Live on Twitch";
  }
  return "Offline";
}

function PreviewThumb({ data }: { data: TwitchLinkPreviewResponse }) {
  return (
    <div className="twitch-link-preview__thumb">
      {data.thumbnailUrl ? (
        <img src={data.thumbnailUrl} alt="" loading="lazy" />
      ) : (
        <div className="twitch-link-preview__thumb-placeholder">
          <FaTwitch size={28} />
        </div>
      )}
      {data.kind !== "clip" && (
        <span className="twitch-link-preview__kind-badge">
          <FaTwitch size={10} />
          <span>
            {data.kind === "video" ? "VOD" : data.live ? "LIVE" : "TWITCH"}
          </span>
        </span>
      )}
      {data.kind === "video" && data.duration && (
        <span className="twitch-link-preview__duration">{data.duration}</span>
      )}
      {data.kind === "clip" && (
        <span className="twitch-link-preview__play">
          <FaPlay size={11} />
        </span>
      )}
      {data.live && data.viewers !== undefined && (
        <span className="twitch-link-preview__viewers">
          {data.viewers.toLocaleString()}
        </span>
      )}
    </div>
  );
}

function PreviewBody({ data }: { data: TwitchLinkPreviewResponse }) {
  const meta = getPreviewMeta(data);
  return (
    <div className="twitch-link-preview__body">
      {data.kind === "channel" && data.live && data.gameName && (
        <div className="twitch-link-preview__game">{data.gameName}</div>
      )}
      <div className="twitch-link-preview__title">
        {data.title ||
          data.author?.displayName ||
          data.author?.login ||
          data.href}
      </div>
      <div className="twitch-link-preview__meta">
        {data.author?.avatarUrl && (
          <img
            className="twitch-link-preview__avatar"
            src={data.author.avatarUrl}
            alt=""
            loading="lazy"
          />
        )}
        <span className="twitch-link-preview__meta-text">
          <strong>
            {data.author?.displayName ||
              data.author?.login ||
              "Twitch channel"}
          </strong>
          <span className="twitch-link-preview__meta-divider"> · </span>
          <span>{meta}</span>
        </span>
      </div>
    </div>
  );
}

function PreviewCard({ data }: { data: TwitchLinkPreviewResponse }) {
  return (
    <a
      href={data.href || data.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`twitch-link-preview twitch-link-preview--${data.kind}${
        data.live ? " twitch-link-preview--live" : ""
      }`}
      title={data.title || data.href || data.url}
    >
      <PreviewThumb data={data} />
      <PreviewBody data={data} />
    </a>
  );
}

export const TwitchLinkPreview = React.memo(TwitchLinkPreviewBase);
export default TwitchLinkPreview;
