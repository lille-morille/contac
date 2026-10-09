import { describe, expect, it } from "vitest";
import { applyOptimisticEdits } from "./mutations.ts";
import { emptyData, type Activity, type Contact } from "./model.tsx";

const contact = {
  id: "contact-1",
  status: "ikke_kontaktet",
  assigneeId: null,
  name: "Ada",
} as Contact;

describe("optimistic workspace edits", () => {
  it("shows the last queued edit and restores the prior value when it is removed", () => {
    const data = { ...emptyData, contacts: [contact] };
    const first = {
      token: 1,
      kind: "contacts" as const,
      id: contact.id,
      changes: { status: "skal_ringe" },
    };
    const second = {
      token: 2,
      kind: "contacts" as const,
      id: contact.id,
      changes: { status: "follow_up" },
    };
    expect(applyOptimisticEdits(data, [first, second], "member-1").contacts[0]).toMatchObject({
      status: "follow_up",
      assigneeId: "member-1",
    });
    expect(applyOptimisticEdits(data, [first], "member-1").contacts[0]?.status).toBe("skal_ringe");
    expect(applyOptimisticEdits(data, [], "member-1").contacts[0]?.status).toBe("ikke_kontaktet");
  });

  it("updates favorites and tag links without waiting for a query refetch", () => {
    const data = { ...emptyData, contacts: [contact] };
    const result = applyOptimisticEdits(
      data,
      [
        { token: 1, kind: "favorite", id: contact.id, changes: { favorite: true } },
        { token: 2, kind: "tags", id: contact.id, changes: { tagIds: ["tag-1"] } },
      ],
      null,
    );
    expect(result.favoriteContactIds).toEqual([contact.id]);
    expect(result.contactPersonTags).toEqual([{ contactId: contact.id, tagId: "tag-1" }]);
  });

  it("reorders an activity immediately when its occurrence time changes", () => {
    const early = { id: "early", occurredAt: "2026-10-01T12:00:00Z" } as Activity;
    const late = { id: "late", occurredAt: "2026-10-02T12:00:00Z" } as Activity;
    const data = { ...emptyData, activities: [late, early] };
    const result = applyOptimisticEdits(
      data,
      [
        {
          token: 1,
          kind: "contact_activities",
          id: early.id,
          changes: { occurredAt: "2026-10-03T12:00:00Z" },
        },
      ],
      null,
    );
    expect(result.activities.map((item) => item.id)).toEqual(["early", "late"]);
  });
});
