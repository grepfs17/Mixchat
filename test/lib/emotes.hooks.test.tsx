import { act, render } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import {
  setEmotes7tv,
  setEmotesBttv,
  setEmotesFfz,
  setEmoteAuthors,
  bumpEmoteMapVersion,
  notifyEmotesReloaded,
  toggleDisableEmote,
  useEmoteMapVersion,
  useDisabledEmotes,
} from "../../src/lib/emotes";

function HookProbe<T>({
  useHook,
  onValue,
}: {
  useHook: () => T;
  onValue: (v: T) => void;
}) {
  const v = useHook();
  React.useEffect(() => {
    onValue(v);
  });
  return null;
}

describe("emotes hooks", () => {
  beforeEach(() => {
    localStorage.clear();
    setEmotes7tv({});
    setEmotesBttv({});
    setEmotesFfz({});
    setEmoteAuthors({});
    bumpEmoteMapVersion();
    notifyEmotesReloaded();
  });

  it("useEmoteMapVersion bumps when emotes-reloaded fires", () => {
    const seen: number[] = [];
    render(<HookProbe useHook={useEmoteMapVersion} onValue={(v) => seen.push(v)} />);
    const before = seen[seen.length - 1];
    act(() => {
      setEmotes7tv({ Cool: "https://cdn.7tv.app/emote/cool/1x.webp" });
      bumpEmoteMapVersion();
      notifyEmotesReloaded();
    });
    const after = seen[seen.length - 1];
    expect(after).toBeGreaterThan(before);
  });

  it("useDisabledEmotes reflects localStorage toggles via the emotes-reloaded event", () => {
    const seen: Set<string>[] = [];
    render(
      <HookProbe
        useHook={useDisabledEmotes}
        onValue={(v) => seen.push(v as Set<string>)}
      />,
    );
    expect(seen[seen.length - 1].size).toBe(0);
    act(() => {
      toggleDisableEmote("Cool");
    });
    const latest = seen[seen.length - 1];
    expect(latest.has("Cool")).toBe(true);
  });

  it("useDisabledEmotes updates on cross-tab storage events", () => {
    const seen: Set<string>[] = [];
    render(
      <HookProbe
        useHook={useDisabledEmotes}
        onValue={(v) => seen.push(v as Set<string>)}
      />,
    );
    act(() => {
      localStorage.setItem("disabled_emotes_v1", JSON.stringify(["FromOtherTab"]));
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "disabled_emotes_v1",
          newValue: JSON.stringify(["FromOtherTab"]),
        }),
      );
    });
    const latest = seen[seen.length - 1];
    expect(latest.has("FromOtherTab")).toBe(true);
  });

  it("useDisabledEmotes ignores storage events for unrelated keys", () => {
    const seen: Set<string>[] = [];
    render(
      <HookProbe
        useHook={useDisabledEmotes}
        onValue={(v) => seen.push(v as Set<string>)}
      />,
    );
    const renderCountBefore = seen.length;
    const referenceBefore = seen[seen.length - 1];
    act(() => {
      // Fire a storage event for an unrelated key, the hook should NOT
      // re-read localStorage or trigger a re-render. We verify by checking
      // that no new snapshot was published and the returned set reference
      // is unchanged.
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "mixchat_font_size",
          newValue: "16",
        }),
      );
    });
    expect(seen.length).toBe(renderCountBefore);
    expect(seen[seen.length - 1]).toBe(referenceBefore);
  });

  it("useDisabledEmotes refreshes on storage events with a null key (full clear)", () => {
    const seen: Set<string>[] = [];
    // Pre-populate a disabled emote via localStorage before the hook mounts.
    localStorage.setItem("disabled_emotes_v1", JSON.stringify(["FromSetup"]));
    render(
      <HookProbe
        useHook={useDisabledEmotes}
        onValue={(v) => seen.push(v as Set<string>)}
      />,
    );
    expect(seen[seen.length - 1].has("FromSetup")).toBe(true);
    act(() => {
      localStorage.removeItem("disabled_emotes_v1");
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: null,
          newValue: null,
        }),
      );
    });
    expect(seen[seen.length - 1].size).toBe(0);
  });
});

// keep the import live for vitest
void vi;
