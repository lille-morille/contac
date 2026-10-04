import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

function toCamel(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

// Keys whose values are free-form JSON (jsonb) and must NOT be recursed into.
const PRESERVE_VALUE_KEYS = new Set(["fields"]);

/**
 * Deep-converts snake_case object keys to camelCase. PostgREST (Supabase reads)
 * returns DB column names verbatim, but the rest of the app — Drizzle-inferred
 * types and API mutations — is camelCase. Run read results through this so one
 * type system holds everywhere. Values under jsonb columns (e.g. `fields`) are
 * copied verbatim.
 */
export function camelizeKeys<T>(value: unknown): T {
  if (Array.isArray(value)) return value.map((v) => camelizeKeys(v)) as T;
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[toCamel(k)] = PRESERVE_VALUE_KEYS.has(k) ? v : camelizeKeys(v);
    }
    return out as T;
  }
  return value as T;
}
