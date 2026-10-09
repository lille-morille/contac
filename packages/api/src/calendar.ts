import { calendarEvents, contacts } from "@contac/core/db";
import { and, eq, gt, gte, isNull, lt, ne, or } from "drizzle-orm";
import type { Context, Hono } from "hono";
import { z } from "zod";
import type { ApiDeps, ApiEnv } from "./types.ts";

const uuid = z.uuid();
const day = z.iso.date();
const eventInput = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("meeting"),
    title: z.string().trim().min(1).max(200),
    contactId: uuid,
    startAt: z.iso.datetime(),
    endAt: z.iso.datetime(),
    expectedUpdatedAt: z.iso.datetime().optional(),
  }),
  z.object({
    kind: z.literal("deadline"),
    title: z.string().trim().min(1).max(200),
    date: day,
    startAt: z.iso.datetime().nullable().default(null),
    expectedUpdatedAt: z.iso.datetime().optional(),
  }),
]);

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
    const parsed = eventInput.safeParse(body);
    if (!parsed.success) return c.json({ error: "Invalid calendar event" }, 400);
    const data = parsed.data;
    if (eventId && !data.expectedUpdatedAt)
      return c.json({ error: "Forventet versjon mangler" }, 400);
    if (data.kind === "meeting") {
      if (new Date(data.endAt) <= new Date(data.startAt))
        return c.json({ error: "Meeting must end after it starts" }, 400);
      const [contact] = await deps.db
        .select({ id: contacts.id })
        .from(contacts)
        .where(
          and(
            eq(contacts.orgId, c.get("org").id),
            eq(contacts.id, data.contactId),
            ne(contacts.status, "duplicate"),
            isNull(contacts.deletedAt),
          ),
        );
      if (!contact) return c.json({ error: "Contact not found" }, 404);
    }
    const values = {
      kind: data.kind,
      title: data.title,
      contactId: data.kind === "meeting" ? data.contactId : null,
      date: data.kind === "deadline" ? data.date : null,
      startAt: data.startAt ? new Date(data.startAt) : null,
      endAt: data.kind === "meeting" ? new Date(data.endAt) : null,
      updatedAt: new Date(),
    };
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
