import React from "react";

interface MessageBadgesProps {
  /** Detailed badge data (Twitch): name → { url, title } */
  badgeDetails?: Record<string, { url: string; title: string }>;
  /** Simple badge data: name → imageUrl */
  badges?: Record<string, string>;
  className?: string;
  style?: React.CSSProperties;
  /** Use lazy loading (for non-critical images like YouTube badges) */
  lazy?: boolean;
}

/**
 * Renders a row of badge icons from either detailed Twitch badge data
 * or a simple name→URL map.  badgeDetails takes priority when present.
 */
const imgStyle: React.CSSProperties = {
  width: "18px",
  height: "18px",
  verticalAlign: "middle",
};

export default function MessageBadges({
  badgeDetails,
  badges,
  className = "message-badges",
  style,
  lazy = false,
}: MessageBadgesProps) {
  const baseStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "2px",
    ...style,
  };
  const loading = lazy ? "lazy" : "eager";

  if (badgeDetails && Object.keys(badgeDetails).length > 0) {
    return (
      <div className={className} style={baseStyle}>
        {Object.entries(badgeDetails).map(([name, detail]) => (
          <img
            key={name}
            src={detail.url}
            alt={detail.title}
            className="badge"
            title={detail.title}
            loading={loading}
            style={imgStyle}
          />
        ))}
      </div>
    );
  }

  if (!badges || Object.keys(badges).length === 0) return null;

  return (
    <div className={className} style={baseStyle}>
      {Object.entries(badges).map(([name, url]) => {
        if (!url) return null;
        return (
          <img
            key={name}
            src={url}
            alt={name}
            className="badge"
            title={name}
            loading={loading}
            style={imgStyle}
          />
        );
      })}
    </div>
  );
}
