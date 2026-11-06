import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import node from "@astrojs/node";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/**
 * Branch the bundle is built from, so the footer can show it. Falls back to a
 * short SHA on a detached HEAD, and to an empty string when git is unavailable
 * (e.g. building from a source tarball) so the UI simply omits it.
 */
function gitBranch() {
  const run = (args) =>
    execFileSync("git", args, { cwd: projectRoot, encoding: "utf8" }).trim();
  try {
    const branch = run(["rev-parse", "--abbrev-ref", "HEAD"]);
    return branch === "HEAD" ? run(["rev-parse", "--short", "HEAD"]) : branch;
  } catch {
    return "";
  }
}

export default defineConfig({
  site: "https://mixchat.grepfs.xyz/",
  integrations: [react()],
  adapter: node({ mode: "standalone" }),
  output: "server",
  server: {
    // The desktop build runs as a Tauri sidecar. It must listen on loopback
    // only, otherwise /api/desktop/open and the OAuth handoff endpoints are
    // reachable from the whole LAN. HOST still overrides at runtime.
    host:
      process.env.PUBLIC_APP_PLATFORM === "desktop" ? "127.0.0.1" : true,
    port: 3000,
    allowedHosts: ["mixchat.local"],
  },
  vite: {
    define: {
      __GIT_BRANCH__: JSON.stringify(gitBranch()),
    },
    ssr: {
      // The desktop server bundle must be self-contained so the Tauri sidecar
      // does not need the project's node_modules at runtime. jsdom stays
      // external because it reads its stylesheet relative to __dirname, which
      // breaks when bundled into ESM. The Tauri prepare step installs jsdom
      // next to the server bundle.
      noExternal:
        process.env.PUBLIC_APP_PLATFORM === "desktop"
          ? true
          : ["fs", "path", "url", "util"],
      external:
        process.env.PUBLIC_APP_PLATFORM === "desktop" ? ["jsdom"] : [],
    },
    server: {
      host: process.env.PUBLIC_APP_PLATFORM === "desktop"
        ? "127.0.0.1"
        : "0.0.0.0",
      allowedHosts: ["localhost", "127.0.0.1", "mixchat.local"],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id) return;
            if (
              id.includes("/node_modules/react-icons/") ||
              id.includes("\\node_modules\\react-icons\\")
            )
              return "icons";
            if (
              id.includes("/node_modules/youtubei.js/") ||
              id.includes("\\node_modules\\youtubei.js\\")
            )
              return "youtubei";
            if (
              id.includes("/node_modules/@twurple/") ||
              id.includes("\\node_modules\\@twurple\\")
            )
              return "twurple";
            if (
              id.includes("/node_modules/hls.js/") ||
              id.includes("\\node_modules\\hls.js\\")
            )
              return "hls";
          },
        },
      },
      chunkSizeWarningLimit: 1000,
    },
  },
});
