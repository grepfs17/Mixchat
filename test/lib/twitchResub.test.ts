import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchTwitchResubNotification,
  shareTwitchResubMessage,
  TwitchResubAuthError,
} from "../../src/lib/twitchResub";

const NOTIFICATION = {
  id: "notification-id",
  token: "notification-token",
  months: 1,
  cumulativeTenureMonths: 12,
  streakTenureMonths: 7,
  isGiftSubscription: false,
};

function gqlResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

function notificationResponse(
  notification: typeof NOTIFICATION | null,
): Response {
  return gqlResponse({
    data: { user: { self: { resubNotification: notification } } },
  });
}

function shareResponse(isSuccess: boolean): Response {
  return gqlResponse({
    data: { useChatNotificationToken: { isSuccess } },
  });
}

describe("twitchResub", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a pending resub notification", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(notificationResponse(NOTIFICATION));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchTwitchResubNotification("channel", "token");

    expect(result).toEqual(NOTIFICATION);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer token");
  });

  it("hides gifted renewals", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          notificationResponse({ ...NOTIFICATION, isGiftSubscription: true }),
        ),
    );

    await expect(
      fetchTwitchResubNotification("channel", "token"),
    ).resolves.toBeNull();
  });

  it("throws when Twitch rejects the token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        gqlResponse({
          errors: [
            {
              message: "unauthenticated",
              extensions: { code: "Unauthenticated" },
            },
          ],
        }),
      ),
    );

    await expect(
      fetchTwitchResubNotification("channel", "token"),
    ).rejects.toBeInstanceOf(TwitchResubAuthError);
  });

  it("retries with OAuth when Bearer yields no user session", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(gqlResponse({ data: { user: { self: null } } }))
      .mockResolvedValueOnce(notificationResponse(NOTIFICATION));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchTwitchResubNotification("channel", "token");

    expect(result).toEqual(NOTIFICATION);
    const [, init] = fetchMock.mock.calls[1];
    expect(init.headers.Authorization).toBe("OAuth token");
  });

  it("shares with the notification token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(notificationResponse(NOTIFICATION))
      .mockResolvedValueOnce(shareResponse(true));
    vi.stubGlobal("fetch", fetchMock);

    const result = await shareTwitchResubMessage(
      "channel",
      "hello",
      true,
      "token",
    );

    expect(result.ok).toBe(true);
    const [, init] = fetchMock.mock.calls[1];
    const body = JSON.parse(init.body);
    expect(body.variables.input).toEqual({
      channelLogin: "channel",
      includeStreak: true,
      message: "hello",
      tokenID: NOTIFICATION.token,
    });
  });

  it("falls back to the notification id when the token fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(notificationResponse(NOTIFICATION))
      .mockResolvedValueOnce(shareResponse(false))
      .mockResolvedValueOnce(shareResponse(true));
    vi.stubGlobal("fetch", fetchMock);

    const result = await shareTwitchResubMessage(
      "channel",
      "",
      false,
      "token",
    );

    expect(result.ok).toBe(true);
    const [, init] = fetchMock.mock.calls[2];
    const body = JSON.parse(init.body);
    expect(body.variables.input.tokenID).toBe(NOTIFICATION.id);
  });

  it("reports when there is nothing to share", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(notificationResponse(null)),
    );

    await expect(
      shareTwitchResubMessage("channel", "", false, "token"),
    ).resolves.toEqual({ ok: false, reason: "no-notification" });
  });
});
