import { createClient } from "@supabase/supabase-js";
import { createDb } from "@contac/core/db";
import { createApp } from "./app.ts";

const dbUrl = process.env.DATABASE_URL;
const sbUrl = process.env.SUPABASE_URL;
const sbKey = process.env.SUPABASE_SECRET_KEY;
if (!dbUrl || !sbUrl || !sbKey)
  throw new Error("DATABASE_URL, SUPABASE_URL and SUPABASE_SECRET_KEY are required");
const { db, client } = createDb(dbUrl, 8);
const supabase = createClient(sbUrl, sbKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const app = createApp(
  { db, supabase, setupCode: process.env.CLASS_SETUP_CODE },
  process.env.APP_ORIGIN ?? "http://localhost:3000",
);
const server = Bun.serve({
  fetch: app.fetch,
  port: Number(process.env.API_PORT ?? 8787),
  hostname: process.env.API_HOST ?? "0.0.0.0",
});
console.log(`API listening on ${server.url}`);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    server.stop();
    void client.end();
  });
