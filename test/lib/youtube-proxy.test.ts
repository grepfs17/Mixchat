import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  selectProxy,
  markProxyFailed,
  markProxyOk,
  _resetProxyState,
  _getProxyState,
  PROXY_MAX_FAILS,
  simpleHash,
} from "../../src/lib/youtube";

const PROXY_A = "https://proxy-a.vercel.app";
const PROXY_B = "https://proxy-b.vercel.app";
const PROXY_C = "https://proxy-c.vercel.app";
const PROXIES = [PROXY_A, PROXY_B, PROXY_C];

describe("proxy failover", () => {
  beforeEach(() => {
    _resetProxyState();
  });

  describe("selectProxy", () => {
    it("returns the first proxy when all are healthy", () => {
      expect(selectProxy(PROXIES)).toBe(PROXY_A);
    });

    it("returns undefined when no proxies are configured", () => {
      expect(selectProxy([])).toBeUndefined();
    });

    it("skips proxies in cooldown and returns next available", () => {
      markProxyFailed(PROXY_A);
      markProxyFailed(PROXY_A);
      markProxyFailed(PROXY_A);
      expect(_getProxyState().cooldownUntil[PROXY_A]).toBeGreaterThan(0);

      expect(selectProxy(PROXIES)).toBe(PROXY_B);
    });

    it("falls back to first proxy if all are in cooldown", () => {
      for (const p of PROXIES) {
        markProxyFailed(p);
        markProxyFailed(p);
        markProxyFailed(p);
      }
      expect(selectProxy(PROXIES)).toBe(PROXY_A);
    });
  });

  describe("markProxyFailed", () => {
    it("increments fail count for a proxy", () => {
      markProxyFailed(PROXY_A);
      expect(_getProxyState().failCounts[PROXY_A]).toBe(1);

      markProxyFailed(PROXY_A);
      expect(_getProxyState().failCounts[PROXY_A]).toBe(2);
    });

    it("triggers cooldown after PROXY_MAX_FAILS consecutive failures", () => {
      for (let i = 0; i < PROXY_MAX_FAILS; i++) {
        markProxyFailed(PROXY_A);
      }
      const state = _getProxyState();
      expect(state.failCounts[PROXY_A]).toBe(0);
      expect(state.cooldownUntil[PROXY_A]).toBeGreaterThan(Date.now());
    });

    it("resets fail count after triggering cooldown", () => {
      markProxyFailed(PROXY_A);
      markProxyFailed(PROXY_A);
      markProxyFailed(PROXY_A);
      expect(_getProxyState().failCounts[PROXY_A]).toBe(0);
    });

    it("cooldowns immediately when cooldownMs is provided", () => {
      markProxyFailed(PROXY_A, 60_000);
      const state = _getProxyState();
      expect(state.failCounts[PROXY_A]).toBe(0);
      expect(state.cooldownUntil[PROXY_A]).toBeGreaterThan(Date.now());
    });
  });

  describe("markProxyOk", () => {
    it("clears fail count and cooldown for a proxy", () => {
      markProxyFailed(PROXY_A);
      markProxyFailed(PROXY_A);
      markProxyFailed(PROXY_A);

      expect(_getProxyState().cooldownUntil[PROXY_A]).toBeDefined();

      markProxyOk(PROXY_A);
      expect(_getProxyState().failCounts[PROXY_A]).toBeUndefined();
      expect(_getProxyState().cooldownUntil[PROXY_A]).toBeUndefined();
    });

    it("allows a previously cooled-down proxy to be selected again", () => {
      markProxyFailed(PROXY_A);
      markProxyFailed(PROXY_A);
      markProxyFailed(PROXY_A);

      expect(selectProxy(PROXIES)).toBe(PROXY_B);

      markProxyOk(PROXY_A);
      expect(selectProxy(PROXIES)).toBe(PROXY_A);
    });
  });

  describe("_resetProxyState", () => {
    it("clears all fail counts and cooldowns", () => {
      markProxyFailed(PROXY_A);
      markProxyFailed(PROXY_A);
      markProxyFailed(PROXY_A);

      _resetProxyState();
      expect(_getProxyState().failCounts).toEqual({});
      expect(_getProxyState().cooldownUntil).toEqual({});
    });
  });

  describe("failover integration", () => {
    it("selects next proxy after current one hits cooldown", () => {
      expect(selectProxy(PROXIES)).toBe(PROXY_A);

      for (let i = 0; i < PROXY_MAX_FAILS; i++) {
        markProxyFailed(PROXY_A);
      }

      expect(selectProxy(PROXIES)).toBe(PROXY_B);
    });

    it("recovers proxy after markProxyOk", () => {
      for (let i = 0; i < PROXY_MAX_FAILS; i++) {
        markProxyFailed(PROXY_A);
      }
      expect(selectProxy(PROXIES)).toBe(PROXY_B);

      markProxyOk(PROXY_A);
      expect(selectProxy(PROXIES)).toBe(PROXY_A);
    });

    it("fails over across all proxies and wraps around", () => {
      for (const p of PROXIES) {
        for (let i = 0; i < PROXY_MAX_FAILS; i++) {
          markProxyFailed(p);
        }
      }

      expect(selectProxy(PROXIES)).toBe(PROXY_A);
    });
  });

  describe("hash-based distribution", () => {
    it("simpleHash returns consistent values", () => {
      expect(simpleHash("dQw4w9WgXcQ")).toBe(simpleHash("dQw4w9WgXcQ"));
      expect(simpleHash("abc")).not.toBe(simpleHash("xyz"));
    });

    it("simpleHash produces non-negative integers", () => {
      for (const id of ["dQw4w9WgXcQ", "abc12345678", "x", ""] ) {
        expect(simpleHash(id)).toBeGreaterThanOrEqual(0);
      }
    });

    it("selectProxy with videoId distributes across proxies", () => {
      const assigned = new Set<string>();
      // Try many videoIds — with 3 proxies, hash distribution should hit all of them
      for (let i = 0; i < 100; i++) {
        const videoId = `vid${i.toString().padStart(2, "0")}abcdefghij`;
        assigned.add(selectProxy(PROXIES, videoId)!);
      }
      expect(assigned.size).toBeGreaterThanOrEqual(2);
    });

    it("same videoId always maps to same proxy", () => {
      const videoId = "dQw4w9WgXcQ";
      const first = selectProxy(PROXIES, videoId);
      for (let i = 0; i < 20; i++) {
        expect(selectProxy(PROXIES, videoId)).toBe(first);
      }
    });

    it("falls back to next proxy when preferred one is in cooldown", () => {
      const videoId = "dQw4w9WgXcQ";
      const preferred = selectProxy(PROXIES, videoId)!;

      // Cool down the preferred proxy
      for (let i = 0; i < PROXY_MAX_FAILS; i++) {
        markProxyFailed(preferred);
      }

      const fallback = selectProxy(PROXIES, videoId);
      expect(fallback).not.toBe(preferred);
      expect(PROXIES).toContain(fallback);
    });
  });
});
