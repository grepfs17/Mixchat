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
    host: true,
    port: 3000,
    allowedHosts: ["mixchat.local"],
  },
  vite: {
    define: {
      __GIT_BRANCH__: JSON.stringify(gitBranch()),
    },
    ssr: {
      noExternal: ["fs", "path", "url", "util"],
    },
    server: {
      host: "0.0.0.0",
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
