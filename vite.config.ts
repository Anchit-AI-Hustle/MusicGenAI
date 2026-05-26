import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

const disablePwaForLocalPath = __dirname.includes("'") && !process.env.VERCEL;

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  server: {
    host: "::",
    port: 8080,
    hmr: {
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      disable: disablePwaForLocalPath,
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "favicon.png", "pwa-icon-192.png", "pwa-icon-512.png"],
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallbackDenylist: [/^\/~oauth/],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
      },
      manifest: {
        name: "MuseVibe Studio",
        short_name: "MuseVibe",
        description: "AI-Powered Music Creation Platform",
        theme_color: "#22d3ee",
        background_color: "#0a0a0f",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/pwa-icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/pwa-icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
