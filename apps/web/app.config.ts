import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "@solidjs/start/config";

// Nitro preset is selected via SERVER_PRESET env var so local dev can keep
// the default node-server while CI can force `cloudflare-pages` for deploy.
// Pages needs the cloudflare-pages preset to produce `_worker.js` inside
// .output/public, otherwise the deploy becomes a static-assets-only dump
// with every SSR route returning 404.
const preset = process.env.SERVER_PRESET ?? "node-server";

export default defineConfig({
  server: {
    preset,
  },
  vite: {
    plugins: [tailwindcss()],
    ssr: {
      external: ["@mlc-ai/web-llm", "@huggingface/transformers"],
    },
    build: {
      rollupOptions: {
        external: ["@mlc-ai/web-llm", "@huggingface/transformers"],
      },
    },
  },
});
