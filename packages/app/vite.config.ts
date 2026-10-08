import { createRequire } from "node:module";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// G6 imports __spreadArray from tslib, but Bun 1.3.9 can resolve that import
// to pdf-lib's tslib 1.x during a clean Docker build. Use the app's pinned 2.x.
const appRequire = createRequire(new URL("./package.json", import.meta.url));
const tslib = appRequire.resolve("tslib/tslib.es6.js");

export default defineConfig({
  envDir: "../..",
  resolve: {
    alias: [{ find: /^tslib$/, replacement: tslib }],
  },
  server: {
    port: Number(process.env.PORT ?? 3000),
    host: process.env.CONTAC_DEV_HOST ?? "127.0.0.1",
    allowedHosts: ["jeff.tail32eb5a.ts.net"],
    proxy: {
      "/sb-proxy": {
        target: process.env.CONTAC_DEV_SUPABASE_TARGET ?? "http://127.0.0.1:57321",
        rewrite: (p) => p.replace(/^\/sb-proxy/, ""),
        changeOrigin: true,
        ws: true,
      },
      "/api-proxy": {
        target: process.env.CONTAC_DEV_API_TARGET ?? "http://127.0.0.1:8787",
        rewrite: (p) => p.replace(/^\/api-proxy/, ""),
      },
    },
  },
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
});
