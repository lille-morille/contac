// Production entry for the TanStack Start app. `vite build` emits the SSR
// handler (dist/server/server.js) but nothing that serves the client assets,
// so this wraps both: static files from dist/client first, SSR for the rest.
//
//   bun run build && bun server.mjs
//
// PORT overrides the listen port (default 3000).
import { join, normalize } from "node:path";
import handler from "./dist/server/server.js";

const PORT = Number(process.env.PORT ?? 3000);
const CLIENT_DIR = join(import.meta.dirname, "dist", "client");

Bun.serve({
  port: PORT,
  hostname: "::",
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname !== "/") {
      // normalize() collapses any ../ so the path can't escape dist/client.
      const filePath = join(CLIENT_DIR, normalize(url.pathname));
      if (filePath.startsWith(CLIENT_DIR)) {
        const file = Bun.file(filePath);
        if (await file.exists()) {
          // Vite emits content-hashed filenames under /assets — cache forever.
          const headers = url.pathname.startsWith("/assets/")
            ? { "cache-control": "public, max-age=31536000, immutable" }
            : { "cache-control": "public, max-age=3600" };
          return new Response(file, { headers });
        }
      }
    }
    return handler.fetch(req);
  },
});

console.log(`contac-app serving on :${PORT} (static: dist/client, SSR: dist/server)`);
