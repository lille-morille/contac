import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ApiError, request } from "../../lib/api.ts";
import { beginLocalRowWrite } from "../../lib/local-write-sync.ts";
import type { Activity, Company, Contact, Data, LibraryItem, Reminder } from "./model.tsx";

type ScalarKind = "contacts" | "contact_activities" | "companies";
type PendingEdit = {
  token: number;
  kind: ScalarKind | "favorite" | "tags" | "reminder";
  id: string;
  changes: Record<string, unknown>;
};

export function applyOptimisticEdits(
  data: Data,
  edits: PendingEdit[],
  userId: string | null,
): Data {
  if (!edits.length) return data;
  let contacts = data.contacts;
  let activities = data.activities;
  let companies = data.companies;
  let contactPersonTags = data.contactPersonTags;
  let favoriteContactIds = data.favoriteContactIds;
  let reminders = data.reminders;
  for (const edit of edits) {
    if (edit.kind === "contacts")
      contacts = contacts.map((row) => {
        if (row.id !== edit.id) return row;
        const autoAssignee =
          row.status === "ikke_kontaktet" &&
          edit.changes.status &&
          edit.changes.status !== "ikke_kontaktet" &&
          !row.assigneeId &&
          userId &&
          edit.changes.assigneeId === undefined;
        return {
          ...row,
          ...edit.changes,
          ...(autoAssignee ? { assigneeId: userId } : {}),
        } as Contact;
      });
    if (edit.kind === "contact_activities")
      activities = activities.map((row) =>
        row.id === edit.id ? ({ ...row, ...edit.changes } as Activity) : row,
      );
    if (edit.kind === "companies")
      companies = companies.map((row) =>
        row.id === edit.id ? ({ ...row, ...edit.changes } as Company) : row,
      );
    if (edit.kind === "favorite") {
      favoriteContactIds = edit.changes.favorite
        ? [...new Set([...favoriteContactIds, edit.id])]
        : favoriteContactIds.filter((id) => id !== edit.id);
    }
    if (edit.kind === "tags" && Array.isArray(edit.changes.tagIds)) {
      contactPersonTags = [
        ...contactPersonTags.filter((link) => link.contactId !== edit.id),
        ...(edit.changes.tagIds as string[]).map((tagId) => ({ contactId: edit.id, tagId })),
      ];
    }
    if (edit.kind === "reminder") reminders = reminders.filter((row) => row.id !== edit.id);
  }
  if (edits.some((edit) => edit.kind === "contact_activities"))
    activities = [...activities].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return {
    ...data,
    contacts,
    activities,
    companies,
    contactPersonTags,
    favoriteContactIds,
    reminders,
  };
}

function updateRow<T extends { id: string }>(rows: T[], row: T): T[] {
  return rows.some((item) => item.id === row.id)
    ? rows.map((item) => (item.id === row.id ? row : item))
    : [...rows, row];
}

function byNewest<T extends { updatedAt: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
function byOccurrence<T extends { occurredAt: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}
function byName<T extends { name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name, "nb"));
}

export function useWorkspaceMutations({
  teamId,
  data,
  onChanged,
}: {
  teamId: string | null | undefined;
  data: Data;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const [activeCount, setActiveCount] = useState(0);
  const [pendingEdits, setPendingEdits] = useState<PendingEdit[]>([]);
  const writes = useRef(new Map<string, Promise<unknown>>());
  const nextToken = useRef(0);
  const busy = activeCount > 0;

  function core() {
    return qc.getQueryData<
      Pick<Data, "contacts" | "companies" | "contactPersonTags" | "companyDomains">
    >(["contact-data", teamId, "core"]);
  }
  function activitySlice() {
    return qc.getQueryData<Pick<Data, "activities" | "activityContacts">>([
      "contact-data",
      teamId,
      "activities",
    ]);
  }
  async function save<T>(
    path: string,
    body: unknown,
    rowKind: ScalarKind | null,
    rowId: string | null,
  ): Promise<T> {
    if (!teamId) throw new Error("Velg et team");
    setError("");
    const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const changes = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "expected"));
    const tagContactId = path.match(/^\/contacts\/([0-9a-f-]{36})\/tags$/i)?.[1];
    const domainCompanyId = path.match(/^\/companies\/([0-9a-f-]{36})\/domains$/i)?.[1];
    if (rowKind || tagContactId)
      await qc.cancelQueries({
        queryKey: [
          "contact-data",
          teamId,
          rowKind === "contact_activities" ? "activities" : "core",
        ],
      });
    else if (path.endsWith("/favorite") || /^\/reminders\/[^/]+\/dismiss$/.test(path))
      await qc.cancelQueries({ queryKey: ["contact-data", teamId, "personal"] });
    const source =
      rowKind === "contacts"
        ? (core()?.contacts ?? data.contacts).find((item) => item.id === rowId)
        : rowKind === "contact_activities"
          ? (activitySlice()?.activities ?? data.activities).find((item) => item.id === rowId)
          : rowKind === "companies"
            ? (core()?.companies ?? data.companies).find((item) => item.id === rowId)
            : null;
    const relationExpected = tagContactId
      ? {
          tagIds: (core()?.contactPersonTags ?? data.contactPersonTags)
            .filter((link) => link.contactId === tagContactId)
            .map((link) => link.tagId),
        }
      : domainCompanyId
        ? {
            domainIds: (core()?.companyDomains ?? data.companyDomains)
              .filter((link) => link.companyId === domainCompanyId)
              .map((link) => link.domainId),
            revision: (core()?.companies ?? data.companies).find(
              (company) => company.id === domainCompanyId,
            )?.domainsRevision,
          }
        : null;
    const payload = source
      ? {
          ...changes,
          expected:
            input.expected ??
            Object.fromEntries(
              Object.keys(changes).map((key) => [
                key,
                (source as unknown as Record<string, unknown>)[key],
              ]),
            ),
        }
      : relationExpected
        ? { ...changes, expected: input.expected ?? relationExpected }
        : body;
    const completeLocalWrite = rowKind && rowId ? beginLocalRowWrite(teamId, rowKind, rowId) : null;
    try {
      const result = await request<T>(`/org${path}`, teamId, payload);
      const row = result as Record<string, unknown>;
      if (rowKind === "contacts" && rowId && row.id === rowId) {
        qc.setQueryData<Pick<Data, "contacts">>(["contact-data", teamId, "core"], (old) =>
          old ? { ...old, contacts: byNewest(updateRow(old.contacts, row as Contact)) } : old,
        );
      } else if (rowKind === "contact_activities" && rowId && row.id === rowId) {
        qc.setQueryData<Pick<Data, "activities">>(["contact-data", teamId, "activities"], (old) =>
          old
            ? { ...old, activities: byOccurrence(updateRow(old.activities, row as Activity)) }
            : old,
        );
      } else if (rowKind === "companies" && rowId && row.id === rowId) {
        qc.setQueryData<Pick<Data, "companies">>(["contact-data", teamId, "core"], (old) =>
          old ? { ...old, companies: byName(updateRow(old.companies, row as Company)) } : old,
        );
      } else if (path === "/contacts" && typeof row.id === "string") {
        qc.setQueryData<Pick<Data, "contacts" | "contactPersonTags">>(
          ["contact-data", teamId, "core"],
          (old) =>
            old
              ? {
                  ...old,
                  contacts: byNewest(updateRow(old.contacts, row as Contact)),
                  contactPersonTags: Array.isArray(input.tagIds)
                    ? [
                        ...old.contactPersonTags,
                        ...input.tagIds.map((tagId) => ({
                          contactId: row.id as string,
                          tagId: tagId as string,
                        })),
                      ]
                    : old.contactPersonTags,
                }
              : old,
        );
      } else if (path === "/activities" && typeof row.id === "string") {
        qc.setQueryData<Pick<Data, "activities" | "activityContacts">>(
          ["contact-data", teamId, "activities"],
          (old) =>
            old
              ? {
                  ...old,
                  activities: byOccurrence(updateRow(old.activities, row as Activity)),
                  activityContacts: Array.isArray(input.contactIds)
                    ? [
                        ...old.activityContacts,
                        ...input.contactIds.map((contactId) => ({
                          activityId: row.id as string,
                          contactId: contactId as string,
                        })),
                      ]
                    : old.activityContacts,
                }
              : old,
        );
      } else if (/^\/contacts\/[^/]+\/delete$/.test(path) && typeof row.id === "string") {
        qc.setQueryData<Pick<Data, "contacts">>(["contact-data", teamId, "core"], (old) =>
          old ? { ...old, contacts: old.contacts.filter((item) => item.id !== row.id) } : old,
        );
        qc.setQueryData<Contact[]>(["deleted-contacts", teamId], (old) =>
          old ? byNewest(updateRow(old, row as Contact)) : old,
        );
      } else if (/^\/contacts\/[^/]+\/restore$/.test(path) && typeof row.id === "string") {
        qc.setQueryData<Pick<Data, "contacts">>(["contact-data", teamId, "core"], (old) =>
          old ? { ...old, contacts: byNewest(updateRow(old.contacts, row as Contact)) } : old,
        );
        qc.setQueryData<Contact[]>(["deleted-contacts", teamId], (old) =>
          old ? old.filter((item) => item.id !== row.id) : old,
        );
      } else if (/^\/activities\/[^/]+\/delete$/.test(path)) {
        const id = path.split("/")[2]!;
        qc.setQueryData<
          Pick<Data, "activities" | "activityContacts" | "activityFiles" | "emailActivities">
        >(["contact-data", teamId, "activities"], (old) =>
          old
            ? {
                ...old,
                activities: old.activities.filter((item) => item.id !== id),
                activityContacts: old.activityContacts.filter((item) => item.activityId !== id),
                activityFiles: old.activityFiles.filter((item) => item.activityId !== id),
                emailActivities: old.emailActivities.filter((item) => item.activityId !== id),
              }
            : old,
        );
      } else if (path.endsWith("/favorite") && typeof input.favorite === "boolean") {
        const contactId = path.split("/")[2]!;
        qc.setQueryData<Pick<Data, "favoriteContactIds">>(
          ["contact-data", teamId, "personal"],
          (old) =>
            old
              ? {
                  ...old,
                  favoriteContactIds: input.favorite
                    ? [...new Set([...old.favoriteContactIds, contactId])]
                    : old.favoriteContactIds.filter((id) => id !== contactId),
                }
              : old,
        );
      } else if (tagContactId && Array.isArray(input.tagIds)) {
        qc.setQueryData<Pick<Data, "contactPersonTags">>(["contact-data", teamId, "core"], (old) =>
          old
            ? {
                ...old,
                contactPersonTags: [
                  ...old.contactPersonTags.filter((link) => link.contactId !== tagContactId),
                  ...(input.tagIds as string[]).map((tagId) => ({
                    contactId: tagContactId,
                    tagId,
                  })),
                ],
              }
            : old,
        );
      } else if (/^\/reminders\/[^/]+\/dismiss$/.test(path)) {
        const reminderId = path.split("/")[2]!;
        qc.setQueryData<Pick<Data, "reminders">>(["contact-data", teamId, "personal"], (old) =>
          old
            ? {
                ...old,
                reminders: old.reminders.filter((item) => item.id !== reminderId),
              }
            : old,
        );
      } else if (path === "/reminders" && typeof row.id === "string") {
        qc.setQueryData<Pick<Data, "reminders">>(["contact-data", teamId, "personal"], (old) =>
          old
            ? {
                ...old,
                reminders: [...old.reminders, row as Reminder].sort((a, b) =>
                  a.dueAt.localeCompare(b.dueAt),
                ),
              }
            : old,
        );
      } else if (path === "/library" && typeof row.id === "string") {
        const contact = data.contacts.find((item) => item.id === row.contactId);
        const item = {
          ...row,
          contactName: contact?.name ?? null,
          contactNumber: contact?.contactNumber ?? null,
          sourceDeleted: false,
          sourceEdited: false,
        } as LibraryItem;
        qc.setQueryData<LibraryItem[]>(["library", teamId], (old) =>
          old ? [item, ...old.filter((entry) => entry.id !== item.id)] : old,
        );
      }
      completeLocalWrite?.(typeof row.updatedAt === "string" ? row.updatedAt : undefined);
      // Reconcile derived views in the background. The mutation promise now ends
      // with the authoritative response instead of waiting for a second GET.
      if (
        !rowKind &&
        !tagContactId &&
        !path.endsWith("/favorite") &&
        !path.startsWith("/library") &&
        path !== "/reminders" &&
        !/^\/reminders\/[^/]+\/dismiss$/.test(path)
      ) {
        if (path.startsWith("/activities")) {
          void qc.invalidateQueries({ queryKey: ["contact-data", teamId, "core"] });
          if (path !== "/activities")
            void qc.invalidateQueries({ queryKey: ["contact-data", teamId, "activities"] });
        } else if (
          path.startsWith("/companies") ||
          path.startsWith("/domains") ||
          path.startsWith("/person-tags") ||
          path.endsWith("/tags") ||
          path.startsWith("/contacts")
        )
          void qc.invalidateQueries({ queryKey: ["contact-data", teamId, "core"] });
        else if (path.startsWith("/reminders"))
          void qc.invalidateQueries({ queryKey: ["contact-data", teamId, "personal"] });
        else void qc.invalidateQueries({ queryKey: ["contact-data", teamId] });
      }
      if (rowKind === "contact_activities")
        void qc.invalidateQueries({ queryKey: ["contact-data", teamId, "core"] });
      if (
        path.includes("email") ||
        path.includes("reminders") ||
        path.startsWith("/contacts") ||
        path.startsWith("/companies")
      )
        void qc.invalidateQueries({ queryKey: ["inbox", teamId] });
      if (path.startsWith("/library") && path !== "/library")
        void qc.invalidateQueries({ queryKey: ["library", teamId] });
      if (/^\/contacts\/[^/]+\/(delete|restore)$/.test(path))
        void qc.invalidateQueries({ queryKey: ["deleted-contacts", teamId] });
      onChanged();
      return result;
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        cause.status === 409 &&
        cause.details.current &&
        typeof cause.details.current === "object"
      ) {
        const current = cause.details.current as Record<string, unknown>;
        if (rowKind === "contacts" && rowId && current.id === rowId)
          qc.setQueryData<Pick<Data, "contacts">>(["contact-data", teamId, "core"], (old) =>
            old ? { ...old, contacts: byNewest(updateRow(old.contacts, current as Contact)) } : old,
          );
        else if (rowKind === "contact_activities" && rowId && current.id === rowId)
          qc.setQueryData<Pick<Data, "activities">>(["contact-data", teamId, "activities"], (old) =>
            old
              ? { ...old, activities: byOccurrence(updateRow(old.activities, current as Activity)) }
              : old,
          );
        else if (rowKind === "companies" && rowId && current.id === rowId)
          qc.setQueryData<Pick<Data, "companies">>(["contact-data", teamId, "core"], (old) =>
            old ? { ...old, companies: byName(updateRow(old.companies, current as Company)) } : old,
          );
        else if (tagContactId && Array.isArray(current.tagIds))
          qc.setQueryData<Pick<Data, "contactPersonTags">>(
            ["contact-data", teamId, "core"],
            (old) =>
              old
                ? {
                    ...old,
                    contactPersonTags: [
                      ...old.contactPersonTags.filter((link) => link.contactId !== tagContactId),
                      ...(current.tagIds as string[]).map((tagId) => ({
                        contactId: tagContactId,
                        tagId,
                      })),
                    ],
                  }
                : old,
          );
        else void qc.invalidateQueries({ queryKey: ["contact-data", teamId, "core"] });
        completeLocalWrite?.(typeof current.updatedAt === "string" ? current.updatedAt : undefined);
        setError("Noen endret dette samtidig. Nyeste lagrede verdi vises.");
        onChanged();
        return current as T;
      }
      completeLocalWrite?.();
      if (path.endsWith("/rename") && cause instanceof ApiError && cause.status === 409) {
        setError(cause.message);
        if (cause.details.current)
          void qc.invalidateQueries({ queryKey: ["contact-data", teamId, "core"] });
      } else if (
        (path.startsWith("/person-tags/") || path.startsWith("/domains/")) &&
        cause instanceof ApiError &&
        cause.status === 409
      ) {
        setError(
          "Taggen ble endret av noen andre. Sammenlign den nye beskrivelsen med utkastet ditt.",
        );
        void qc.invalidateQueries({ queryKey: ["contact-data", teamId, "core"] });
      } else setError(cause instanceof Error ? cause.message : String(cause));
      throw cause;
    }
  }

  function mutate<T = unknown>(path: string, body: unknown): Promise<T> {
    setActiveCount((count) => count + 1);
    const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const contactId = path.match(/^\/contacts\/([0-9a-f-]{36})$/i)?.[1] ?? null;
    const activityId = path.match(/^\/activities\/([0-9a-f-]{36})$/i)?.[1] ?? null;
    const companyId = path.match(/^\/companies\/([0-9a-f-]{36})$/i)?.[1] ?? null;
    const favoriteId = path.match(/^\/contacts\/([0-9a-f-]{36})\/favorite$/i)?.[1] ?? null;
    const tagId = path.match(/^\/contacts\/([0-9a-f-]{36})\/tags$/i)?.[1] ?? null;
    const reminderId = path.match(/^\/reminders\/([0-9a-f-]{36})\/dismiss$/i)?.[1] ?? null;
    const rowKind: ScalarKind | null = contactId
      ? "contacts"
      : activityId
        ? "contact_activities"
        : companyId
          ? "companies"
          : null;
    const rowId = contactId ?? activityId ?? companyId;
    const optimisticKind =
      rowKind ?? (favoriteId ? "favorite" : tagId ? "tags" : reminderId ? "reminder" : null);
    const optimisticId = rowId ?? favoriteId ?? tagId ?? reminderId;
    const token = ++nextToken.current;
    const optimisticChanges = Object.fromEntries(
      Object.entries(input).filter(([key]) => key !== "expected"),
    );
    if (optimisticKind && optimisticId)
      setPendingEdits((current) => [
        ...current,
        { token, kind: optimisticKind, id: optimisticId, changes: optimisticChanges },
      ]);
    const queueKey =
      teamId && optimisticKind && optimisticId
        ? `${teamId}:${optimisticKind}:${optimisticId}`
        : null;
    const previous = queueKey ? writes.current.get(queueKey) : null;
    const write = (previous ?? Promise.resolve())
      .catch(() => {})
      .then(() => save<T>(path, body, rowKind, rowId));
    if (queueKey) writes.current.set(queueKey, write);
    return write.finally(() => {
      setActiveCount((count) => count - 1);
      if (queueKey && writes.current.get(queueKey) === write) writes.current.delete(queueKey);
      setPendingEdits((current) => current.filter((edit) => edit.token !== token));
    });
  }

  return { mutate, busy, error, setError, pendingEdits };
}
