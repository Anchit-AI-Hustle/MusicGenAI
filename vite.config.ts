import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

const disablePwaForLocalPath = __dirname.includes("'") && !process.env.VERCEL;
const spessaSynthProcessor = `${path.resolve(
  __dirname,
  "./node_modules/spessasynth_lib/dist/spessasynth_processor.min.js",
)}?url`;

function createMusicDevelopmentProxy(mode: string) {
  const env = loadEnv(mode, process.cwd(), "");
  const apiKey = env.AI_MUSIC_API_KEY?.trim();
  const rawUrl = env.AI_MUSIC_API_URL?.trim();
  if (!apiKey || !rawUrl) return undefined;

  try {
    const upstream = new URL(rawUrl);
    if (upstream.protocol !== "https:" || upstream.username || upstream.password) {
      return undefined;
    }

    const basePath = upstream.pathname.replace(/\/$/, "");
    return {
      target: upstream.origin,
      changeOrigin: true,
      secure: true,
      headers: { Authorization: `Bearer ${apiKey}` },
      rewrite(requestPath: string) {
        const localUrl = new URL(requestPath, "http://localhost");
        const id = localUrl.searchParams.get("id");
        return id ? `${basePath}/${encodeURIComponent(id)}` : basePath;
      },
    };
  } catch {
    return undefined;
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const musicProxy = createMusicDevelopmentProxy(mode);

  return {
    envPrefix: ["VITE_", "NEXT_PUBLIC_"],
    server: {
      host: musicProxy ? "127.0.0.1" : "::",
      port: 8080,
      hmr: {},
      proxy: musicProxy ? { "/api/ai-music": musicProxy } : undefined,
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
        "spessasynth_lib/synthetizer/worklet_processor.min.js?url": spessaSynthProcessor,
      },
    },
  };
});
