import type { Database } from "@contac/core/db";
import type { SupabaseClient } from "@supabase/supabase-js";
export type ApiDeps = { db: Database; supabase: SupabaseClient; setupCode?: string };
export type ApiEnv = {
  Variables: {
    user: { id: string; email: string };
    org: { id: string; role: "owner" | "admin" | "member" };
  };
};
