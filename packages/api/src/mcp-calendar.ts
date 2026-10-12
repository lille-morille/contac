import { calendarEvents, contactReminders, contacts } from "@contac/core/db";
import type { McpServer } from "@modelcontextprotocol/server";
import { and, asc, eq, gt, gte, isNull, lt, ne, or } from "drizzle-orm";
import { z } from "zod";
import { calendarEventContentInput, calendarEventValues } from "./calendar-data.ts";
import { mcpOauthToolMeta, type McpIdentity } from "./mcp-oauth.ts";
import type { ApiDeps } from "./types.ts";

const uuid = z.uuid();
const result = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value) }],
});
const failed = (message: string) => ({
  isError: true,
  content: [{ type: "text" as const, text: message }],
});

export function registerMcpCalendarTools(server: McpServer, deps: ApiDeps, identity: McpIdentity) {
  const { orgId, createdBy } = identity;
  const correctTeam = (expectedTeamId: string) => expectedTeamId === orgId;
  const teamMismatch = () =>
    failed("Contac team ID does not match the expected team. Stop using Contac.");
  async function activeContact(contactId: string) {
    const [contact] = await deps.db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.orgId, orgId),
          eq(contacts.id, contactId),
          ne(contacts.status, "duplicate"),
          isNull(contacts.deletedAt),
        ),
      );
    return !!contact;
  }

  server.registerTool(
    "list_calendar_events",
    {
      description:
        "List shared meetings and deadlines in a calendar range. fromDate/toDate are local calendar dates; startAt/endAt are exact ISO instants for timed events. Both end bounds are exclusive. Page with nextCursor. Use list_calendar_reminders for private contact reminders.",
      inputSchema: z.object({
        expectedTeamId: uuid,
        fromDate: z.iso.date(),
        toDate: z.iso.date(),
        startAt: z.iso.datetime(),
        endAt: z.iso.datetime(),
        cursor: uuid.optional(),
        limit: z.number().int().min(1).max(100).default(50),
      }),
      annotations: { readOnlyHint: true },
      _meta: mcpOauthToolMeta(),
    },
    async ({ expectedTeamId, fromDate, toDate, startAt, endAt, cursor, limit }) => {
      if (!correctTeam(expectedTeamId)) return teamMismatch();
      if (toDate <= fromDate || new Date(endAt) <= new Date(startAt))
        return failed("Invalid calendar range");
      const rows = await deps.db
        .select()
        .from(calendarEvents)
        .where(
          and(
            eq(calendarEvents.orgId, orgId),
            ...(cursor ? [gt(calendarEvents.id, cursor)] : []),
            or(
              and(gte(calendarEvents.date, fromDate), lt(calendarEvents.date, toDate)),
              and(
                lt(calendarEvents.startAt, new Date(endAt)),
                or(
                  gt(calendarEvents.endAt, new Date(startAt)),
                  gte(calendarEvents.startAt, new Date(startAt)),
                ),
              ),
            ),
          ),
        )
        .orderBy(asc(calendarEvents.id))
        .limit(limit + 1);
      const items = rows.slice(0, limit);
      return result({ items, nextCursor: rows.length > limit ? items.at(-1)?.id : null });
    },
  );

  server.registerTool(
    "get_calendar_event",
    {
      description:
        "Get one shared meeting or deadline by ID, including its updatedAt version for editing or deletion.",
      inputSchema: z.object({ expectedTeamId: uuid, eventId: uuid }),
      annotations: { readOnlyHint: true },
      _meta: mcpOauthToolMeta(),
    },
    async ({ expectedTeamId, eventId }) => {
      if (!correctTeam(expectedTeamId)) return teamMismatch();
      const [event] = await deps.db
        .select()
        .from(calendarEvents)
        .where(and(eq(calendarEvents.orgId, orgId), eq(calendarEvents.id, eventId)));
      return event ? result(event) : failed("Calendar event not found in this team");
    },
  );

  server.registerTool(
    "create_calendar_event",
    {
      description:
        "Create a shared meeting or deadline. Meetings need startAt/endAt and may omit title or contactId; a blank title becomes Møte med the linked contact, or Møte without a contact. Deadlines need title and date, with optional startAt. Pass the event fields in event.",
      inputSchema: z.object({ expectedTeamId: uuid, event: calendarEventContentInput }),
      annotations: { readOnlyHint: false, destructiveHint: false },
      _meta: mcpOauthToolMeta(),
    },
    async ({ expectedTeamId, event }) => {
      if (!correctTeam(expectedTeamId)) return teamMismatch();
      const prepared = await calendarEventValues(deps, orgId, event);
      if (!prepared.ok) return failed(prepared.error);
      const [created] = await deps.db
        .insert(calendarEvents)
        .values({ ...prepared.values, orgId, createdBy })
        .returning();
      return result(created);
    },
  );

  server.registerTool(
    "update_calendar_event",
    {
      description:
        "Replace one shared meeting or deadline. Read it first, pass its updatedAt as expectedUpdatedAt, and include the complete new event. A stale version is rejected.",
      inputSchema: z.object({
        expectedTeamId: uuid,
        eventId: uuid,
        expectedUpdatedAt: z.iso.datetime(),
        event: calendarEventContentInput,
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
      _meta: mcpOauthToolMeta(),
    },
    async ({ expectedTeamId, eventId, expectedUpdatedAt, event }) => {
      if (!correctTeam(expectedTeamId)) return teamMismatch();
      const prepared = await calendarEventValues(deps, orgId, event);
      if (!prepared.ok) return failed(prepared.error);
      const [updated] = await deps.db
        .update(calendarEvents)
        .set(prepared.values)
        .where(
          and(
            eq(calendarEvents.orgId, orgId),
            eq(calendarEvents.id, eventId),
            eq(calendarEvents.updatedAt, new Date(expectedUpdatedAt)),
          ),
        )
        .returning();
      if (updated) return result(updated);
      const [current] = await deps.db
        .select({ id: calendarEvents.id })
        .from(calendarEvents)
        .where(and(eq(calendarEvents.orgId, orgId), eq(calendarEvents.id, eventId)));
      return current
        ? failed("Calendar event changed. Read it again with get_calendar_event.")
        : failed("Calendar event not found in this team");
    },
  );

  server.registerTool(
    "delete_calendar_event",
    {
      description:
        "Delete one shared meeting or deadline. Read it first and pass its updatedAt as expectedUpdatedAt. A stale version is rejected.",
      inputSchema: z.object({
        expectedTeamId: uuid,
        eventId: uuid,
        expectedUpdatedAt: z.iso.datetime(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: true },
      _meta: mcpOauthToolMeta(),
    },
    async ({ expectedTeamId, eventId, expectedUpdatedAt }) => {
      if (!correctTeam(expectedTeamId)) return teamMismatch();
      const [deleted] = await deps.db
        .delete(calendarEvents)
        .where(
          and(
            eq(calendarEvents.orgId, orgId),
            eq(calendarEvents.id, eventId),
            eq(calendarEvents.updatedAt, new Date(expectedUpdatedAt)),
          ),
        )
        .returning({ id: calendarEvents.id });
      if (deleted) return result({ deleted: true, eventId: deleted.id });
      const [current] = await deps.db
        .select({ id: calendarEvents.id })
        .from(calendarEvents)
        .where(and(eq(calendarEvents.orgId, orgId), eq(calendarEvents.id, eventId)));
      return current
        ? failed("Calendar event changed. Read it again with get_calendar_event.")
        : failed("Calendar event not found in this team");
    },
  );

  server.registerTool(
    "list_calendar_reminders",
    {
      description:
        "List the connected user's private contact reminders in this team. By default, dismissed reminders are omitted. Optional from/to ISO instants filter dueAt; to is exclusive. Page with nextCursor.",
      inputSchema: z.object({
        expectedTeamId: uuid,
        from: z.iso.datetime().optional(),
        to: z.iso.datetime().optional(),
        includeDismissed: z.boolean().default(false),
        cursor: uuid.optional(),
        limit: z.number().int().min(1).max(100).default(50),
      }),
      annotations: { readOnlyHint: true },
      _meta: mcpOauthToolMeta(),
    },
    async ({ expectedTeamId, from, to, includeDismissed, cursor, limit }) => {
      if (!correctTeam(expectedTeamId)) return teamMismatch();
      if (from && to && new Date(to) <= new Date(from)) return failed("Invalid reminder range");
      const rows = await deps.db
        .select()
        .from(contactReminders)
        .where(
          and(
            eq(contactReminders.orgId, orgId),
            eq(contactReminders.userId, createdBy),
            ...(includeDismissed ? [] : [isNull(contactReminders.dismissedAt)]),
            ...(from ? [gte(contactReminders.dueAt, new Date(from))] : []),
            ...(to ? [lt(contactReminders.dueAt, new Date(to))] : []),
            ...(cursor ? [gt(contactReminders.id, cursor)] : []),
          ),
        )
        .orderBy(asc(contactReminders.id))
        .limit(limit + 1);
      const items = rows.slice(0, limit);
      return result({ items, nextCursor: rows.length > limit ? items.at(-1)?.id : null });
    },
  );

  server.registerTool(
    "get_calendar_reminder",
    {
      description: "Get one of the connected user's private contact reminders in this team.",
      inputSchema: z.object({ expectedTeamId: uuid, reminderId: uuid }),
      annotations: { readOnlyHint: true },
      _meta: mcpOauthToolMeta(),
    },
    async ({ expectedTeamId, reminderId }) => {
      if (!correctTeam(expectedTeamId)) return teamMismatch();
      const [reminder] = await deps.db
        .select()
        .from(contactReminders)
        .where(
          and(
            eq(contactReminders.orgId, orgId),
            eq(contactReminders.userId, createdBy),
            eq(contactReminders.id, reminderId),
          ),
        );
      return reminder ? result(reminder) : failed("Reminder not found for this user and team");
    },
  );

  server.registerTool(
    "create_calendar_reminder",
    {
      description:
        "Create a private reminder for the connected user, linked to one active contact in this team. Only this user sees it in the calendar.",
      inputSchema: z.object({
        expectedTeamId: uuid,
        contactId: uuid,
        dueAt: z.iso.datetime(),
        message: z.string().max(2000).default(""),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
      _meta: mcpOauthToolMeta(),
    },
    async ({ expectedTeamId, contactId, dueAt, message }) => {
      if (!correctTeam(expectedTeamId)) return teamMismatch();
      if (!(await activeContact(contactId))) return failed("Contact not found in this team");
      const [reminder] = await deps.db
        .insert(contactReminders)
        .values({ orgId, userId: createdBy, contactId, dueAt: new Date(dueAt), message })
        .returning();
      return result(reminder);
    },
  );

  server.registerTool(
    "update_calendar_reminder",
    {
      description:
        "Change the contact, dueAt, or message of one of the connected user's private reminders. Omit fields to keep them unchanged.",
      inputSchema: z
        .object({
          expectedTeamId: uuid,
          reminderId: uuid,
          contactId: uuid.optional(),
          dueAt: z.iso.datetime().optional(),
          message: z.string().max(2000).optional(),
        })
        .refine(
          ({ contactId, dueAt, message }) =>
            contactId !== undefined || dueAt !== undefined || message !== undefined,
          "Provide at least one reminder field to change",
        ),
      annotations: { readOnlyHint: false, destructiveHint: false },
      _meta: mcpOauthToolMeta(),
    },
    async ({ expectedTeamId, reminderId, contactId, dueAt, message }) => {
      if (!correctTeam(expectedTeamId)) return teamMismatch();
      if (contactId && !(await activeContact(contactId)))
        return failed("Contact not found in this team");
      const [reminder] = await deps.db
        .update(contactReminders)
        .set({
          ...(contactId ? { contactId } : {}),
          ...(dueAt ? { dueAt: new Date(dueAt) } : {}),
          ...(message !== undefined ? { message } : {}),
        })
        .where(
          and(
            eq(contactReminders.orgId, orgId),
            eq(contactReminders.userId, createdBy),
            eq(contactReminders.id, reminderId),
            isNull(contactReminders.dismissedAt),
          ),
        )
        .returning();
      return reminder
        ? result(reminder)
        : failed("Active reminder not found for this user and team");
    },
  );

  server.registerTool(
    "dismiss_calendar_reminder",
    {
      description: "Dismiss one of the connected user's active private reminders after it is done.",
      inputSchema: z.object({ expectedTeamId: uuid, reminderId: uuid }),
      annotations: { readOnlyHint: false, destructiveHint: false },
      _meta: mcpOauthToolMeta(),
    },
    async ({ expectedTeamId, reminderId }) => {
      if (!correctTeam(expectedTeamId)) return teamMismatch();
      const [reminder] = await deps.db
        .update(contactReminders)
        .set({ dismissedAt: new Date() })
        .where(
          and(
            eq(contactReminders.orgId, orgId),
            eq(contactReminders.userId, createdBy),
            eq(contactReminders.id, reminderId),
            isNull(contactReminders.dismissedAt),
          ),
        )
        .returning();
      return reminder
        ? result(reminder)
        : failed("Active reminder not found for this user and team");
    },
  );

  server.registerTool(
    "delete_calendar_reminder",
    {
      description: "Permanently delete one of the connected user's private contact reminders.",
      inputSchema: z.object({ expectedTeamId: uuid, reminderId: uuid }),
      annotations: { readOnlyHint: false, destructiveHint: true },
      _meta: mcpOauthToolMeta(),
    },
    async ({ expectedTeamId, reminderId }) => {
      if (!correctTeam(expectedTeamId)) return teamMismatch();
      const [deleted] = await deps.db
        .delete(contactReminders)
        .where(
          and(
            eq(contactReminders.orgId, orgId),
            eq(contactReminders.userId, createdBy),
            eq(contactReminders.id, reminderId),
          ),
        )
        .returning({ id: contactReminders.id });
      return deleted
        ? result({ deleted: true, reminderId: deleted.id })
        : failed("Reminder not found for this user and team");
    },
  );
}
