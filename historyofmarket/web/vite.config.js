import { defineConfig } from "vite";

// The ported bundle in src/hom/ is pre-built ESM (no JSX, no bare imports).
// It carries its own vendored React (vendor-react.js), so we deliberately do
// NOT install or alias npm react — a second React instance would break hooks.
//
// The app is mounted under `/us-market/` on the FinHOT site (the chronicle module serves web/dist
// and the data cache there), so every emitted URL carries that base. Data requests stay written as
// root-relative `/api/*` in src and get the base prepended at boot (src/router.js).
const BASE = "/us-market/";
const BFF = process.env.BFF_ORIGIN || "http://localhost:8787";

export default defineConfig({
  base: BASE,
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      // Dev proxies the base-prefixed requests back to the local BFF (../server), which serves the
      // seeded open-JSON cache and falls back to the upstream origin.
      "/us-market/api": { target: BFF, changeOrigin: true, rewrite: (p) => p.replace(/^\/us-market/, "") },
      "/us-market/openapi.json": { target: BFF, changeOrigin: true, rewrite: (p) => p.replace(/^\/us-market/, "") },
    },
  },
  esbuild: {
    // Ported code is already minified/valid ESM; keep transforms light.
    legalComments: "none",
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 4096,
    rollupOptions: {
      output: {
        // Keep the ported chunk names stable so dynamic import() specifiers
        // inside src/hom resolve to real emitted files.
        chunkFileNames: "assets/[name].js",
        entryFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
});
