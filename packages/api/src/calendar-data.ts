import { contacts } from "@contac/core/db";
import { and, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import type { ApiDeps } from "./types.ts";

const uuid = z.uuid();
const meetingInput = z.object({
  kind: z.literal("meeting"),
  title: z.string().trim().max(200).default(""),
  contactId: uuid.nullable().optional(),
  startAt: z.iso.datetime(),
  endAt: z.iso.datetime(),
});
const deadlineInput = z.object({
  kind: z.literal("deadline"),
  title: z.string().trim().min(1).max(200),
  date: z.iso.date(),
  startAt: z.iso.datetime().nullable().default(null),
});

export const calendarEventContentInput = z.discriminatedUnion("kind", [
  meetingInput,
  deadlineInput,
]);
export const calendarEventInput = z.discriminatedUnion("kind", [
  meetingInput.extend({ expectedUpdatedAt: z.iso.datetime().optional() }),
  deadlineInput.extend({ expectedUpdatedAt: z.iso.datetime().optional() }),
]);

export async function calendarEventValues(
  deps: ApiDeps,
  orgId: string,
  data: z.infer<typeof calendarEventContentInput>,
) {
  let contactName: string | null = null;
  if (data.kind === "meeting") {
    if (new Date(data.endAt) <= new Date(data.startAt))
      return {
        ok: false as const,
        error: "Meeting must end after it starts",
        status: 400 as const,
      };
    if (data.contactId) {
      const [contact] = await deps.db
        .select({ name: contacts.name })
        .from(contacts)
        .where(
          and(
            eq(contacts.orgId, orgId),
            eq(contacts.id, data.contactId),
            ne(contacts.status, "duplicate"),
            isNull(contacts.deletedAt),
          ),
        );
      if (!contact) return { ok: false as const, error: "Contact not found", status: 404 as const };
      contactName = contact.name;
    }
  }
  return {
    ok: true as const,
    values: {
      kind: data.kind,
      title:
        data.kind === "meeting" && !data.title
          ? (contactName ? `Møte med ${contactName}` : "Møte").slice(0, 200)
          : data.title,
      contactId: data.kind === "meeting" ? (data.contactId ?? null) : null,
      date: data.kind === "deadline" ? data.date : null,
      startAt: data.startAt ? new Date(data.startAt) : null,
      endAt: data.kind === "meeting" ? new Date(data.endAt) : null,
      updatedAt: new Date(),
    },
  };
}
