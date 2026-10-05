import type { MiddlewareHandler } from "hono";
import { decodeJwt } from "jose";
import type { ApiDeps, ApiEnv } from "../types.ts";

export function requireAuth(deps: ApiDeps): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    const token = c.req.header("Authorization")?.match(/^Bearer (.+)$/)?.[1];
    if (!token) return c.json({ error: "Authentication required" }, 401);
    const { data, error } = await deps.supabase.auth.getUser(token);
    if (error || !data.user || !data.user.email) return c.json({ error: "Invalid session" }, 401);
    try {
      const claims = decodeJwt(token);
      // OAuth clients receive aud=<MCP resource> from the access-token hook.
      // They must not use that token to select a team or edit other browser API data.
      if (claims.aud !== "authenticated" || claims.client_id)
        return c.json({ error: "A browser session is required" }, 401);
    } catch {
      return c.json({ error: "Invalid session" }, 401);
    }
    c.set("user", { id: data.user.id, email: data.user.email });
    await next();
  };
}
