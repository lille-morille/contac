import { CALL_GUIDE_BODY_MAX_LENGTH, CALL_GUIDE_TITLE_MAX_LENGTH } from "@contac/core";
import { callGuides, type Database } from "@contac/core/db";
import type { InferSelectModel } from "drizzle-orm";
import { and, asc, eq, sql } from "drizzle-orm";
import type { Context, Hono } from "hono";
import { z } from "zod";
import { requireTeamFeature, teamHasFeature } from "./feature-flags.ts";
import type { ApiDeps, ApiEnv } from "./types.ts";

export type CallGuideRow = InferSelectModel<typeof callGuides>;
export type CallGuideChanges = { title?: string; body?: string };
export type CallGuideUpdateResult =
  | { status: "updated"; guide: CallGuideRow }
  | { status: "conflict"; current: CallGuideRow }
  | { status: "not_found" };
export type CallGuideReorderResult =
  | { status: "reordered"; guides: CallGuideRow[] }
  | { status: "conflict"; current: CallGuideRow[] };

/** Team-scoped persistence for call guides. Every method is limited to `orgId`. */
export interface CallGuideStore {
  featureEnabled(orgId: string): Promise<boolean>;
  list(orgId: string): Promise<CallGuideRow[]>;
  get(orgId: string, id: string): Promise<CallGuideRow | null>;
  create(orgId: string, userId: string): Promise<CallGuideRow>;
  update(
    orgId: string,
    id: string,
    userId: string,
    expectedRevision: number,
    changes: CallGuideChanges,
  ): Promise<CallGuideUpdateResult>;
  /** `ids` must be every guide of the team exactly once, in the new order. */
  reorder(orgId: string, ids: string[]): Promise<CallGuideReorderResult>;
  delete(orgId: string, id: string): Promise<boolean>;
}

const teamLock = (orgId: string) =>
  sql`SELECT pg_advisory_xact_lock(hashtextextended(${`call_guides:${orgId}`}, 0))`;
const teamOrder = [asc(callGuides.position), asc(callGuides.createdAt), asc(callGuides.id)];

export function drizzleCallGuideStore(db: Database): CallGuideStore {
  const list = (orgId: string, tx: Pick<Database, "select"> = db) =>
    tx
      .select()
      .from(callGuides)
      .where(eq(callGuides.orgId, orgId))
      .orderBy(...teamOrder);
  const get = async (orgId: string, id: string) => {
    const [row] = await db
      .select()
      .from(callGuides)
      .where(and(eq(callGuides.orgId, orgId), eq(callGuides.id, id)))
      .limit(1);
    return row ?? null;
  };
  return {
    featureEnabled: (orgId) => teamHasFeature(db, orgId, "call_guides"),
    list: (orgId) => list(orgId),
    get,
    create: (orgId, userId) =>
      db.transaction(async (tx) => {
        // Serializes "last position" with other creates and reorders in the team.
        await tx.execute(teamLock(orgId));
        const [{ next }] = await tx
          .select({ next: sql<number>`coalesce(max(${callGuides.position}) + 1, 0)::int` })
          .from(callGuides)
          .where(eq(callGuides.orgId, orgId));
        const [row] = await tx
          .insert(callGuides)
          .values({ orgId, position: next, createdBy: userId, updatedBy: userId })
          .returning();
        return row;
      }),
    async update(orgId, id, userId, expectedRevision, changes) {
      const [row] = await db
        .update(callGuides)
        .set({
          ...changes,
          revision: sql`${callGuides.revision} + 1`,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(callGuides.orgId, orgId),
            eq(callGuides.id, id),
            eq(callGuides.revision, expectedRevision),
          ),
        )
        .returning();
      if (row) return { status: "updated", guide: row };
      const current = await get(orgId, id);
      return current ? { status: "conflict", current } : { status: "not_found" };
    },
    reorder: (orgId, ids) =>
      db.transaction(async (tx): Promise<CallGuideReorderResult> => {
        await tx.execute(teamLock(orgId));
        const current = await list(orgId, tx);
        const known = new Set(current.map((guide) => guide.id));
        if (ids.length !== known.size || ids.some((id) => !known.has(id)))
          return { status: "conflict", current };
        // Position is not content: the revision stays, so an open editor is not invalidated.
        await tx.execute(sql`
          UPDATE public.call_guides AS guide SET position = wanted.position
          FROM (VALUES ${sql.join(
            ids.map((id, position) => sql`(${id}::uuid, ${position}::int)`),
            sql`, `,
          )}) AS wanted(id, position)
          WHERE guide.org_id = ${orgId} AND guide.id = wanted.id
            AND guide.position IS DISTINCT FROM wanted.position`);
        return { status: "reordered", guides: await list(orgId, tx) };
      }),
    async delete(orgId, id) {
      const rows = await db
        .delete(callGuides)
        .where(and(eq(callGuides.orgId, orgId), eq(callGuides.id, id)))
        .returning({ id: callGuides.id });
      return rows.length > 0;
    },
  };
}

const guideId = z.uuid();
const updateInput = z
  .object({
    expectedRevision: z.number().int().positive(),
    title: z.string().max(CALL_GUIDE_TITLE_MAX_LENGTH).optional(),
    body: z.string().max(CALL_GUIDE_BODY_MAX_LENGTH).optional(),
  })
  .refine((value) => value.title !== undefined || value.body !== undefined);
const reorderInput = z.object({
  ids: z
    .array(guideId)
    .max(1000)
    .refine((ids) => new Set(ids).size === ids.length),
});
const notFound = (c: Context<ApiEnv>) => c.json({ error: "Samtaleguiden finnes ikke" }, 404);

export function registerCallGuideRoutes(
  app: Hono<ApiEnv>,
  deps: Pick<ApiDeps, "db">,
  store: CallGuideStore = drizzleCallGuideStore(deps.db),
) {
  // The wildcard also matches the bare collection path.
  app.use(
    "/v1/org/call-guides/*",
    requireTeamFeature((orgId) => store.featureEnabled(orgId)),
  );

  app.get("/v1/org/call-guides", async (c) => c.json(await store.list(c.get("org").id)));
  app.post("/v1/org/call-guides", async (c) =>
    c.json(await store.create(c.get("org").id, c.get("user").id), 201),
  );
  app.post("/v1/org/call-guides/reorder", async (c) => {
    const body = reorderInput.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Ugyldig rekkefølge" }, 400);
    const result = await store.reorder(c.get("org").id, body.data.ids);
    if (result.status === "conflict")
      return c.json(
        { error: "Samtaleguidene ble endret mens du sorterte.", current: result.current },
        409,
      );
    return c.json(result.guides);
  });
  app.get("/v1/org/call-guides/:id", async (c) => {
    const id = guideId.safeParse(c.req.param("id"));
    if (!id.success) return notFound(c);
    const guide = await store.get(c.get("org").id, id.data);
    return guide ? c.json(guide) : notFound(c);
  });
  app.post("/v1/org/call-guides/:id/update", async (c) => {
    const id = guideId.safeParse(c.req.param("id"));
    if (!id.success) return notFound(c);
    const body = updateInput.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Ugyldig samtaleguide" }, 400);
    const { expectedRevision, ...changes } = body.data;
    const result = await store.update(
      c.get("org").id,
      id.data,
      c.get("user").id,
      expectedRevision,
      changes,
    );
    if (result.status === "not_found") return notFound(c);
    if (result.status === "conflict")
      return c.json(
        { error: "Samtaleguiden ble endret mens du redigerte.", current: result.current },
        409,
      );
    return c.json(result.guide);
  });
  app.post("/v1/org/call-guides/:id/delete", async (c) => {
    const id = guideId.safeParse(c.req.param("id"));
    if (!id.success) return notFound(c);
    return (await store.delete(c.get("org").id, id.data)) ? c.json({ deleted: true }) : notFound(c);
  });
}
