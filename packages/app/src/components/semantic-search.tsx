import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Search } from "lucide-react";
import { useState } from "react";
import { request } from "../lib/api.ts";
import { useOrg } from "../lib/org.tsx";
import { Button } from "./ui/button.tsx";
import { Card } from "./ui/card.tsx";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog.tsx";
import { Input } from "./ui/input.tsx";

export type SearchResult = {
  contactId: string;
  activityId: string | null;
  kind: "contact" | "activity" | "note";
  passage: string;
  contactName: string;
  companyName: string;
  ownerOrgId: string;
  score: number;
};
type SharedLog = {
  contact: { name: string; teamName: string };
  activities: { id: string; occurredAt: string; summary: string; transcript: string }[];
};

export function SemanticSearch({
  onOpen,
  initialQuery = "",
  initialShared = null,
}: {
  onOpen: (contactId: string, activityId: string | null, passage: string, query: string) => void;
  initialQuery?: string;
  initialShared?: SearchResult | null;
}) {
  const { org } = useOrg();
  const [text, setText] = useState(initialQuery);
  const [submitted, setSubmitted] = useState(initialQuery);
  const query = useQuery({
    queryKey: ["semantic-search", org?.id, submitted],
    queryFn: () =>
      request<{ results: SearchResult[]; model: string }>(
        `/org/search?q=${encodeURIComponent(submitted)}`,
        org!.id,
      ),
    enabled: !!org && submitted.length >= 2,
    refetchInterval: 60_000,
  });
  const [shared, setShared] = useState<SearchResult | null>(initialShared);
  const sharedLog = useQuery({
    queryKey: ["shared-search-log", org?.id, shared?.contactId],
    queryFn: () => request<SharedLog>(`/org/shared-log/${shared!.contactId}`, org!.id),
    enabled: !!org && !!shared,
    refetchInterval: 60_000,
  });
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Søk</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Finn samtaler, personer og notater med norsk semantisk søk. Søket kjøres lokalt på
          serveren.
        </p>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(text.trim());
        }}
      >
        <Input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Hva ble sagt om kostnader hvis kvaliteten endret seg?"
          aria-label="Søk i kontaktinformasjon"
        />
        <Button disabled={text.trim().length < 2}>
          <Search size={16} /> Søk
        </Button>
      </form>
      {query.isFetching && (
        <p className="text-sm text-muted-foreground">
          Søker og oppdaterer lokal indeks … Første søk kan laste ned språkmodellen.
        </p>
      )}
      {query.isError && <Card className="p-4 text-sm text-risk">{query.error.message}</Card>}
      {query.data && (
        <p className="text-xs text-muted-foreground">
          {query.data.results.length} treff · lokal flerspråklig modell
        </p>
      )}
      <div className="space-y-3">
        {query.data?.results.map((result, index) => (
          <Card key={`${result.contactId}:${result.activityId}:${index}`} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  {result.contactName} · {result.companyName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {result.kind === "activity"
                    ? "Aktivitet"
                    : result.kind === "note"
                      ? "Notat"
                      : "Kontaktinfo"}
                  {result.ownerOrgId !== org?.id ? " · delt fra annet team" : ""}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  result.ownerOrgId === org?.id
                    ? onOpen(
                        result.contactId,
                        result.activityId ?? (result.kind === "note" ? "note" : null),
                        result.passage,
                        submitted,
                      )
                    : setShared(result)
                }
              >
                <ExternalLink size={14} /> Åpne
              </Button>
            </div>
            <p className="mt-3 rounded-xl bg-primary/10 p-3 text-sm leading-relaxed">
              <mark className="bg-primary/15 text-foreground">{result.passage}</mark>
            </p>
          </Card>
        ))}
      </div>
      {query.data && !query.data.results.length && (
        <Card className="p-6 text-sm text-muted-foreground">
          Ingen treff. Prøv andre ord eller en kortere beskrivelse.
        </Card>
      )}
      <Dialog open={!!shared} onOpenChange={(open) => !open && setShared(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogTitle>
            Kontaktlogg · {sharedLog.data?.contact.name ?? shared?.contactName}
          </DialogTitle>
          <DialogDescription>
            Lesetilgang fra {sharedLog.data?.contact.teamName}. Treffer framheves i
            forhåndsvisningen.
          </DialogDescription>
          {sharedLog.isLoading && <p>Laster …</p>}
          {sharedLog.isError && (
            <p role="alert" className="text-risk">
              {sharedLog.error.message}
            </p>
          )}
          {shared?.kind !== "activity" && (
            <p className="mt-3 rounded-lg bg-primary/10 p-3 text-sm">{shared?.passage}</p>
          )}
          {sharedLog.data?.activities.map((activity) => (
            <div
              key={activity.id}
              className={`mt-3 rounded-xl border p-3 text-sm ${activity.id === shared?.activityId ? "border-primary bg-primary/10" : "border-border"}`}
            >
              <p className="text-xs text-muted-foreground">
                {new Date(activity.occurredAt).toLocaleString("nb-NO")}
              </p>
              <p className="mt-2 whitespace-pre-wrap">{activity.summary}</p>
              {activity.transcript && (
                <details className="mt-2">
                  <summary>Transkripsjon</summary>
                  <p className="whitespace-pre-wrap">{activity.transcript}</p>
                </details>
              )}
              {activity.id === shared?.activityId && (
                <p className="mt-2 rounded-lg bg-primary/10 p-2">Treff: {shared.passage}</p>
              )}
            </div>
          ))}
        </DialogContent>
      </Dialog>
    </div>
  );
}
