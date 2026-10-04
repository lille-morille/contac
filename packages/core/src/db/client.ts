import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.ts";

export function createDb(url: string, max = 5) {
  const client = postgres(url, { prepare: false, max, idle_timeout: 30 });
  return { client, db: drizzle(client, { schema }) };
}
export type Database = ReturnType<typeof createDb>["db"];
