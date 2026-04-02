import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "@solidjs/start/config";

export default defineConfig({
  server: {
    // SSR streaming is enabled by default in SolidStart.
    // Vinxi/Nitro will stream the HTML response using renderToStream.
    preset: "cloudflare-pages",
  },
  vite: {
    plugins: [tailwindcss()],
    build: {
      // Target esnext for smallest output — no downlevel transforms
      target: "esnext",
      // Enable CSS code splitting so each route loads only its styles
      cssCodeSplit: true,
      // Report compressed sizes for accurate budget checks
      reportCompressedSize: true,
    },
    // Dependency pre-bundling for faster dev starts
    optimizeDeps: {
      include: [
        "solid-js",
        "solid-js/web",
        "@solidjs/router",
        "@solidjs/meta",
      ],
    },
  },
});
