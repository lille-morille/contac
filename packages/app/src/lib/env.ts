function url(value: string): string {
  if (value.startsWith("/") && typeof window !== "undefined")
    return `${window.location.origin}${value}`;
  return value;
}
export const env = {
  get supabaseUrl() {
    return url(import.meta.env.VITE_SUPABASE_URL as string);
  },
  supabaseKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
  get apiUrl() {
    return url((import.meta.env.VITE_API_URL as string) ?? "/api-proxy");
  },
};
