import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { renderAuthorLabel } from "../../src/lib/twitchAuthorLabel";

describe("renderAuthorLabel", () => {
  it("returns displayName unchanged when userName is missing", () => {
    expect(renderToStaticMarkup(<>{renderAuthorLabel("알렌", undefined)}</>)).toBe(
      "알렌",
    );
  });

  it("returns displayName unchanged when displayName equals userName", () => {
    expect(
      renderToStaticMarkup(
        <>{renderAuthorLabel("fancywindow", "fancywindow")}</>,
      ),
    ).toBe("fancywindow");
  });

  it("returns displayName unchanged when both are ASCII but differ in case", () => {
    expect(
      renderToStaticMarkup(
        <>{renderAuthorLabel("FancyWindow", "fancywindow")}</>,
      ),
    ).toBe("FancyWindow");
  });

  it("appends userName in parens for a Korean localized display name", () => {
    expect(
      renderToStaticMarkup(<>{renderAuthorLabel("알렌", "allenhklee")}</>),
    ).toBe("알렌 (allenhklee)");
  });

  it("appends userName in parens for a Japanese localized display name", () => {
    expect(
      renderToStaticMarkup(
        <>{renderAuthorLabel("경식익환문", "fancywindow")}</>,
      ),
    ).toBe("경식익환문 (fancywindow)");
  });

  it("appends userName in parens for an Arabic localized display name", () => {
    expect(
      renderToStaticMarkup(<>{renderAuthorLabel("اسم", "username")}</>),
    ).toBe("اسم (username)");
  });

  it("does not append parens when displayName contains a non-ASCII char but matches userName", () => {
    expect(
      renderToStaticMarkup(<>{renderAuthorLabel("알렌", "알렌")}</>),
    ).toBe("알렌");
  });
});
