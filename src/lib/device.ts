export function isMobileDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

export function isFirefox(): boolean {
  if (typeof navigator === "undefined") return false;
  // SeaMonkey reports a Firefox-compatible UA, so exclude it explicitly.
  return (
    /Firefox\/\d+/.test(navigator.userAgent) &&
    !/Seamonkey/i.test(navigator.userAgent)
  );
}
