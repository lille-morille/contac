import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { registerCallGuideRoutes, type CallGuideRow, type CallGuideStore } from "./call-guides.ts";
import type { ApiDeps, ApiEnv } from "./types.ts";

const teamA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const teamB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const teamOff = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";

function memoryStore(enabled: string[]): CallGuideStore & { rows: CallGuideRow[] } {
  const rows: CallGuideRow[] = [];
  const team = (orgId: string) =>
    rows.filter((row) => row.orgId === orgId).sort((a, b) => a.position - b.position);
  return {
    rows,
    featureEnabled: async (orgId) => enabled.includes(orgId),
    list: async (orgId) => team(orgId).map((row) => ({ ...row })),
    get: async (orgId, id) => {
      const row = rows.find((item) => item.orgId === orgId && item.id === id);
      return row ? { ...row } : null;
    },
    async create(orgId, userId) {
      const now = new Date();
      const row: CallGuideRow = {
        id: crypto.randomUUID(),
        orgId,
        title: "Uten tittel",
        body: "",
        position: Math.max(-1, ...team(orgId).map((item) => item.position)) + 1,
        revision: 1,
        createdBy: userId,
        updatedBy: userId,
        createdAt: now,
        updatedAt: now,
      };
      rows.push(row);
      return { ...row };
    },
    async update(orgId, id, userId, expectedRevision, changes) {
      const row = rows.find((item) => item.orgId === orgId && item.id === id);
      if (!row) return { status: "not_found" };
      if (row.revision !== expectedRevision) return { status: "conflict", current: { ...row } };
      Object.assign(row, changes, {
        revision: row.revision + 1,
        updatedBy: userId,
        updatedAt: new Date(),
      });
      return { status: "updated", guide: { ...row } };
    },
    async reorder(orgId, ids) {
      const current = team(orgId);
      if (ids.length !== current.length || ids.some((id) => !current.some((r) => r.id === id)))
        return { status: "conflict", current: current.map((row) => ({ ...row })) };
      ids.forEach((id, position) => {
        rows.find((row) => row.id === id)!.position = position;
      });
      return { status: "reordered", guides: team(orgId).map((row) => ({ ...row })) };
    },
    async delete(orgId, id) {
      const index = rows.findIndex((row) => row.orgId === orgId && row.id === id);
      if (index < 0) return false;
      rows.splice(index, 1);
      return true;
    },
  };
}

function fixture(enabled = [teamA, teamB]) {
  const store = memoryStore(enabled);
  const app = new Hono<ApiEnv>();
  // Stands in for requireOrg: membership is already checked when these routes run.
  app.use("/v1/org/*", async (c, next) => {
    c.set("org", { id: c.req.header("x-org-id")!, role: "admin" });
    c.set("user", { id: c.req.header("x-user-id") ?? userA, email: "a@example.test" });
    await next();
  });
  registerCallGuideRoutes(app, { db: {} } as unknown as ApiDeps, store);
  const call = (orgId: string, path: string, body?: unknown, userId = userA) =>
    app.request(`/v1/org/call-guides${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "x-org-id": orgId,
        "x-user-id": userId,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const create = async (orgId = teamA) => (await (await call(orgId, "", {})).json()) as Guide;
  return { app, store, call, create };
}
type Guide = { id: string; title: string; body: string; position: number; revision: number };

describe("call guide feature flag", () => {
  it("answers every call guide route with 404 for a team without the flag", async () => {
    const { call, store } = fixture();
    const id = crypto.randomUUID();
    const requests: [string, unknown?][] = [
      [""],
      ["", {}],
      [`/${id}`],
      [`/${id}/update`, { expectedRevision: 1, body: "x" }],
      ["/reorder", { ids: [] }],
      [`/${id}/delete`, {}],
    ];
    for (const [path, body] of requests) {
      const response = await call(teamOff, path, body);
      expect(response.status, path).toBe(404);
      expect(await response.text()).toBe("404 Not Found");
    }
    expect(store.rows).toHaveLength(0);
  });
});

describe("call guide routes", () => {
  it("creates guides with the default title, empty body, and last position", async () => {
    const { create, call } = fixture();
    const first = await create();
    const second = await create();
    expect(first).toMatchObject({ title: "Uten tittel", body: "", position: 0, revision: 1 });
    expect(second.position).toBe(1);
    const list = (await (await call(teamA, "")).json()) as Guide[];
    expect(list.map((guide) => guide.id)).toEqual([first.id, second.id]);
    const one = await call(teamA, `/${first.id}`);
    expect(one.status).toBe(200);
    expect(((await one.json()) as Guide).id).toBe(first.id);
  });

  it("updates title and body against the expected revision", async () => {
    const { create, call } = fixture();
    const guide = await create();
    const response = await call(teamA, `/${guide.id}/update`, {
      expectedRevision: 1,
      title: "Ekspertintervju",
      body: "## Åpning\n\n- Presenter deg\n- **Spør** om tid",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      title: "Ekspertintervju",
      body: "## Åpning\n\n- Presenter deg\n- **Spør** om tid",
      revision: 2,
    });
    const bodyOnly = await call(teamA, `/${guide.id}/update`, { expectedRevision: 2, body: "" });
    expect(await bodyOnly.json()).toMatchObject({
      title: "Ekspertintervju",
      body: "",
      revision: 3,
    });
  });

  it("returns 409 with the latest committed guide to a stale writer", async () => {
    const { create, call } = fixture();
    const guide = await create();
    const first = await call(teamA, `/${guide.id}/update`, {
      expectedRevision: 1,
      body: "Første versjon",
    });
    expect(first.status).toBe(200);
    const second = await call(
      teamA,
      `/${guide.id}/update`,
      { expectedRevision: 1, body: "Andre versjon" },
      userB,
    );
    expect(second.status).toBe(409);
    const conflict = (await second.json()) as { error: string; current: Guide };
    expect(conflict.error).toEqual(expect.any(String));
    expect(conflict.current).toMatchObject({ id: guide.id, body: "Første versjon", revision: 2 });
  });

  it("rejects invalid updates", async () => {
    const { create, call } = fixture();
    const guide = await create();
    for (const body of [
      { body: "x" },
      { expectedRevision: 1 },
      { expectedRevision: 1, title: "x".repeat(201) },
    ])
      expect((await call(teamA, `/${guide.id}/update`, body)).status).toBe(400);
    expect(
      (await call(teamA, `/${crypto.randomUUID()}/update`, { expectedRevision: 1, body: "x" }))
        .status,
    ).toBe(404);
  });

  it("saves the whole team order in one write", async () => {
    const { create, call } = fixture();
    const [a, b, c] = [await create(), await create(), await create()];
    const response = await call(teamA, "/reorder", { ids: [c.id, a.id, b.id] });
    expect(response.status).toBe(200);
    const guides = (await response.json()) as Guide[];
    expect(guides.map((guide) => [guide.id, guide.position])).toEqual([
      [c.id, 0],
      [a.id, 1],
      [b.id, 2],
    ]);
    expect(guides.map((guide) => guide.revision)).toEqual([1, 1, 1]);
  });

  it("returns 409 with the current order when the reorder misses or adds a guide", async () => {
    const { create, call } = fixture();
    const [a, b] = [await create(), await create()];
    for (const ids of [[b.id], [b.id, a.id, crypto.randomUUID()]]) {
      const response = await call(teamA, "/reorder", { ids });
      expect(response.status).toBe(409);
      const body = (await response.json()) as { current: Guide[] };
      expect(body.current.map((guide) => guide.id)).toEqual([a.id, b.id]);
    }
    expect((await call(teamA, "/reorder", { ids: [a.id, a.id] })).status).toBe(400);
  });

  it("deletes a guide permanently", async () => {
    const { create, call, store } = fixture();
    const guide = await create();
    const response = await call(teamA, `/${guide.id}/delete`, {});
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });
    expect(store.rows).toHaveLength(0);
    expect((await call(teamA, `/${guide.id}`)).status).toBe(404);
    expect((await call(teamA, `/${guide.id}/delete`, {})).status).toBe(404);
  });
});

describe("call guide team isolation", () => {
  it("does not let one team read, edit, reorder, or delete another team's guide", async () => {
    const { create, call } = fixture();
    const own = await create(teamA);
    const other = await create(teamB);
    expect(((await (await call(teamA, "")).json()) as Guide[]).map((g) => g.id)).toEqual([own.id]);
    expect((await call(teamA, `/${other.id}`)).status).toBe(404);
    expect(
      (await call(teamA, `/${other.id}/update`, { expectedRevision: 1, body: "x" })).status,
    ).toBe(404);
    expect((await call(teamA, "/reorder", { ids: [other.id] })).status).toBe(409);
    expect((await call(teamA, `/${other.id}/delete`, {})).status).toBe(404);
    expect(await (await call(teamB, `/${other.id}`)).json()).toMatchObject({
      body: "",
      revision: 1,
      position: 0,
    });
  });

  it("does not expose a flagged team's guides through a team without the flag", async () => {
    const { create, call } = fixture([teamA]);
    const guide = await create(teamA);
    expect((await call(teamOff, `/${guide.id}`)).status).toBe(404);
  });
});
