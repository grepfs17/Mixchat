import type { ReactNode } from "react";

const NON_ASCII = /[^\x00-\x7F]/;

/**
 * Build the visual author label for a Twitch message.
 *
 * Renders `displayName (login)` only when the user has set a non-ASCII
 * localized display name that differs from the ASCII login. In every other
 * case, returns the raw display name unchanged so downstream code that
 * parses or compares the author field continues to work.
 */
export function renderAuthorLabel(
  displayName: string,
  userName: string | undefined,
): ReactNode {
  if (
    userName &&
    displayName !== userName &&
    NON_ASCII.test(displayName)
  ) {
    return (
      <>
        {displayName} ({userName})
      </>
    );
  }
  return displayName;
}
