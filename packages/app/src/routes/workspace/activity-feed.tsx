import { Mail, Phone, PhoneCall, UserRound, Users } from "lucide-react";
import { useState } from "react";
import { Avatar } from "../../components/ui/avatar.tsx";
import { Button } from "../../components/ui/button.tsx";
import { Card } from "../../components/ui/card.tsx";
import { Checkbox } from "../../components/ui/checkbox.tsx";
import { Input } from "../../components/ui/input.tsx";
import { Select } from "../../components/ui/select.tsx";
import { profileAvatarUrl } from "../../lib/api.ts";
import {
  dateTimeLabel,
  missedOutcomeLabels,
  type Contact,
  type Data,
  type WorkspaceLocation,
} from "./model.tsx";

const dayFormat = new Intl.DateTimeFormat("nb-NO", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function ActivityFeed({
  data,
  currentUserId,
  onOpenActivity,
  initialFilters,
  onFiltersChange,
}: {
  data: Data;
  currentUserId: string;
  onOpenActivity: (contactId: string, activityId: string) => void;
  initialFilters: WorkspaceLocation["feed"];
  onFiltersChange: React.Dispatch<React.SetStateAction<WorkspaceLocation["feed"]>>;
}) {
  const [assigneeId, setAssigneeId] = useState(initialFilters.assignee ?? currentUserId);
  const [conversationsOnly, setConversationsOnly] = useState(initialFilters.conversationsOnly);
  const [search, setSearch] = useState(initialFilters.search);
  const currentMember = data.members.find((member) => member.userId === currentUserId);
  const entries = data.activities
    .filter((activity) => !conversationsOnly || activity.kind !== "missed_phone")
    .map((activity) => {
      const contacts = data.activityContacts
        .filter((link) => link.activityId === activity.id)
        .map((link) => data.contacts.find((contact) => contact.id === link.contactId))
        .filter((contact): contact is Contact => !!contact && contact.status !== "duplicate");
      const matchingContacts = contacts.filter((contact) =>
        assigneeId === "all"
          ? true
          : assigneeId === "unassigned"
            ? !contact.assigneeId
            : contact.assigneeId === assigneeId,
      );
      return { activity, contacts, matchingContacts };
    })
    .filter(({ activity, contacts, matchingContacts }) => {
      if (!matchingContacts.length) return false;
      const term = search.trim().toLocaleLowerCase("nb-NO");
      if (!term) return true;
      return [
        activity.summary,
        activity.transcript,
        ...contacts.flatMap((contact) => [
          contact.name,
          data.companies.find((company) => company.id === contact.companyId)?.name ?? "",
        ]),
      ]
        .join(" ")
        .toLocaleLowerCase("nb-NO")
        .includes(term);
    })
    .sort(
      (a, b) =>
        b.activity.occurredAt.localeCompare(a.activity.occurredAt) ||
        b.activity.createdAt.localeCompare(a.activity.createdAt),
    );
  const days = entries.reduce<Array<{ key: string; label: string; entries: typeof entries }>>(
    (groups, entry) => {
      const date = new Date(entry.activity.occurredAt);
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const last = groups.at(-1);
      if (last?.key === key) {
        last.entries.push(entry);
      } else {
        groups.push({ key, label: dayFormat.format(date), entries: [entry] });
      }
      return groups;
    },
    [],
  );
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="sr-only">Sist kontaktet</h1>
      <div className="grid gap-3 sm:grid-cols-[minmax(13rem,16rem)_minmax(0,1fr)_auto] sm:items-end">
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">
          <span className="leading-4">Ansvarlig for kontakten</span>
          <Select
            className="h-9 w-full shrink-0"
            value={assigneeId}
            onValueChange={(value) => {
              setAssigneeId(value);
              onFiltersChange((current) => ({ ...current, assignee: value }));
            }}
            aria-label="Filtrer aktiviteter etter kontaktansvarlig"
            items={[
              {
                value: currentUserId,
                label: `Mine kontakter${currentMember?.name ? ` · ${currentMember.name}` : ""}`,
                icon: <UserRound size={16} />,
              },
              { value: "all", label: "Alle kontakter", icon: <Users size={16} /> },
              ...data.members
                .filter((member) => member.userId === currentUserId)
                .map((member) => ({
                  value: member.userId,
                  label: "Meg (Anders Morille)",
                  icon: (
                    <Avatar
                      name={member.name || "Medlem"}
                      src={profileAvatarUrl(member.avatarPath)}
                      className="size-5"
                    />
                  ),
                })),
              ...data.members
                .filter((member) => member.userId !== currentUserId)
                .map((member) => ({
                  value: member.userId,
                  label: member.name || "Medlem",
                  icon: (
                    <Avatar
                      name={member.name || "Medlem"}
                      src={profileAvatarUrl(member.avatarPath)}
                      className="size-5"
                    />
                  ),
                })),
              { value: "unassigned", label: "Uten ansvarlig", icon: <UserRound size={16} /> },
            ]}
          />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted-foreground">
          <span className="leading-4">Søk</span>
          <Input
            className="h-9 shrink-0"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              onFiltersChange((current) => ({ ...current, search: event.target.value }));
            }}
            placeholder="Søk i samtaler, kontakter og organisasjoner …"
            aria-label="Søk i aktiviteter"
          />
        </label>
        <label className="flex h-9 items-center gap-2 whitespace-nowrap text-sm">
          <Checkbox
            checked={conversationsOnly}
            onCheckedChange={(checked) => {
              setConversationsOnly(checked);
              onFiltersChange((current) => ({ ...current, conversationsOnly: checked }));
            }}
            aria-label="Bare samtaler"
          />
          Bare samtaler
        </label>
      </div>
      {entries.length ? (
        <div className="mt-6 space-y-5">
          {days.map((day) => (
            <section key={day.key} className="space-y-3" aria-label={day.label}>
              <h2 className="sticky top-0 z-10 flex items-center gap-3 bg-background/95 py-2 text-sm font-semibold capitalize text-foreground backdrop-blur-sm">
                <span>{day.label}</span>
                <span aria-hidden="true" className="h-px flex-1 bg-border" />
              </h2>
              {day.entries.map(({ activity, contacts, matchingContacts }) => {
                const actor = data.members.find((member) => member.userId === activity.createdBy);
                const label =
                  activity.kind === "meeting"
                    ? "Møte"
                    : activity.kind === "phone"
                      ? "Telefonsamtale"
                      : activity.kind === "email"
                        ? "E-post"
                        : activity.missedOutcome
                          ? missedOutcomeLabels[activity.missedOutcome]
                          : "Ubesvart anrop";
                const Icon =
                  activity.kind === "meeting"
                    ? Users
                    : activity.kind === "phone"
                      ? PhoneCall
                      : activity.kind === "email"
                        ? Mail
                        : Phone;
                return (
                  <Card key={activity.id} className="p-4 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                          <Icon size={18} />
                        </span>
                        <div>
                          <h3 className="font-semibold">{label}</h3>
                          <p className="text-xs text-muted-foreground">
                            {dateTimeLabel(activity.occurredAt)}
                            {actor && ` · Registrert av ${actor.name || "Medlem"}`}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onOpenActivity(matchingContacts[0]!.id, activity.id)}
                      >
                        Åpne i kontakt
                      </Button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {contacts.map((contact) => {
                        const company = data.companies.find(
                          (item) => item.id === contact.companyId,
                        );
                        return (
                          <button
                            key={contact.id}
                            type="button"
                            className="rounded-lg border border-border bg-muted/50 px-2.5 py-1 text-left text-xs hover:border-primary/30 hover:text-primary"
                            onClick={() => onOpenActivity(contact.id, activity.id)}
                          >
                            {contact.name}
                            {company ? ` · ${company.name}` : ""}
                          </button>
                        );
                      })}
                    </div>
                    {activity.summary ? (
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">
                        {activity.summary}
                      </p>
                    ) : (
                      <p className="mt-3 text-sm text-muted-foreground">Ingen notater.</p>
                    )}
                    {activity.transcript && (
                      <details className="mt-3 border-t border-border pt-3">
                        <summary className="cursor-pointer text-sm font-medium text-primary">
                          Vis transkripsjon
                        </summary>
                        <p className="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed">
                          {activity.transcript}
                        </p>
                      </details>
                    )}
                  </Card>
                );
              })}
            </section>
          ))}
        </div>
      ) : (
        <Card className="mt-6 p-8 text-center text-sm text-muted-foreground">
          Ingen aktiviteter for dette utvalget. Velg en annen ansvarlig eller vis ubesvarte anrop.
        </Card>
      )}
    </div>
  );
}
