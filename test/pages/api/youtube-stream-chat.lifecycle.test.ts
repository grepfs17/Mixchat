import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

const mocks = vi.hoisted(() => ({
  getInnertube: vi.fn(),
  createAuthenticatedInnertube: vi.fn(),
}));

vi.mock("youtubei.js", () => ({ YTNodes: {} }));
vi.mock("../../../src/lib/youtube", () => ({
  getInnertube: mocks.getInnertube,
  createAuthenticatedInnertube: mocks.createAuthenticatedInnertube,
}));
vi.mock("../../../src/lib/rateLimit", () => ({ checkRateLimit: () => true }));
vi.mock("../../../src/lib/constants", () => ({
  IS_TWITCH_ONLY: false,
  twitchOnlyResponse: () => new Response(null, { status: 404 }),
}));

import { GET } from "../../../src/pages/api/youtube-stream-chat";

const PROXY_400 =
  "Request to https://proxy.example/api/youtube/youtubei/v1/live_chat/get_live_chat failed with status code 400";

class FakeChat extends EventEmitter {
  stopped = false;
  start() {
    queueMicrotask(() => this.emit("start", { viewer_name: "tester" }));
  }
  stop() {
    this.stopped = true;
  }
}

/** A fake InnerTube client whose getInfo().getLiveChat() yields tracked chats. */
function fakeClient(created: FakeChat[]) {
  return {
    getInfo: vi.fn(async () => ({
      getLiveChat: () => {
        const chat = new FakeChat();
        created.push(chat);
        return chat;
      },
    })),
  };
}

function cookiesFor(values: Record<string, string>) {
  return {
    get: (name: string) =>
      values[name] !== undefined ? { value: values[name] } : undefined,
  };
}

function openStream(videoId: string, cookies: ReturnType<typeof cookiesFor>) {
  const url = new URL(`http://localhost/api/youtube-stream-chat?videoId=${videoId}`);
  return GET({
    request: new Request(url),
    url,
    cookies,
  } as any) as Promise<Response>;
}

/** Collects SSE chunks in the background so tests can inspect them later. */
function collectSse(res: Response): string[] {
  const chunks: string[] = [];
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  void (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(typeof value === "string" ? value : decoder.decode(value));
    }
  })();
  return chunks;
}

function eventsNamed(chunks: string[], name: string): unknown[] {
  const text = chunks.join("");
  const out: unknown[] = [];
  const re = new RegExp(`event: ${name}\\ndata: (.*)\\n`, "g");
  for (const m of text.matchAll(re)) out.push(JSON.parse(m[1]));
  return out;
}

/** Lets pending promises and stream reads settle. */
async function settle(ms = 0) {
  await vi.advanceTimersByTimeAsync(ms);
  for (let i = 0; i < 20; i++) await new Promise<void>((r) => queueMicrotask(() => r()));
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.getInnertube.mockReset();
  mocks.createAuthenticatedInnertube.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("authenticated chat that fails with a non-transient error", () => {
  it("rebuilds the chat as a guest instead of ending the stream", async () => {
    const authChats: FakeChat[] = [];
    const guestChats: FakeChat[] = [];
    const authYt = fakeClient(authChats);
    const guestYt = fakeClient(guestChats);
    mocks.createAuthenticatedInnertube.mockResolvedValue({ yt: authYt, auth: {} });
    mocks.getInnertube.mockResolvedValue(guestYt);

    const videoId = "AAAAAAAAAA1";
    const res = await openStream(videoId, cookiesFor({ youtube_token: "tok-degrade" }));
    const chunks = collectSse(res);
    await settle();

    expect(authChats).toHaveLength(1);
    authChats[0].emit("error", new Error(PROXY_400));
    await settle();

    expect(guestChats).toHaveLength(1);
    expect(authChats[0].stopped).toBe(true);
    expect(eventsNamed(chunks, "notice")).toContainEqual({ status: "reconnected" });

    // The original 30s teardown must not fire against the rebuilt chat.
    await settle(31_000);
    expect(eventsNamed(chunks, "error")).toHaveLength(0);
    expect(eventsNamed(chunks, "end")).toHaveLength(0);
  });

  it("tears down with a sanitized status if the guest rebuild cannot start", async () => {
    const authChats: FakeChat[] = [];
    mocks.createAuthenticatedInnertube.mockResolvedValue({
      yt: fakeClient(authChats),
      auth: {},
    });
    mocks.getInnertube.mockRejectedValue(new Error("guest cooling down"));

    const res = await openStream(
      "AAAAAAAAAA2",
      cookiesFor({ youtube_token: "tok-teardown" }),
    );
    const chunks = collectSse(res);
    await settle();

    authChats[0].emit("error", new Error(PROXY_400));
    await settle(31_000);

    const errors = eventsNamed(chunks, "error");
    expect(errors).toEqual([{ error: "Chat connection lost (YouTube HTTP 400)" }]);
    expect(JSON.stringify(errors)).not.toContain("proxy.example");
  });
});

describe("guest chat with a non-transient error", () => {
  it("cancels the 30s teardown when a transient error follows", async () => {
    const guestChats: FakeChat[] = [];
    mocks.getInnertube.mockResolvedValue(fakeClient(guestChats));

    const res = await openStream("AAAAAAAAAA3", cookiesFor({}));
    const chunks = collectSse(res);
    await settle();

    guestChats[0].emit("error", new Error(PROXY_400));
    await settle(5_000);
    guestChats[0].emit(
      "error",
      new Error("Reached retry limit for incremental continuation requests"),
    );
    await settle(31_000);

    expect(eventsNamed(chunks, "error")).toHaveLength(0);
    expect(eventsNamed(chunks, "notice")).toContainEqual({ status: "reconnecting" });
  });
});
