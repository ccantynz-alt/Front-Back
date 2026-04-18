import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "@solidjs/start/config";

const preset = process.env.SERVER_PRESET ?? "bun";
const isCloudflare = preset === "cloudflare-pages";
const rollupExternals = isCloudflare ? ["node:async_hooks"] : [];

// ── Vendor chunking (CLAUDE.md §6.6 — initial JS < 50KB) ─────────────
// Co-locate heavy third-party deps into stable chunks so they cache
// independently of our app code. Anything listed here is only loaded
// when a route actually imports it; grouping keeps the hash stable
// across our app-code edits so the browser cache survives deploys.
// Keep this list small and surgical — every entry adds a cache slot.
function splitVendor(id: string): string | undefined {
  if (!id.includes("node_modules")) return undefined;
  if (id.includes("yjs") || id.includes("y-websocket")) return "vendor-yjs";
  if (id.includes("xterm")) return "vendor-xterm";
  if (id.includes("@trpc") || id.includes("superjson")) return "vendor-trpc";
  if (id.includes("@json-render")) return "vendor-jsonrender";
  return undefined;
}

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
        output: {
          manualChunks: splitVendor,
        },
      },
    },
  },
});
