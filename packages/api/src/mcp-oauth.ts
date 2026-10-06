import {
  classMemberships,
  mcpUserConnections,
  memberships,
  organizations,
  profiles,
} from "@contac/core/db";
import { and, eq } from "drizzle-orm";
import type { Hono } from "hono";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import type { ApiDeps, ApiEnv } from "./types.ts";

export type McpIdentity = { orgId: string; createdBy: string };

const uuid = z.uuid();
const authorizationId = z.string().regex(/^[A-Za-z0-9_-]{1,256}$/);
const resourcePath = "/mcp";
const issuer = process.env.SUPABASE_URL?.replace(/\/+$/, "") + "/auth/v1";
const jwks = process.env.SUPABASE_URL
  ? createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`))
  : null;

function baseUrl(appOrigin?: string) {
  const configured = process.env.MCP_PUBLIC_BASE_URL;
  const origin = appOrigin ?? process.env.APP_ORIGIN;
  const value =
    configured ??
    (origin?.startsWith("https://") ? "https://api.contac.plingapp.no" : "http://localhost:8787");
  const url = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("MCP_PUBLIC_BASE_URL must be an HTTPS origin");
  return url.origin;
}

export function mcpOauthChallenge(appOrigin?: string) {
  return `Bearer resource_metadata="${baseUrl(appOrigin)}/.well-known/oauth-protected-resource/mcp", scope="openid email", error="invalid_token"`;
}

export function mcpOauthMetadata(appOrigin?: string) {
  return {
    resource: `${baseUrl(appOrigin)}${resourcePath}`,
    authorization_servers: [issuer],
    scopes_supported: ["openid", "email"],
  };
}

// This SDK version carries the ChatGPT tool auth scheme in tool _meta.
export const mcpOauthToolMeta = () => ({
  securitySchemes: [{ type: "oauth2" as const, scopes: ["openid", "email"] }],
});

export async function hasTeamAccess(deps: ApiDeps, userId: string, orgId: string) {
  const [member] = await deps.db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)))
    .limit(1);
  if (member) return true;
  const [classAdmin] = await deps.db
    .select({ userId: classMemberships.userId })
    .from(organizations)
    .innerJoin(classMemberships, eq(classMemberships.classId, organizations.classId))
    .where(
      and(
        eq(organizations.id, orgId),
        eq(classMemberships.userId, userId),
        eq(classMemberships.role, "admin"),
      ),
    )
    .limit(1);
  return !!classAdmin;
}

export async function resolveAgentTeam(
  deps: ApiDeps,
  userId: string,
  clientId: string,
): Promise<McpIdentity | null> {
  const [connection] = await deps.db
    .select({ orgId: profiles.agentTeamId })
    .from(mcpUserConnections)
    .innerJoin(profiles, eq(profiles.id, mcpUserConnections.userId))
    .where(and(eq(mcpUserConnections.userId, userId), eq(mcpUserConnections.clientId, clientId)))
    .limit(1);
  if (!connection?.orgId || !(await hasTeamAccess(deps, userId, connection.orgId))) return null;
  return { orgId: connection.orgId, createdBy: userId };
}

export async function authorizeMcpOauth(
  deps: ApiDeps,
  authorization: string | undefined,
  onFailure?: (reason: string) => void,
): Promise<McpIdentity | null> {
  const bearer = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(authorization ?? "")?.[1];
  if (!bearer || bearer.split(".").length !== 3 || !jwks) {
    onFailure?.("missing_or_malformed_bearer");
    return null;
  }
  let payload;
  try {
    ({ payload } = await jwtVerify(bearer, jwks, {
      issuer,
      audience: `${baseUrl()}${resourcePath}`,
    }));
  } catch (error) {
    const claim =
      error && typeof error === "object" && "claim" in error &&
      ["aud", "iss", "exp", "nbf", "iat"].includes(String(error.claim))
        ? `:${String(error.claim)}`
        : "";
    onFailure?.(`token_verification_failed:${error instanceof Error ? error.name : "unknown"}${claim}`);
    return null;
  }
  if (!uuid.safeParse(payload.sub).success || !uuid.safeParse(payload.client_id).success) {
    onFailure?.("missing_subject_or_client");
    return null;
  }
  if (payload.role !== "authenticated") {
    onFailure?.("unexpected_role");
    return null;
  }
  try {
    const identity = await resolveAgentTeam(deps, payload.sub, payload.client_id as string);
    if (!identity) onFailure?.("no_active_team_grant");
    return identity;
  } catch {
    onFailure?.("team_lookup_failed");
    return null;
  }
}

function safeRedirect(value: unknown): string {
  if (typeof value !== "string") throw new Error("OAuth response has no redirect URL");
  const url = new URL(value);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
  )
    throw new Error("OAuth response has an unsafe redirect URL");
  return url.toString();
}

async function supabaseOAuthRequest(path: string, accessToken: string, body?: unknown) {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const apiKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !apiKey) throw new Error("Supabase OAuth is not configured");
  const response = await fetch(`${url}/auth/v1${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || !data) throw new Error("Supabase rejected the OAuth request");
  return data;
}

export function registerMcpOauthRoutes(app: Hono<ApiEnv>, deps: ApiDeps, appOrigin?: string) {
  app.get("/.well-known/oauth-protected-resource", (c) => c.json(mcpOauthMetadata(appOrigin)));
  app.get("/.well-known/oauth-protected-resource/mcp", (c) => c.json(mcpOauthMetadata(appOrigin)));

  // requireAuth protects /v1/* before this route is registered in createApp.
  app.post("/v1/mcp/oauth/authorize", async (c) => {
    const parsed = z.object({ authorizationId }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Ugyldig OAuth-forespørsel" }, 400);
    const user = c.get("user");
    const accessToken = c.req.header("authorization")?.replace(/^Bearer /, "");
    if (!accessToken) return c.json({ error: "Logg inn først" }, 401);
    const [profile] = await deps.db
      .select({ orgId: profiles.agentTeamId })
      .from(profiles)
      .where(eq(profiles.id, user.id))
      .limit(1);
    if (!profile?.orgId || !(await hasTeamAccess(deps, user.id, profile.orgId)))
      return c.json({ error: "Velg et team i Contac før du kobler til agenten" }, 403);

    try {
      const details = await supabaseOAuthRequest(
        `/oauth/authorizations/${parsed.data.authorizationId}`,
        accessToken,
      );
      if (typeof details.redirect_url === "string")
        return c.json({ redirectUrl: safeRedirect(details.redirect_url) });
      const client = details.client as Record<string, unknown> | undefined;
      const owner = details.user as Record<string, unknown> | undefined;
      if (
        details.authorization_id !== parsed.data.authorizationId ||
        !uuid.safeParse(client?.id).success ||
        owner?.id !== user.id
      )
        return c.json({ error: "OAuth-forespørselen tilhører ikke denne kontoen" }, 403);

      await deps.db
        .insert(mcpUserConnections)
        .values({
          userId: user.id,
          clientId: client!.id as string,
        })
        .onConflictDoNothing();
      const approved = await supabaseOAuthRequest(
        `/oauth/authorizations/${parsed.data.authorizationId}/consent`,
        accessToken,
        { action: "approve" },
      );
      return c.json({ redirectUrl: safeRedirect(approved.redirect_url) });
    } catch {
      return c.json({ error: "Kunne ikke fullføre OAuth-godkjenningen" }, 502);
    }
  });
}
