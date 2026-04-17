import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "@solidjs/start/config";

const preset = process.env.SERVER_PRESET ?? "cloudflare-pages";
const isCloudflare = preset === "cloudflare-pages";
const rollupExternals = isCloudflare ? ["node:async_hooks"] : [];

export default defineConfig({
  server: {
    preset,
    ...(isCloudflare
      ? { output: { dir: "{{ rootDir }}/dist" } }
      : {}),
    rollupConfig: {
      external: rollupExternals,
    },
    compatibilityDate: "2024-12-01",
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
