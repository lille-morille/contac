import { describe, expect, it, vi } from "vitest";
import { classMemberships } from "@contac/core/db";
import { createApp } from "./app.ts";
import type { ApiDeps } from "./types.ts";

const adminId = "11111111-1111-4111-8111-111111111111";
const targetId = "22222222-2222-4222-8222-222222222222";
const classId = "33333333-3333-4333-8333-333333333333";
const loginId = "44444444-4444-4444-8444-444444444444";

function session(userId: string) {
  const claims = Buffer.from(JSON.stringify({ aud: "authenticated", sub: userId })).toString(
    "base64url",
  );
  return `eyJhbGciOiJub25lIn0.${claims}.signature`;
}

function recoveryDeps({ admin = true, target = true } = {}) {
  let selection = 0;
  const getUserById = vi.fn(async () => ({
    data: { user: { id: targetId, email: `${loginId}@accounts.contac.invalid` } },
    error: null,
  }));
  const updateUserById = vi.fn(async () => ({ data: { user: { id: targetId } }, error: null }));
  const deps = {
    db: {
      select: () => ({
        from: (table: unknown) => ({
          leftJoin: () => ({
            where: () => ({
              orderBy: async () => [
                {
                  userId: targetId,
                  role: "member",
                  name: "Member Name",
                  email: "member@example.test",
                },
              ],
            }),
          }),
          where: () => ({
            limit: async () => {
              if (table !== classMemberships) throw new Error("Unexpected table");
              selection++;
              return selection === 1
                ? admin
                  ? [{ classId }]
                  : []
                : target
                  ? [{ userId: targetId }]
                  : [];
            },
          }),
        }),
      }),
    },
    supabase: {
      auth: {
        getUser: async () => ({
          data: { user: { id: adminId, email: `${adminId}@accounts.contac.invalid` } },
          error: null,
        }),
        admin: { getUserById, updateUserById },
      },
    },
  } as unknown as ApiDeps;
  return { deps, getUserById, updateUserById };
}

async function resetRequest(deps: ApiDeps) {
  return createApp(deps, "https://contac.example").request(
    `/v1/class/members/${targetId}/recovery-code`,
    { method: "POST", headers: { Authorization: `Bearer ${session(adminId)}` } },
  );
}

describe("class-admin recovery code", () => {
  it("lists only through the class-admin route without exposing a code", async () => {
    const { deps } = recoveryDeps();
    const response = await createApp(deps, "https://contac.example").request("/v1/class/members", {
      headers: { Authorization: `Bearer ${session(adminId)}` },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual([
      {
        userId: targetId,
        role: "member",
        name: "Member Name",
        email: "member@example.test",
      },
    ]);
    const denied = await createApp(
      recoveryDeps({ admin: false }).deps,
      "https://contac.example",
    ).request("/v1/class/members", {
      headers: { Authorization: `Bearer ${session(adminId)}` },
    });
    expect(denied.status).toBe(403);
  });

  it("rejects a non-admin before looking up the target account", async () => {
    const { deps, getUserById, updateUserById } = recoveryDeps({ admin: false });
    expect((await resetRequest(deps)).status).toBe(403);
    expect(getUserById).not.toHaveBeenCalled();
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("rejects an account outside the admin's class", async () => {
    const { deps, getUserById, updateUserById } = recoveryDeps({ target: false });
    expect((await resetRequest(deps)).status).toBe(404);
    expect(getUserById).not.toHaveBeenCalled();
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("keeps the existing password if the account cannot use recovery-code login", async () => {
    const { deps, getUserById, updateUserById } = recoveryDeps();
    getUserById.mockResolvedValueOnce({
      data: { user: { id: targetId, email: "member@example.test" } },
      error: null,
    });
    expect((await resetRequest(deps)).status).toBe(409);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it("replaces a class member's password and returns a one-time-display login code", async () => {
    const { deps, getUserById, updateUserById } = recoveryDeps();
    const response = await resetRequest(deps);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const { recoveryCode } = (await response.json()) as { recoveryCode: string };
    expect(recoveryCode).toMatch(new RegExp(`^cc1\\.${loginId}\\.[A-Za-z0-9_-]{43}$`));
    expect(getUserById).toHaveBeenCalledWith(targetId);
    expect(updateUserById).toHaveBeenCalledWith(targetId, {
      password: recoveryCode.split(".")[2],
    });
  });
});
