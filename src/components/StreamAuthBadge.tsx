interface StreamAuthBadgeProps {
  authenticated: boolean;
}

export default function StreamAuthBadge({ authenticated }: StreamAuthBadgeProps) {
  return (
    <div
      className={`stream-auth-badge${authenticated ? "" : " stream-auth-badge--guest"}`}
      title={authenticated ? "Stream authenticated — ads skipped for subscribers" : "Not authenticated — stream may include ads"}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        {authenticated ? (
          <>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <path d="m9 12 2 2 4-4"/>
          </>
        ) : (
          <>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <line x1="9" y1="9" x2="15" y2="15"/>
            <line x1="15" y1="9" x2="9" y2="15"/>
          </>
        )}
      </svg>
      {authenticated ? "Ad-free" : "Ads"}
    </div>
  );
}
