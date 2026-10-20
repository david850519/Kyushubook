import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const pagesPath = (process.env.PAGES_BASE_PATH ?? "").replace(/^\/+|\/+$/g, "");
const base = pagesPath ? `/${pagesPath}/` : "/";

export default defineConfig({
  base,
  server: {
    host: "127.0.0.1",
    fs: {
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem}",
        "**/.git/**",
        "**/private/**",
        "**/*.kykey",
        "**/*.kyushu",
        "**/*.kybackup",
        "**/九州小書v1.pdf",
      ],
    },
  },
  preview: { host: "127.0.0.1" },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["apple-touch-icon.png", "icon-192.png", "icon-512.png"],
      manifest: {
        id: base,
        name: "晨萱九州遊",
        short_name: "晨萱九州遊",
        lang: "zh-Hant",
        start_url: base,
        scope: base,
        display: "standalone",
        background_color: "#fbfcfa",
        theme_color: "#456953",
        icons: [
          { src: `${base}icon-192.png`, sizes: "192x192", type: "image/png" },
          {
            src: `${base}icon-512.png`,
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{html,js,mjs,css,woff2,png,jpg,pdf,ttf,pfb}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
    }),
  ],
});
