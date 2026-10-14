import { useQuery } from "@tanstack/react-query";
import { Building2, ExternalLink, Users } from "lucide-react";
import { useState } from "react";
import { contactStatuses, type ContactStatus } from "./contact-status.tsx";
import { request } from "../lib/api.ts";
import { useOrg } from "../lib/org.tsx";
import { Button } from "./ui/button.tsx";
import { Card } from "./ui/card.tsx";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog.tsx";

type Overlap = {
  contactId: string;
  ownerOrgId: string;
  teamName: string;
  assigneeName: string | null;
  status: ContactStatus;
  lastContactAt: string | null;
};
type SharedLog = {
  contact: {
    name: string;
    teamName: string;
    organizationName: string;
    assigneeName: string | null;
    email: string | null;
    phone: string | null;
    status: ContactStatus;
    description: string | null;
    sammendrag: string | null;
    stikkord: string | null;
    sharedNote: string;
    relevance: "low" | "medium" | "high" | null;
    tags: string[];
    domains: string[];
    additionalInfo: { id: string; markdown: string }[];
  };
  activities: {
    id: string;
    kind: string;
    occurredAt: string;
    summary: string;
    transcript: string;
    email: { fromEmail: string; toEmails: string[]; ccEmails: string[]; subject: string } | null;
  }[];
  attachments: { activityId: string; name: string; url: string | null }[];
};
const statusName = (value: ContactStatus) =>
  contactStatuses.find(([id]) => id === value)?.[1] ?? value;
const date = (value: string) =>
  new Date(value).toLocaleString("nb-NO", { dateStyle: "medium", timeStyle: "short" });

export function CrossTeamOverlap({
  contactId,
  updatedAt,
}: {
  contactId: string;
  updatedAt: string;
}) {
  const { org } = useOrg();
  const [selected, setSelected] = useState<Overlap | null>(null);
  const overlap = useQuery({
    queryKey: ["overlap", org?.id, contactId, updatedAt],
    queryFn: () => request<Overlap[]>(`/org/overlaps/${contactId}`, org!.id),
    enabled: !!org,
    refetchInterval: 60_000,
  });
  const log = useQuery({
    queryKey: ["shared-log", org?.id, selected?.contactId],
    queryFn: () => request<SharedLog>(`/org/shared-log/${selected!.contactId}`, org!.id),
    enabled: !!org && !!selected,
    refetchInterval: selected ? 60_000 : false,
  });
  if (!overlap.data?.length) return null;
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Users size={16} className="text-primary" />
        <h2 className="font-semibold">Også registrert hos andre team</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Se status hos andre team og åpne kontaktloggen for mer informasjon.
      </p>
      <div className="mt-3 space-y-3">
        {overlap.data.map((item) => (
          <div key={item.contactId} className="rounded-xl border border-border p-3 text-sm">
            <p className="flex items-center gap-1.5 font-medium">
              <Building2 size={14} /> {item.teamName}
            </p>
            <p className="mt-1 text-muted-foreground">Ansvarlig: {item.assigneeName ?? "Ingen"}</p>
            <p className="text-muted-foreground">Status: {statusName(item.status)}</p>
            <p className="text-muted-foreground">
              Siste kontakt: {item.lastContactAt ? date(item.lastContactAt) : "Ingen registrert"}
            </p>
            <div className="mt-2">
              <Button size="sm" variant="outline" onClick={() => setSelected(item)}>
                <ExternalLink size={14} /> Les kontaktlogg
              </Button>
            </div>
          </div>
        ))}
      </div>
      <Dialog open={!!selected} onOpenChange={(value) => !value && setSelected(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogTitle>Kontaktlogg · {log.data?.contact.name ?? "Kontakt"}</DialogTitle>
          <DialogDescription>
            Informasjon registrert av {log.data?.contact.teamName ?? selected?.teamName}. Dette er
            en skrivebeskyttet visning som oppdateres når teamet legger til mer.
          </DialogDescription>
          {log.isLoading && <p className="mt-4 text-sm text-muted-foreground">Laster logg …</p>}
          {log.isError && (
            <p role="alert" className="mt-4 text-sm text-risk">
              {log.error.message}
            </p>
          )}
          {log.data && (
            <div className="mt-5 space-y-5 text-sm">
              <section className="rounded-xl border border-border p-4">
                <h3 className="font-semibold">Oppsummering</h3>
                <p className="mt-2 whitespace-pre-wrap">
                  {log.data.contact.sammendrag ||
                    log.data.contact.description ||
                    "Teamet har ikke skrevet en oppsummering ennå."}
                </p>
                {log.data.contact.sammendrag && log.data.contact.description && (
                  <div className="mt-4">
                    <p className="text-xs font-medium text-muted-foreground">Kort beskrivelse</p>
                    <p className="mt-1 whitespace-pre-wrap">{log.data.contact.description}</p>
                  </div>
                )}
              </section>
              <section className="rounded-xl border border-border p-4">
                <h3 className="font-semibold">Kontaktinformasjon</h3>
                <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">Organisasjon</dt>
                    <dd>{log.data.contact.organizationName}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Status</dt>
                    <dd>{statusName(log.data.contact.status)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Ansvarlig</dt>
                    <dd>{log.data.contact.assigneeName || "Ingen"}</dd>
                  </div>
                  {log.data.contact.email && (
                    <div>
                      <dt className="text-xs text-muted-foreground">E-post</dt>
                      <dd className="break-all">{log.data.contact.email}</dd>
                    </div>
                  )}
                  {log.data.contact.phone && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Telefon</dt>
                      <dd>{log.data.contact.phone}</dd>
                    </div>
                  )}
                  {log.data.contact.relevance && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Relevans</dt>
                      <dd>
                        {{ high: "Høy", medium: "Middels", low: "Lav" }[log.data.contact.relevance]}
                      </dd>
                    </div>
                  )}
                  {log.data.contact.domains.length > 0 && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Domene</dt>
                      <dd>{log.data.contact.domains.join(", ")}</dd>
                    </div>
                  )}
                  {log.data.contact.tags.length > 0 && (
                    <div>
                      <dt className="text-xs text-muted-foreground">Persontagger</dt>
                      <dd>{log.data.contact.tags.join(", ")}</dd>
                    </div>
                  )}
                </dl>
              </section>
              {log.data.contact.stikkord && (
                <section className="rounded-xl border border-border p-4">
                  <h3 className="font-semibold">Stikkord</h3>
                  <p className="mt-2 whitespace-pre-wrap">{log.data.contact.stikkord}</p>
                </section>
              )}
              {log.data.contact.sharedNote && (
                <section className="rounded-xl border border-border p-4">
                  <h3 className="font-semibold">Delt notat</h3>
                  <p className="mt-2 whitespace-pre-wrap">{log.data.contact.sharedNote}</p>
                </section>
              )}
              {log.data.contact.additionalInfo.length > 0 && (
                <section className="rounded-xl border border-border p-4">
                  <h3 className="font-semibold">Tilleggsinformasjon</h3>
                  {log.data.contact.additionalInfo.map((item) => (
                    <p key={item.id} className="mt-2 whitespace-pre-wrap">
                      {item.markdown}
                    </p>
                  ))}
                </section>
              )}
              <h3 className="font-semibold">Aktiviteter ({log.data.activities.length})</h3>
              {log.data.activities.length === 0 && (
                <p className="text-muted-foreground">Ingen aktiviteter registrert ennå.</p>
              )}
            </div>
          )}
          <div className="mt-3 space-y-3">
            {log.data?.activities.map((activity) => (
              <div key={activity.id} className="rounded-xl border border-border p-4 text-sm">
                <p className="font-medium">
                  {activity.kind === "email"
                    ? "E-post"
                    : activity.kind === "meeting"
                      ? "Møte"
                      : activity.kind === "phone"
                        ? "Telefonsamtale"
                        : "Ubesvart anrop"}{" "}
                  · {date(activity.occurredAt)}
                </p>
                {activity.email && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Fra: {activity.email.fromEmail} · Til: {activity.email.toEmails.join(", ")} ·
                    Emne: {activity.email.subject}
                  </p>
                )}
                <p className="mt-3 whitespace-pre-wrap">{activity.summary || "Ingen notater."}</p>
                {activity.transcript && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-primary">Vis transkripsjon</summary>
                    <p className="mt-2 whitespace-pre-wrap">{activity.transcript}</p>
                  </details>
                )}
                {log.data.attachments
                  .filter((file) => file.activityId === activity.id)
                  .map((file) =>
                    file.url ? (
                      <a
                        key={file.name}
                        href={file.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 block text-primary underline"
                      >
                        {file.name}
                      </a>
                    ) : null,
                  )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
