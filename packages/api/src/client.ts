import { hc } from "hono/client";
import type { AppType } from "./app.ts";
export type { AppType } from "./app.ts";
export function createApiClient(
  baseUrl: string,
  getToken: () => string | null,
  getOrgId: () => string | null,
) {
  return hc<AppType>(baseUrl, {
    headers: () => ({
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...(getOrgId() ? { "x-org-id": getOrgId()! } : {}),
    }),
  });
}
