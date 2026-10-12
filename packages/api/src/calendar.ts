import { calendarEvents } from "@contac/core/db";
import { and, eq, gt, gte, lt, or } from "drizzle-orm";
import type { Context, Hono } from "hono";
import { z } from "zod";
import { calendarEventInput, calendarEventValues } from "./calendar-data.ts";
import type { ApiDeps, ApiEnv } from "./types.ts";

const uuid = z.uuid();
const day = z.iso.date();

export function registerCalendarRoutes(app: Hono<ApiEnv>, deps: ApiDeps) {
  app.get("/v1/org/calendar-events", async (c) => {
    const range = z
      .object({ from: day, to: day, start: z.iso.datetime(), end: z.iso.datetime() })
      .safeParse(c.req.query());
    if (!range.success || range.data.to <= range.data.from || range.data.end <= range.data.start)
      return c.json({ error: "Invalid calendar range" }, 400);
    const { from, to, start, end } = range.data;
    const rows = await deps.db
      .select()
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.orgId, c.get("org").id),
          or(
            and(gte(calendarEvents.date, from), lt(calendarEvents.date, to)),
            and(
              lt(calendarEvents.startAt, new Date(end)),
              or(
                gt(calendarEvents.endAt, new Date(start)),
                gte(calendarEvents.startAt, new Date(start)),
              ),
            ),
          ),
        ),
      );
    return c.json(rows);
  });

  async function save(c: Context<ApiEnv>, eventId?: string) {
    const body = await c.req.json().catch(() => null);
    const parsed = calendarEventInput.safeParse(body);
    if (!parsed.success) return c.json({ error: "Invalid calendar event" }, 400);
    const data = parsed.data;
    if (eventId && !data.expectedUpdatedAt)
      return c.json({ error: "Forventet versjon mangler" }, 400);
    const prepared = await calendarEventValues(deps, c.get("org").id, data);
    if (!prepared.ok) return c.json({ error: prepared.error }, prepared.status);
    const { values } = prepared;
    if (eventId) {
      const [row] = await deps.db
        .update(calendarEvents)
        .set(values)
        .where(
          and(
            eq(calendarEvents.id, eventId),
            eq(calendarEvents.orgId, c.get("org").id),
            eq(calendarEvents.updatedAt, new Date(data.expectedUpdatedAt!)),
          ),
        )
        .returning();
      if (row) return c.json(row);
      const [current] = await deps.db
        .select()
        .from(calendarEvents)
        .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.orgId, c.get("org").id)));
      return current
        ? c.json({ error: "Oppføringen er endret. Lukk og åpne den på nytt.", current }, 409)
        : c.json({ error: "Oppføringen finnes ikke" }, 404);
    }
    const [row] = await deps.db
      .insert(calendarEvents)
      .values({ ...values, orgId: c.get("org").id, createdBy: c.get("user").id })
      .returning();
    return c.json(row, 201);
  }

  app.post("/v1/org/calendar-events", (c) => save(c));
  app.post("/v1/org/calendar-events/:id/update", (c) => {
    const parsed = uuid.safeParse(c.req.param("id"));
    return parsed.success ? save(c, parsed.data) : c.json({ error: "Invalid calendar event" }, 400);
  });
  app.post("/v1/org/calendar-events/:id/delete", async (c) => {
    const parsed = uuid.safeParse(c.req.param("id"));
    if (!parsed.success) return c.json({ error: "Invalid calendar event" }, 400);
    const body = z
      .object({ expectedUpdatedAt: z.iso.datetime() })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "Forventet versjon mangler" }, 400);
    const [row] = await deps.db
      .delete(calendarEvents)
      .where(
        and(
          eq(calendarEvents.id, parsed.data),
          eq(calendarEvents.orgId, c.get("org").id),
          eq(calendarEvents.updatedAt, new Date(body.data.expectedUpdatedAt)),
        ),
      )
      .returning({ id: calendarEvents.id });
    if (row) return c.json({ deleted: true });
    const [current] = await deps.db
      .select()
      .from(calendarEvents)
      .where(and(eq(calendarEvents.id, parsed.data), eq(calendarEvents.orgId, c.get("org").id)));
    return current
      ? c.json({ error: "Oppføringen er endret. Lukk og åpne den på nytt.", current }, 409)
      : c.json({ error: "Oppføringen finnes ikke" }, 404);
  });
}
