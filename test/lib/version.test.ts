import { describe, it, expect } from "vitest";
import { DISPLAY_VERSION, GIT_BRANCH } from "../../src/lib/version";

describe("version", () => {
  it("exposes a display version", () => {
    expect(DISPLAY_VERSION).toMatch(/^Beta \d/);
    // The prerelease suffix is stripped for display.
    expect(DISPLAY_VERSION).not.toContain("-beta");
  });

  it("exposes the build branch as a string", () => {
    // No `define` runs under Vitest, so the identifier must degrade to ""
    // instead of throwing on an undeclared global.
    expect(typeof GIT_BRANCH).toBe("string");
  });
});
