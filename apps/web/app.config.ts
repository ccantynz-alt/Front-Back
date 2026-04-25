import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "@solidjs/start/config";

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
    // Use Vercel's Build Output API format when deploying to Vercel,
    // keep the bun preset for Vultr bare-metal and local dev.
    preset: process.env.VERCEL ? "vercel" : "bun",
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
