import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const sql = postgres(url, { max: 1, prepare: false });
const dir = join(import.meta.dirname, "../../migrations");
try {
  await sql`CREATE TABLE IF NOT EXISTS public.app_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  for (const name of (await readdir(dir)).filter((n) => n.endsWith(".sql")).sort()) {
    if ((await sql`SELECT 1 FROM public.app_migrations WHERE name = ${name}`).length) continue;
    const source = await readFile(join(dir, name), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(source);
      await tx`INSERT INTO public.app_migrations (name) VALUES (${name})`;
    });
    console.log(`Applied ${name}`);
  }
} finally {
  await sql.end();
}
