import { describe, it, expect } from "vitest";
import { isSecureRequest } from "../../src/lib/secureRequest";

describe("isSecureRequest", () => {
  it("is false for plain http, as served by the desktop loopback", () => {
    const req = new Request("http://localhost:3000/api/auth/twitch/device/start");
    expect(isSecureRequest(req)).toBe(false);
  });

  it("is true for https", () => {
    const req = new Request("https://mixchat.example/api/auth/twitch/device/start");
    expect(isSecureRequest(req)).toBe(true);
  });

  it("honors x-forwarded-proto behind a TLS-terminating proxy", () => {
    const req = new Request("http://internal/api/auth/twitch/device/start", {
      headers: { "x-forwarded-proto": "https" },
    });
    expect(isSecureRequest(req)).toBe(true);
  });

  it("uses the first value of a forwarded chain", () => {
    const req = new Request("http://internal/api/auth/twitch/device/start", {
      headers: { "x-forwarded-proto": "https, http" },
    });
    expect(isSecureRequest(req)).toBe(true);
  });
});
