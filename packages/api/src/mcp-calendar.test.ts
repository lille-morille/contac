import { calendarEvents, contactReminders, contacts } from "@contac/core/db";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { makeServer } from "./mcp.ts";
import type { ApiDeps } from "./types.ts";

const teamId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherTeamId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const userId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const otherUserId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const contactId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const foreignContactId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const eventId = "11111111-1111-4111-8111-111111111111";
const reminderId = "22222222-2222-4222-8222-222222222222";
const oldVersion = new Date("2026-10-09T08:00:00.000Z");

function memoryDb() {
  const dialect = new PgDialect();
  const queries: { table: unknown; sql: string; params: unknown[] }[] = [];
  const state: {
    event: Record<string, unknown> | null;
    reminder: Record<string, unknown> | null;
    writes: number;
  } = { event: null, reminder: null, writes: 0 };
  function query(table: unknown, condition: SQL) {
    const parsed = dialect.sqlToQuery(condition);
    const entry = { table, sql: parsed.sql, params: parsed.params };
    queries.push(entry);
    return entry;
  }
  function rows(table: unknown, entry: ReturnType<typeof query>) {
    const values = entry.params.map((value) =>
      value instanceof Date ? value.toISOString() : value,
    );
    if (table === contacts)
      return values.includes(teamId) && values.includes(contactId)
        ? [{ id: contactId, name: "Ada Lovelace" }]
        : [];
    if (table === calendarEvents && state.event) {
      const event = state.event;
      return values.includes(event.orgId) &&
        (!entry.sql.includes('"calendar_events"."id" =') || values.includes(event.id))
        ? [{ ...event }]
        : [];
    }
    if (table === contactReminders && state.reminder) {
      const reminder = state.reminder;
      return values.includes(reminder.orgId) &&
        values.includes(reminder.userId) &&
        (!entry.sql.includes('"contact_reminders"."id" =') || values.includes(reminder.id)) &&
        (!entry.sql.includes('"contact_reminders"."dismissed_at" is null') ||
          reminder.dismissedAt === null)
        ? [{ ...reminder }]
        : [];
    }
    return [];
  }
  const db = {
    select: () => ({
      from: (table: unknown) => ({
        where: (condition: SQL) => {
          const entry = query(table, condition);
          const read = () => rows(table, entry);
          return Object.assign(Promise.resolve(read()), {
            orderBy: () => ({ limit: async () => read() }),
          });
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          state.writes++;
          if (table === calendarEvents) {
            state.event = { ...values, id: eventId, updatedAt: oldVersion };
            return [{ ...state.event }];
          }
          state.reminder = { ...values, id: reminderId, dismissedAt: null };
          return [{ ...state.reminder }];
        },
      }),
    }),
    update: (table: unknown) => ({
      set: (changes: Record<string, unknown>) => ({
        where: (condition: SQL) => {
          const entry = query(table, condition);
          return {
            returning: async () => {
              const [current] = rows(table, entry);
              if (!current) return [];
              if (table === calendarEvents) {
                const expected = entry.params.at(-1);
                if (
                  new Date(String(expected)).getTime() !==
                  (state.event!.updatedAt as Date).getTime()
                )
                  return [];
                state.event = { ...state.event!, ...changes };
                state.writes++;
                return [{ ...state.event }];
              }
              state.reminder = { ...state.reminder!, ...changes };
              state.writes++;
              return [{ ...state.reminder }];
            },
          };
        },
      }),
    }),
    delete: (table: unknown) => ({
      where: (condition: SQL) => {
        const entry = query(table, condition);
        return {
          returning: async () => {
            const [current] = rows(table, entry);
            if (!current) return [];
            if (table === calendarEvents) {
              const expected = entry.params.at(-1);
              if (
                new Date(String(expected)).getTime() !== (state.event!.updatedAt as Date).getTime()
              )
                return [];
              state.event = null;
            } else state.reminder = null;
            state.writes++;
            return [{ id: current.id }];
          },
        };
      },
    }),
  };
  return { db: db as unknown as ApiDeps["db"], state, queries };
}

async function call(db: ApiDeps["db"], name: string, args: object, actingUser = userId) {
  const handler = createMcpHandler(() =>
    makeServer({ db, supabase: {} } as ApiDeps, { orgId: teamId, createdBy: actingUser }),
  );
  const response = await handler.fetch(
    new Request("https://api.contac.test/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-11-25",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    }),
  );
  const body = await response.text();
  const message = JSON.parse(body.match(/^data: (.*)$/m)?.[1] ?? body);
  const value = message.result.content[0].text;
  try {
    return JSON.parse(value);
  } catch {
    return { error: value };
  }
}

const meeting = {
  kind: "meeting",
  contactId,
  startAt: "2026-10-12T09:00:00.000Z",
  endAt: "2026-10-12T10:00:00.000Z",
};

describe("MCP calendar CRUD", () => {
  it("checks the selected team before every calendar tool touches data", async () => {
    const { db, queries, state } = memoryDb();
    for (const [name, args] of [
      [
        "list_calendar_events",
        {
          fromDate: "2026-10-12",
          toDate: "2026-10-13",
          startAt: meeting.startAt,
          endAt: meeting.endAt,
        },
      ],
      ["get_calendar_event", { eventId }],
      ["create_calendar_event", { event: meeting }],
      [
        "update_calendar_event",
        { eventId, expectedUpdatedAt: oldVersion.toISOString(), event: meeting },
      ],
      ["delete_calendar_event", { eventId, expectedUpdatedAt: oldVersion.toISOString() }],
      ["list_calendar_reminders", {}],
      ["get_calendar_reminder", { reminderId }],
      ["create_calendar_reminder", { contactId, dueAt: meeting.startAt }],
      ["update_calendar_reminder", { reminderId, message: "Later" }],
      ["dismiss_calendar_reminder", { reminderId }],
      ["delete_calendar_reminder", { reminderId }],
    ] as const) {
      const output = await call(db, name, { ...args, expectedTeamId: otherTeamId });
      expect(output.error).toContain("team ID does not match");
    }
    expect(queries).toHaveLength(0);
    expect(state.writes).toBe(0);
  });

  it("creates, reads, edits, and deletes shared events with contact and version checks", async () => {
    const { db, queries, state } = memoryDb();
    expect(
      (
        await call(db, "create_calendar_event", {
          expectedTeamId: teamId,
          event: { ...meeting, contactId: foreignContactId },
        })
      ).error,
    ).toContain("Contact not found");
    expect(state.writes).toBe(0);
    const created = await call(db, "create_calendar_event", {
      expectedTeamId: teamId,
      event: meeting,
    });
    expect(created).toMatchObject({ id: eventId, title: "Møte med Ada Lovelace" });
    expect(await call(db, "get_calendar_event", { expectedTeamId: teamId, eventId })).toMatchObject(
      { id: eventId },
    );
    const listed = await call(db, "list_calendar_events", {
      expectedTeamId: teamId,
      fromDate: "2026-10-12",
      toDate: "2026-10-13",
      startAt: meeting.startAt,
      endAt: meeting.endAt,
    });
    expect(listed.items).toHaveLength(1);
    expect(queries.at(-1)?.sql).toContain('"calendar_events"."org_id" =');
    expect(queries.at(-1)?.sql).toContain('"calendar_events"."start_at" <');
    const edited = await call(db, "update_calendar_event", {
      expectedTeamId: teamId,
      eventId,
      expectedUpdatedAt: oldVersion.toISOString(),
      event: { ...meeting, contactId: null, title: "Intervju" },
    });
    expect(edited).toMatchObject({ title: "Intervju", contactId: null });
    expect(
      (
        await call(db, "update_calendar_event", {
          expectedTeamId: teamId,
          eventId,
          expectedUpdatedAt: oldVersion.toISOString(),
          event: { ...meeting, title: "Stale" },
        })
      ).error,
    ).toContain("changed");
    expect(
      (
        await call(db, "delete_calendar_event", {
          expectedTeamId: teamId,
          eventId,
          expectedUpdatedAt: oldVersion.toISOString(),
        })
      ).error,
    ).toContain("changed");
    expect(
      await call(db, "delete_calendar_event", {
        expectedTeamId: teamId,
        eventId,
        expectedUpdatedAt: new Date(edited.updatedAt).toISOString(),
      }),
    ).toMatchObject({ deleted: true, eventId });
    expect(state.event).toBeNull();
    expect(
      await call(db, "create_calendar_event", {
        expectedTeamId: teamId,
        event: { kind: "meeting", startAt: meeting.startAt, endAt: meeting.endAt },
      }),
    ).toMatchObject({ title: "Møte", contactId: null });
  });

  it("supports untimed and timed deadlines", async () => {
    const { db } = memoryDb();
    const created = await call(db, "create_calendar_event", {
      expectedTeamId: teamId,
      event: { kind: "deadline", title: "Send rapport", date: "2026-10-12" },
    });
    expect(created).toMatchObject({
      kind: "deadline",
      title: "Send rapport",
      date: "2026-10-12",
      startAt: null,
      endAt: null,
      contactId: null,
    });
    const updated = await call(db, "update_calendar_event", {
      expectedTeamId: teamId,
      eventId,
      expectedUpdatedAt: oldVersion.toISOString(),
      event: {
        kind: "deadline",
        title: "Send rapport",
        date: "2026-10-13",
        startAt: "2026-10-13T12:00:00.000Z",
      },
    });
    expect(updated).toMatchObject({
      kind: "deadline",
      date: "2026-10-13",
      startAt: "2026-10-13T12:00:00.000Z",
    });
  });

  it("keeps reminders private to the connected user through their full lifecycle", async () => {
    const { db, queries, state } = memoryDb();
    expect(
      (
        await call(db, "create_calendar_reminder", {
          expectedTeamId: teamId,
          contactId: foreignContactId,
          dueAt: meeting.startAt,
        })
      ).error,
    ).toContain("Contact not found");
    const created = await call(db, "create_calendar_reminder", {
      expectedTeamId: teamId,
      contactId,
      dueAt: meeting.startAt,
      message: "Follow up",
    });
    expect(created).toMatchObject({ id: reminderId, userId, message: "Follow up" });
    expect(
      (await call(db, "get_calendar_reminder", { expectedTeamId: teamId, reminderId }, otherUserId))
        .error,
    ).toContain("not found");
    expect(
      (await call(db, "list_calendar_reminders", { expectedTeamId: teamId }, otherUserId)).items,
    ).toEqual([]);
    expect(queries.at(-1)?.sql).toContain('"contact_reminders"."user_id" =');
    expect(
      (
        await call(
          db,
          "update_calendar_reminder",
          {
            expectedTeamId: teamId,
            reminderId,
            message: "Changed by another user",
          },
          otherUserId,
        )
      ).error,
    ).toContain("not found");
    expect(
      (
        await call(db, "update_calendar_reminder", {
          expectedTeamId: teamId,
          reminderId,
          contactId: foreignContactId,
        })
      ).error,
    ).toContain("Contact not found");
    const updated = await call(db, "update_calendar_reminder", {
      expectedTeamId: teamId,
      reminderId,
      dueAt: "2026-10-13T11:00:00.000Z",
      message: "Call Ada",
    });
    expect(updated).toMatchObject({ message: "Call Ada" });
    expect(
      (
        await call(
          db,
          "delete_calendar_reminder",
          { expectedTeamId: teamId, reminderId },
          otherUserId,
        )
      ).error,
    ).toContain("not found");
    expect(
      await call(db, "dismiss_calendar_reminder", { expectedTeamId: teamId, reminderId }),
    ).toMatchObject({ id: reminderId });
    expect((await call(db, "list_calendar_reminders", { expectedTeamId: teamId })).items).toEqual(
      [],
    );
    expect(
      await call(db, "delete_calendar_reminder", { expectedTeamId: teamId, reminderId }),
    ).toMatchObject({ deleted: true, reminderId });
    expect(state.reminder).toBeNull();
  });
});
