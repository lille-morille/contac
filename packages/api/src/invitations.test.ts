import { describe, expect, it } from "vitest";
import {
  classMemberships,
  invitations,
  memberships,
  organizations,
  profiles,
} from "@contac/core/db";
import { createApp } from "./app.ts";
import type { ApiDeps } from "./types.ts";

const teamId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const classId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const token = "a-reusable-invitation-token-for-the-team";

function session(userId: string) {
  const payload = Buffer.from(JSON.stringify({ aud: "authenticated", sub: userId })).toString(
    "base64url",
  );
  return `eyJhbGciOiJub25lIn0.${payload}.signature`;
}

function invitationDeps(
  validity: { acceptedAt: Date | null; expiresAt: Date | null } = {
    acceptedAt: null,
    expiresAt: null,
  },
) {
  const joinedUserIds: string[] = [];
  const accountIds = [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
  ];
  const invitation = {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    orgId: teamId,
    email: null,
    ...validity,
  };
  const db = {
    select: () => ({
      from: (table: unknown) => ({
        innerJoin: () => ({
          where: () => ({ limit: async () => [{ ...invitation, teamName: "Team A" }] }),
        }),
        where: () =>
          table === invitations
            ? { limit: async () => [invitation] }
            : Promise.resolve(table === organizations ? [{ classId }] : []),
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: { userId?: string }) => {
        if (table === memberships) joinedUserIds.push(values.userId!);
        if (table !== profiles && table !== classMemberships && table !== memberships)
          throw new Error("Unexpected insert");
        return Object.assign(Promise.resolve(), { onConflictDoNothing: async () => undefined });
      },
    }),
    transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(db),
  };
  const deps = {
    db,
    supabase: {
      auth: {
        getUser: async (jwt: string) => {
          const claims = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
          return { data: { user: { id: claims.sub, email: "member@example.test" } }, error: null };
        },
        admin: {
          createUser: async () => ({
            data: { user: { id: accountIds.shift() } },
            error: null,
          }),
          deleteUser: async () => ({ error: null }),
        },
      },
    },
  } as unknown as ApiDeps;
  return { deps, joinedUserIds };
}

describe("reusable team invitations", () => {
  it("creates a permanent link for a team member", async () => {
    const userId = "55555555-5555-4555-8555-555555555555";
    let created: Record<string, unknown> | undefined;
    const db = {
      select: () => ({
        from: (table: unknown) => ({
          where: () => ({
            limit: async () =>
              table === memberships
                ? [{ role: "admin" }]
                : table === profiles
                  ? [{ onboardedAt: new Date() }]
                  : [],
          }),
        }),
      }),
      insert: (table: unknown) => ({
        values: async (values: Record<string, unknown>) => {
          if (table === invitations) created = values;
        },
      }),
    };
    const deps = {
      db,
      supabase: {
        auth: {
          getUser: async () => ({
            data: { user: { id: userId, email: "member@example.test" } },
            error: null,
          }),
        },
      },
    } as unknown as ApiDeps;
    const app = createApp(deps, "https://contac.example");
    const response = await app.request("/v1/org/invitations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session(userId)}`,
        "Content-Type": "application/json",
        "x-org-id": teamId,
      },
      body: "{}",
    });
    expect(response.status).toBe(201);
    expect((await response.json()).inviteUrl).toMatch(/^https:\/\/contac\.example\/invite\?token=/);
    expect(created).toMatchObject({ orgId: teamId, invitedBy: userId, role: "admin" });
    expect(created).not.toHaveProperty("expiresAt");
  });

  it("lets two new accounts join through the same permanent link", async () => {
    const { deps, joinedUserIds } = invitationDeps();
    const app = createApp(deps, "https://contac.example");
    const info = await app.request(`/v1/invitations/${token}`);
    expect(info.status).toBe(200);
    expect((await info.json()).teamName).toBe("Team A");

    for (const name of ["First Member", "Second Member"]) {
      const response = await app.request("/v1/invitations/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name }),
      });
      expect(response.status).toBe(201);
      expect((await response.json()).orgId).toBe(teamId);
    }
    expect(joinedUserIds).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ]);
  });

  it("lets two existing accounts accept the same link", async () => {
    const { deps, joinedUserIds } = invitationDeps();
    const app = createApp(deps, "https://contac.example");
    const users = ["33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444"];

    for (const userId of users) {
      const response = await app.request("/v1/invitations/accept", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session(userId)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });
      expect(response.status).toBe(200);
      expect((await response.json()).orgId).toBe(teamId);
    }
    expect(joinedUserIds).toEqual(users);
  });

  it("keeps previously issued used and expired links closed", async () => {
    for (const validity of [
      { acceptedAt: new Date("2025-01-01"), expiresAt: new Date("2099-01-01") },
      { acceptedAt: null, expiresAt: new Date("2025-01-08") },
    ]) {
      const { deps } = invitationDeps(validity);
      const app = createApp(deps, "https://contac.example");
      expect((await app.request(`/v1/invitations/${token}`)).status).toBe(404);
      expect(
        (
          await app.request("/v1/invitations/join", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, name: "New Member" }),
          })
        ).status,
      ).toBe(404);
    }
  });
});
