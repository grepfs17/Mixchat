import "@testing-library/jest-dom/vitest";

// In Node 20 / Vitest environment, Response and Headers are already
// defined globally. Polyfilling them from node-fetch is no longer
// required and avoids deprecation warnings.
if (typeof globalThis.Response === "undefined") {
  console.warn("Polyfilling Response for test environment");
}
