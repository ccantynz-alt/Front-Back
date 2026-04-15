import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "@solidjs/start/config";

// BLK-020: Web app now deploys to Cloudflare Pages. The Nitro preset is
// still selectable via SERVER_PRESET so local dev can use `node-server`,
// but production builds default to `cloudflare-pages`. The preset emits
// `_worker.js` + static assets into `dist/` (overridden via nitro output),
// matching `wrangler.toml`'s `pages_build_output_dir = "./dist"`.
const preset = process.env.SERVER_PRESET ?? "cloudflare-pages";

// `node:async_hooks` ships in the CF Workers runtime under the
// `nodejs_compat` flag (declared in wrangler.toml), but the bundler still
// needs to leave the specifier alone instead of trying to polyfill it.
const rollupExternals = preset === "cloudflare-pages" ? ["node:async_hooks"] : [];

export default defineConfig({
  server: {
    preset,
    // Cloudflare Pages expects the build output in ./dist (matches
    // wrangler.toml's pages_build_output_dir). Override Nitro's default
    // `.output/` so the two line up.
    output: {
      dir: "{{ rootDir }}/dist",
    },
    rollupConfig: {
      external: rollupExternals,
    },
    // Pin a compatibility date for the Workers runtime. Mirrors the value
    // in wrangler.toml. Harmless in non-CF presets.
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
