/**
 * Twitch resubscription sharing.
 *
 * Twitch has no public endpoint for sending the "share your resub" message.
 * The first-party web client reads a pending `resubNotification` from its GQL
 * API and redeems it with the `useChatNotificationToken` mutation. We use the
 * same internal operations server-side, with the viewer's own OAuth token.
 */

const GQL_CLIENT_ID =
  import.meta.env.TWITCH_GQL_CLIENT_ID ?? "kimne78kx3ncx6brgo4mv6wki5h1ko";

const GQL_ENDPOINT = "https://gql.twitch.tv/gql";

const BASE_GQL_HEADERS = {
  "Client-ID": GQL_CLIENT_ID,
  "Content-Type": "application/json",
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 (compatible; mixchat/0.1)",
};

/** Thrown when Twitch rejects the viewer's OAuth token. */
export class TwitchResubAuthError extends Error {
  constructor(message = "Twitch login expired") {
    super(message);
    this.name = "TwitchResubAuthError";
  }
}

/** Server-only shape. The `token` must never be sent to the browser. */
export interface TwitchResubNotificationRaw {
  id: string;
  token: string;
  months: number;
  cumulativeTenureMonths: number;
  streakTenureMonths: number;
  isGiftSubscription: boolean;
}

/** Public shape returned by GET /api/twitch-resub. */
export interface TwitchResubNotification {
  id: string;
  months: number;
  cumulativeTenureMonths: number;
  streakTenureMonths: number;
}

interface GqlError {
  message?: string;
  extensions?: { code?: string };
}

interface GqlResponse<T> {
  data?: T;
  errors?: GqlError[];
}

function isUnauthenticated(errors: GqlError[] | undefined): boolean {
  return Boolean(
    errors?.some(
      (error) =>
        error.extensions?.code === "Unauthenticated" ||
        error.message?.toLowerCase() === "unauthenticated",
    ),
  );
}

type GqlAuthScheme = "Bearer" | "OAuth";

async function postGql<T>(
  body: unknown,
  accessToken: string,
  scheme: GqlAuthScheme = "Bearer",
): Promise<GqlResponse<T>> {
  const res = await fetch(GQL_ENDPOINT, {
    method: "POST",
    headers: {
      ...BASE_GQL_HEADERS,
      Authorization: `${scheme} ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  if (res.status === 401 || res.status === 403) {
    throw new TwitchResubAuthError();
  }
  if (!res.ok) {
    throw new Error(`Twitch GQL resub error: ${res.status}`);
  }

  const data = (await res.json()) as GqlResponse<T>;
  if (isUnauthenticated(data.errors)) {
    throw new TwitchResubAuthError();
  }
  return data;
}

/**
 * Twitch's GQL gateway has accepted API tokens as `Bearer` and the website
 * token as `OAuth`. Try the current API scheme first, then fall back once when
 * the gateway rejects the credentials.
 */
async function postGqlAuthFallback<T>(
  body: unknown,
  accessToken: string,
): Promise<GqlResponse<T>> {
  try {
    return await postGql<T>(body, accessToken, "Bearer");
  } catch (err) {
    if (!(err instanceof TwitchResubAuthError)) throw err;
    return postGql<T>(body, accessToken, "OAuth");
  }
}

interface ResubNotificationData {
  user?: {
    self?: {
      resubNotification?: TwitchResubNotificationRaw | null;
    } | null;
  } | null;
}

function toPublicNotification(
  raw: TwitchResubNotificationRaw,
): TwitchResubNotification {
  return {
    id: raw.id,
    months: raw.months,
    cumulativeTenureMonths: raw.cumulativeTenureMonths,
    streakTenureMonths: raw.streakTenureMonths,
  };
}

/**
 * Fetch the viewer's pending resub notification for a channel. Returns null
 * when there is nothing to share, including gifted renewals (Twitch does not
 * offer the share banner for those).
 */
export async function fetchTwitchResubNotification(
  channelLogin: string,
  accessToken: string,
): Promise<TwitchResubNotificationRaw | null> {
  const body = {
    operationName: "ResubNotification",
    variables: { channelLogin },
    query: `query ResubNotification($channelLogin: String!) {
      user(login: $channelLogin) {
        id
        self {
          resubNotification {
            id
            token
            months
            cumulativeTenureMonths
            streakTenureMonths
            isGiftSubscription
          }
        }
      }
    }`,
  };

  let gqlData = await postGqlAuthFallback<ResubNotificationData>(
    body,
    accessToken,
  );

  // A 200 with `self: null` means the gateway accepted the token but did not
  // treat it as a user session. Retry with the website `OAuth` scheme once.
  if (gqlData.data?.user?.self == null) {
    try {
      const oauthData = await postGql<ResubNotificationData>(
        body,
        accessToken,
        "OAuth",
      );
      if (oauthData.data?.user?.self) gqlData = oauthData;
    } catch {
      // Keep the Bearer result (null notification) when OAuth also fails.
    }
  }

  if (Array.isArray(gqlData.errors) && gqlData.errors.length > 0) {
    console.warn(
      "[twitchResub] GQL returned errors while fetching notification:",
      gqlData.errors,
    );
    return null;
  }

  const notification = gqlData.data?.user?.self?.resubNotification;
  if (!notification || notification.isGiftSubscription) return null;
  return notification;
}

interface UseChatNotificationTokenData {
  useChatNotificationToken?: { isSuccess?: boolean } | null;
}

async function useChatNotificationToken(
  channelLogin: string,
  tokenId: string,
  message: string,
  includeStreak: boolean,
  accessToken: string,
): Promise<boolean> {
  const gqlData = await postGqlAuthFallback<UseChatNotificationTokenData>(
    {
      operationName: "UseChatNotificationToken",
      variables: {
        input: {
          channelLogin,
          includeStreak,
          message,
          tokenID: tokenId,
        },
      },
      query: `mutation UseChatNotificationToken($input: UseChatNotificationTokenInput!) {
        useChatNotificationToken(input: $input) {
          isSuccess
        }
      }`,
    },
    accessToken,
  );

  if (Array.isArray(gqlData.errors) && gqlData.errors.length > 0) {
    console.warn(
      "[twitchResub] GQL returned errors while sharing:",
      gqlData.errors,
    );
    return false;
  }

  return Boolean(gqlData.data?.useChatNotificationToken?.isSuccess);
}

export type ShareResubResult =
  | { ok: true; notification: TwitchResubNotification }
  | { ok: false; reason: "no-notification" | "share-failed" };

/**
 * Share the viewer's pending resub message.
 *
 * Twitch's `ResubNotification` exposes both an `id` and a submission `token`,
 * while `UseChatNotificationTokenInput.tokenID` is documented as "an optional
 * ID of token to be used". Try both (in that order) and stop at the first
 * success. A failed attempt does not consume the notification, so the fallback
 * cannot double-post.
 */
export async function shareTwitchResubMessage(
  channelLogin: string,
  message: string,
  includeStreak: boolean,
  accessToken: string,
): Promise<ShareResubResult> {
  const notification = await fetchTwitchResubNotification(
    channelLogin,
    accessToken,
  );
  if (!notification) return { ok: false, reason: "no-notification" };

  const candidates = Array.from(
    new Set([notification.token, notification.id].filter(Boolean)),
  );

  for (const tokenId of candidates) {
    const shared = await useChatNotificationToken(
      channelLogin,
      tokenId,
      message,
      includeStreak,
      accessToken,
    );
    if (shared) {
      return { ok: true, notification: toPublicNotification(notification) };
    }
  }

  return { ok: false, reason: "share-failed" };
}
