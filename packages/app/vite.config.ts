import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
export default defineConfig({
  envDir: "../..",
  server: {
    port: Number(process.env.PORT ?? 3000),
    host: process.env.CONTAC_DEV_HOST ?? "127.0.0.1",
    allowedHosts: ["jeff.tail32eb5a.ts.net"],
    proxy: {
      "/sb-proxy": {
        target: "http://127.0.0.1:57321",
        rewrite: (p) => p.replace(/^\/sb-proxy/, ""),
        ws: true,
      },
      "/api-proxy": {
        target: "http://127.0.0.1:8787",
        rewrite: (p) => p.replace(/^\/api-proxy/, ""),
      },
    },
  },
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
});
