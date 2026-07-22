import "@testing-library/jest-dom/vitest";

// In Node 20 / Vitest environment, Response and Headers are already
// defined globally. Polyfilling them from node-fetch is no longer
// required and avoids deprecation warnings.
if (typeof globalThis.Response === "undefined") {
  console.warn("Polyfilling Response for test environment");
}

// jsdom exposes localStorage/sessionStorage on `window`, but not as
// globals. Alias them so tests can use `localStorage`/`sessionStorage`
// directly. Tests that need a clean store already call `clear()` in
// `beforeEach`.
function setupGlobalStorage(): void {
  Object.defineProperty(globalThis, "localStorage", {
    value: getStorage("localStorage"),
    writable: true,
    configurable: true,
  });

  Object.defineProperty(globalThis, "sessionStorage", {
    value: getStorage("sessionStorage"),
    writable: true,
    configurable: true,
  });
}

function getStorage(name: "localStorage" | "sessionStorage"): Storage {
  const real = typeof window !== "undefined" ? window[name] : undefined;
  return real && typeof real.clear === "function" ? real : createInMemoryStorage();
}

function createInMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    key(index: number): string | null {
      return Array.from(store.keys())[index] ?? null;
    },
    getItem(key: string): string | null {
      return store.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      store.set(key, value);
    },
    removeItem(key: string): void {
      store.delete(key);
    },
    clear(): void {
      store.clear();
    },
  } as Storage;
}

setupGlobalStorage();
