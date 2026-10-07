import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ExternalLink, LockKeyhole, Users } from "lucide-react";
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
  accessStatus: "none" | "pending" | "approved";
};
type SharedLog = {
  contact: { name: string; teamName: string };
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
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Overlap | null>(null);
  const [error, setError] = useState("");
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
  async function ask(item: Overlap) {
    if (!org) return;
    setError("");
    try {
      await request("/org/log-access-requests", org.id, {
        requesterContactId: contactId,
        ownerContactId: item.contactId,
      });
      await qc.invalidateQueries({ queryKey: ["overlap", org.id, contactId] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }
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
              {item.accessStatus === "approved" ? (
                <Button size="sm" variant="outline" onClick={() => setSelected(item)}>
                  <ExternalLink size={14} /> Les kontaktlogg
                </Button>
              ) : item.accessStatus === "pending" ? (
                <span className="text-xs text-muted-foreground">
                  Forespørsel venter på godkjenning
                </span>
              ) : (
                <Button size="sm" variant="outline" onClick={() => void ask(item)}>
                  <LockKeyhole size={14} /> Be om lesetilgang
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-risk">
          {error}
        </p>
      )}
      <Dialog open={!!selected} onOpenChange={(value) => !value && setSelected(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogTitle>Kontaktlogg · {log.data?.contact.name ?? "Kontakt"}</DialogTitle>
          <DialogDescription>
            Lesetilgang fra {log.data?.contact.teamName ?? selected?.teamName}. Nye aktiviteter
            vises også her. Det delte notatet er ikke inkludert.
          </DialogDescription>
          {log.isLoading && <p className="mt-4 text-sm text-muted-foreground">Laster logg …</p>}
          {log.isError && (
            <p role="alert" className="mt-4 text-sm text-risk">
              {log.error.message}
            </p>
          )}
          <div className="mt-4 space-y-3">
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
