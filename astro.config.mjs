import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import node from "@astrojs/node";

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
