import { describe, it, expect, vi } from "vitest";
import {
  applyLiveChatFilter,
  parseAutoModMessage,
} from "../../../src/pages/api/youtube-stream-chat.automod-bridge";

function makeHeldItem() {
  return {
    id: "held-1",
    timestamp: Date.now(),
    header_text: { toString: () => "Held for review" },
    auto_moderated_item: {
      is: () => false,
      author: {
        name: { toString: () => "alice" },
        id: "UC-alice",
        thumbnails: [],
      },
      message: { runs: [{ text: "buy followers" }] },
      timestamp: String(Date.now()),
    },
    moderation_buttons: [
      { text: "Approve", is_disabled: false },
      { text: "Deny", is_disabled: false },
    ],
  };
}

describe("parseAutoModMessage", () => {
  it("extracts the held message and approve/deny labels", () => {
    const item = makeHeldItem();
    const sink = new Map<string, any>();

    const msg = parseAutoModMessage(item, sink);

    expect(msg).not.toBeNull();
    expect(msg!.id).toBe("held-1");
    expect(msg!.messageType).toBe("automod");
    expect(msg!.author).toBe("alice");
    expect(msg!.parts).toEqual([{ type: "text", text: "buy followers" }]);
    expect(msg!.automodButtons).toEqual([
      { text: "Approve", is_disabled: false },
      { text: "Deny", is_disabled: false },
    ]);
  });

  it("keeps the raw endpoint-bearing item server-side only", () => {
    const item = makeHeldItem();
    const sink = new Map<string, any>();

    const msg = parseAutoModMessage(item, sink);

    expect(sink.get("held-1")).toBe(item);
    expect((msg as any).automodItem).toBeUndefined();
    expect(JSON.stringify(msg)).not.toContain("moderation_buttons");
  });

  it("falls back to the header text when the held item is unavailable", () => {
    const item = {
      id: "held-2",
      timestamp: Date.now(),
      header_text: { toString: () => "Held for review" },
      auto_moderated_item: undefined,
      moderation_buttons: [{ text: "Approve", is_disabled: false }],
    };

    const msg = parseAutoModMessage(item, new Map());

    expect(msg!.parts).toEqual([{ type: "text", text: "Held for review" }]);
  });
});

describe("applyLiveChatFilter", () => {
  function makeChat(selected: boolean) {
    return {
      applyFilter: vi.fn(),
      initial_info: {
        header: {
          view_selector: {
            sub_menu_items: [
              { title: "Top chat", selected: !selected, continuation: "top" },
              { title: "Live chat", selected, continuation: "live" },
            ],
          },
        },
      },
    };
  }

  it("switches from Top chat to Live chat so held messages are visible", () => {
    const chat = makeChat(false);

    expect(applyLiveChatFilter(chat)).toBe(true);
    expect(chat.applyFilter).toHaveBeenCalledWith("LIVE_CHAT");
  });

  it("does not re-apply when Live chat is already selected", () => {
    const chat = makeChat(true);

    expect(applyLiveChatFilter(chat)).toBe(false);
    expect(chat.applyFilter).not.toHaveBeenCalled();
  });

  it("does nothing when the chat has no filter selector", () => {
    const chat = { applyFilter: vi.fn(), initial_info: {} };

    expect(applyLiveChatFilter(chat)).toBe(false);
    expect(chat.applyFilter).not.toHaveBeenCalled();
  });
});
