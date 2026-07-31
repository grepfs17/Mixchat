import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import React from "react";
import { useYouTubeSync } from "../../src/hooks/chat/chatAppStateHelpers/useYouTubeSync";
import type { YTMessage } from "../../src/components/chat/unified/types";

function msg(over: Partial<YTMessage> = {}): YTMessage {
  return {
    id: "msg-1",
    author: "Tester",
    parts: [{ type: "text", text: "hello" }],
    timestamp: new Date(),
    ...over,
  };
}

type Props = Parameters<typeof useYouTubeSync>[0];

function baseProps(overrides: Partial<Props> = {}): Props {
  return {
    linkedYoutubeUrl: "https://youtube.com/watch?v=abc123def45",
    showYoutubeSection: true,
    selectedTwitchChannelName: "testchannel",
    ...overrides,
  };
}

describe("useYouTubeSync — markYtMessageDeleted first-writer-wins", () => {
  it("sets the label on first call and marks message deleted", () => {
    const { result } = renderHook(() => useYouTubeSync(baseProps()));

    // Seed a message in state so markYtMessageDeleted can find it.
    act(() => {
      result.current.setYtMessages([msg({ id: "msg-1" })]);
    });
    expect(result.current.ytMessages).toHaveLength(1);
    expect(result.current.ytMessages[0].isDeleted).toBeFalsy();

    act(() => {
      result.current.markYtMessageDeleted("msg-1", "Message deleted by a moderator");
    });

    expect(result.current.ytMessages[0].isDeleted).toBe(true);
    expect(result.current.ytMessages[0].deletedByText).toBe(
      "Message deleted by a moderator",
    );
  });

  it("defaults to 'Message deleted by a moderator' when no label is provided", () => {
    const { result } = renderHook(() => useYouTubeSync(baseProps()));

    act(() => {
      result.current.setYtMessages([msg({ id: "msg-1" })]);
    });

    act(() => {
      result.current.markYtMessageDeleted("msg-1");
    });

    expect(result.current.ytMessages[0].isDeleted).toBe(true);
    expect(result.current.ytMessages[0].deletedByText).toBe(
      "Message deleted by a moderator",
    );
  });

  it("preserves the first label when called again with a less specific label (first-writer-wins)", () => {
    const { result } = renderHook(() => useYouTubeSync(baseProps()));

    // Seed a message.
    act(() => {
      result.current.setYtMessages([msg({ id: "msg-1" })]);
    });

    // First call: moderator-deletion sets a specific label.
    act(() => {
      result.current.markYtMessageDeleted(
        "msg-1",
        "Message deleted by a moderator",
      );
    });

    // Second call: SSE arrives later with the generic "Message removed".
    act(() => {
      result.current.markYtMessageDeleted("msg-1", "Message removed");
    });

    // The more specific first label must be preserved.
    expect(result.current.ytMessages[0].isDeleted).toBe(true);
    expect(result.current.ytMessages[0].deletedByText).toBe(
      "Message deleted by a moderator",
    );
  });

  it("preserves the first label even when the second call has no label (SSE fallback)", () => {
    const { result } = renderHook(() => useYouTubeSync(baseProps()));

    act(() => {
      result.current.setYtMessages([msg({ id: "msg-1" })]);
    });

    // First: moderator-deletion label.
    act(() => {
      result.current.markYtMessageDeleted(
        "msg-1",
        "Message deleted by a moderator",
      );
    });

    // Second: no label provided — defaults to "Message deleted by a moderator"
    // but the first-writer-wins guard should keep the existing (same) value.
    act(() => {
      result.current.markYtMessageDeleted("msg-1");
    });

    expect(result.current.ytMessages[0].deletedByText).toBe(
      "Message deleted by a moderator",
    );
  });

  it("applies the existing label to a message that was only marked isDeleted:true without deletedByText", () => {
    const { result } = renderHook(() => useYouTubeSync(baseProps()));

    // Simulate how removeYtMessage works: it sets isDeleted but no deletedByText.
    act(() => {
      result.current.setYtMessages([msg({ id: "msg-1" })]);
    });
    act(() => {
      result.current.removeYtMessage("msg-1");
    });
    expect(result.current.ytMessages[0].isDeleted).toBe(true);
    expect(result.current.ytMessages[0].deletedByText).toBeUndefined();

    // Now call markYtMessageDeleted with the proper mod label.
    act(() => {
      result.current.markYtMessageDeleted(
        "msg-1",
        "Message deleted by a moderator",
      );
    });

    expect(result.current.ytMessages[0].isDeleted).toBe(true);
    expect(result.current.ytMessages[0].deletedByText).toBe(
      "Message deleted by a moderator",
    );
  });

  it("preserves the first label across the full realistic flow: removeYtMessage → mod label → SSE generic label", () => {
    const { result } = renderHook(() => useYouTubeSync(baseProps()));

    act(() => {
      result.current.setYtMessages([msg({ id: "msg-1" })]);
    });

    // Step 1: removeYtMessage fires (old flow — just sets isDeleted:true).
    act(() => {
      result.current.removeYtMessage("msg-1");
    });
    expect(result.current.ytMessages[0].isDeleted).toBe(true);
    expect(result.current.ytMessages[0].deletedByText).toBeUndefined();

    // Step 2: onLocalDeleteWithLabel fires markYtMessageDeleted with the
    // proper moderator-deletion label before the API call.
    act(() => {
      result.current.markYtMessageDeleted(
        "msg-1",
        "Message deleted by a moderator",
      );
    });
    expect(result.current.ytMessages[0].deletedByText).toBe(
      "Message deleted by a moderator",
    );

    // Step 3: SSE "delete" event arrives later with the generic label.
    act(() => {
      result.current.markYtMessageDeleted("msg-1", "Message removed");
    });

    // First-writer-wins: the mod-deletion label survives.
    expect(result.current.ytMessages[0].deletedByText).toBe(
      "Message deleted by a moderator",
    );
  });

  it("is a no-op when the message id is not in ytMessages", () => {
    const { result } = renderHook(() => useYouTubeSync(baseProps()));

    act(() => {
      result.current.setYtMessages([msg({ id: "msg-1" })]);
    });

    // Calling with an unknown id should not throw or change messages.
    act(() => {
      result.current.markYtMessageDeleted("unknown-id");
    });

    expect(result.current.ytMessages).toHaveLength(1);
    expect(result.current.ytMessages[0].isDeleted).toBeFalsy();
  });

  it("survives a full ytMessages replacement via handleYtMessages", () => {
    const { result } = renderHook(() => useYouTubeSync(baseProps()));

    // Seed a message and mark it deleted with a specific label.
    act(() => {
      result.current.setYtMessages([msg({ id: "msg-1" })]);
    });
    act(() => {
      result.current.markYtMessageDeleted(
        "msg-1",
        "Message deleted by @ModName",
      );
    });

    // Simulate a full SSE refresh that re-sends the un-deleted message.
    const freshMessage = msg({ id: "msg-1" });
    act(() => {
      result.current.handleYtMessages([freshMessage]);
    });

    // deletedRef must patch the fresh message back to deleted with the
    // original label.
    const patched = result.current.ytMessages.find((m) => m.id === "msg-1")!;
    expect(patched.isDeleted).toBe(true);
    expect(patched.deletedByText).toBe("Message deleted by @ModName");
  });
});
