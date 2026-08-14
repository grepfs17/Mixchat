import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  initializeBadges,
  getBadge,
  getBadgeDetail,
  clearBadgeCache,
} from "../../src/lib/badges";

const globalBadges = {
  data: [
    {
      set_id: "moderator",
      versions: [
        {
          id: "1",
          image_url_1x: "http://badge.com/moderator/1/1x",
          image_url_2x: "http://badge.com/moderator/1/2x",
          title: "Mod",
          description: "Moderator",
        },
      ],
    },
    {
      set_id: "subscriber",
      versions: [
        {
          id: "0",
          image_url_2x: "http://badge.com/subscriber/0/2x",
          title: "Sub",
          description: "Subscriber",
        },
      ],
    },
  ],
};

const channelBadges = {
  data: [
    {
      set_id: "subscriber",
      versions: [
        {
          id: "12",
          image_url_2x: "http://badge.com/subscriber/12/2x",
          title: "12-Month Sub",
          description: "1 Year Subscriber",
        },
      ],
    },
    {
      set_id: "custom-badge",
      versions: [
        {
          id: "1",
          image_url_2x: "http://badge.com/custom-badge/1/2x",
          title: "VIP+",
          description: "Special VIP",
        },
      ],
    },
  ],
};

function jsonResponse(data: unknown) {
  return { ok: true, status: 200, json: async () => data };
}

describe("badges lib", () => {
  beforeEach(() => {
    clearBadgeCache();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("initializes and retrieves global badges", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input: any) => {
      const url = String(input);
      if (url.includes("/helix/chat/badges/global")) {
        return Promise.resolve(jsonResponse(globalBadges) as any);
      }
      if (url.includes("/helix/chat/badges")) {
        return Promise.resolve(jsonResponse({ data: [] }) as any);
      }
      return Promise.resolve(jsonResponse({ data: [] }) as any);
    });

    await initializeBadges("123");

    const modBadge = getBadge("moderator", "1");
    expect(modBadge).toBe("http://badge.com/moderator/1/2x");

    const detail = getBadgeDetail("moderator", "1");
    expect(detail).toEqual({
      id: "moderator",
      version: "1",
      url: "http://badge.com/moderator/1/2x",
      title: "Mod",
      description: "Moderator",
    });
  });

  it("prioritizes channel badges over global badges", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input: any) => {
      const url = String(input);
      if (url.includes("/helix/chat/badges/global")) {
        return Promise.resolve(jsonResponse(globalBadges) as any);
      }
      if (url.includes("/helix/chat/badges")) {
        return Promise.resolve(jsonResponse(channelBadges) as any);
      }
      return Promise.resolve(jsonResponse({ data: [] }) as any);
    });

    await initializeBadges("123");

    const channelSub = getBadgeDetail("subscriber", "12");
    expect(channelSub?.title).toBe("12-Month Sub");

    const customBadge = getBadgeDetail("custom-badge", "1");
    expect(customBadge?.title).toBe("VIP+");
  });

  it("returns undefined for non-existent badges", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input: any) => {
      const url = String(input);
      if (url.includes("/helix/chat/badges/global")) {
        return Promise.resolve(jsonResponse(globalBadges) as any);
      }
      if (url.includes("/helix/chat/badges")) {
        return Promise.resolve(jsonResponse(channelBadges) as any);
      }
      return Promise.resolve(jsonResponse({ data: [] }) as any);
    });

    await initializeBadges("123");
    expect(getBadge("non-existent", "1")).toBeUndefined();
  });

  it("resolves a login name to a numeric broadcaster ID", async () => {
    const fetchMock = vi.mocked(fetch);
    const calls: string[] = [];
    fetchMock.mockImplementation((input: any) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/helix/users")) {
        return Promise.resolve(jsonResponse({ data: [{ id: "123" }] }) as any);
      }
      if (url.includes("/helix/chat/badges/global")) {
        return Promise.resolve(jsonResponse(globalBadges) as any);
      }
      if (url.includes("/helix/chat/badges")) {
        return Promise.resolve(jsonResponse(channelBadges) as any);
      }
      return Promise.resolve(jsonResponse({ data: [] }) as any);
    });

    await initializeBadges("my_channel");

    expect(calls.some((c) => c.includes("/helix/users&login=my_channel"))).toBe(
      true,
    );
    expect(
      calls.some((c) => c.includes("broadcaster_id=123")),
    ).toBe(true);
  });
});
