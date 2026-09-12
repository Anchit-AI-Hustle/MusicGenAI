import { defineConfig, loadEnv } from "vite";
import type { Plugin } from "vite";
import type { IncomingMessage } from "node:http";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";
import aiMusicHandler from "./api/ai-music";

const disablePwaForLocalPath = __dirname.includes("'") && !process.env.VERCEL;
const spessaSynthProcessor = `${path.resolve(
  __dirname,
  "./node_modules/spessasynth_lib/dist/spessasynth_processor.min.js",
)}?url`;

const MAX_DEVELOPMENT_BODY_BYTES = 1_000_000;

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > MAX_DEVELOPMENT_BODY_BYTES) {
      throw new Error("Request body is too large.");
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function createMusicDevelopmentApi(mode: string) {
  const env = loadEnv(mode, process.cwd(), "");
  const serverKeys = [
    "AI_MUSIC_API_URL",
    "AI_MUSIC_API_KEY",
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    "VITE_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ] as const;

  for (const key of serverKeys) {
    if (env[key] && !process.env[key]) process.env[key] = env[key];
  }

  const enabled = Boolean(env.AI_MUSIC_API_KEY?.trim() && env.AI_MUSIC_API_URL?.trim());
  const plugin: Plugin = {
    name: "ai-music-development-api",
    configureServer(server) {
      server.middlewares.use("/api/ai-music", async (request, response, next) => {
        if (!enabled) {
          next();
          return;
        }

        const requestUrl = new URL(request.url || "/", "http://localhost");
        const query = Object.fromEntries(requestUrl.searchParams.entries());

        try {
          const body = request.method === "POST" ? await readJsonBody(request) : undefined;
          const apiResponse = {
            status(code: number) {
              response.statusCode = code;
              return apiResponse;
            },
            json(payload: unknown) {
              response.setHeader("Content-Type", "application/json; charset=utf-8");
              response.end(JSON.stringify(payload));
            },
            setHeader(name: string, value: string) {
              response.setHeader(name, value);
            },
          };

          await aiMusicHandler({
            method: request.method,
            body,
            query,
            headers: request.headers,
          }, apiResponse);
        } catch {
          response.statusCode = 400;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ error: "Invalid JSON request body." }));
        }
      });
    },
  };

  return { enabled, plugin };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const musicDevelopmentApi = createMusicDevelopmentApi(mode);

  return {
    envPrefix: ["VITE_", "NEXT_PUBLIC_"],
    server: {
      host: musicDevelopmentApi.enabled ? "127.0.0.1" : "::",
      port: 8080,
      hmr: {},
    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
      mode === "development" && musicDevelopmentApi.plugin,
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
