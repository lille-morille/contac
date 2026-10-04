import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env.ts";
let client: SupabaseClient | null = null;
let realtimeToken: string | null = null;
let realtimeReady: Promise<void> | null = null;
export function getSupabase(): SupabaseClient {
  if (typeof window === "undefined") throw new Error("Supabase client is browser-only");
  if (!client)
    client = createClient(env.supabaseUrl, env.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  return client;
}

export function ensureRealtimeAuth(token: string): Promise<void> {
  if (realtimeToken !== token || !realtimeReady) {
    realtimeToken = token;
    const pending = getSupabase().realtime.setAuth(token);
    realtimeReady = pending.catch((error) => {
      if (realtimeToken === token) {
        realtimeToken = null;
        realtimeReady = null;
      }
      throw error;
    });
  }
  return realtimeReady;
}

export function clearRealtimeAuth(): void {
  realtimeToken = null;
  realtimeReady = null;
  void getSupabase().realtime.setAuth(null);
}
