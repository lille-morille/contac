import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { request } from "../lib/api.ts";
import { Button } from "./ui/button.tsx";
import { Card } from "./ui/card.tsx";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog.tsx";
import { Select } from "./ui/select.tsx";
import { Textarea } from "./ui/textarea.tsx";

export type FeedbackKind = "ny_funksjonalitet" | "justering" | "bug_feil";
export const feedbackKinds: { value: FeedbackKind; label: string }[] = [
  { value: "ny_funksjonalitet", label: "Ny funksjonalitet" },
  { value: "justering", label: "Justering" },
  { value: "bug_feil", label: "Bug/feil" },
];
export const feedbackKindLabel = (kind: FeedbackKind) =>
  feedbackKinds.find((item) => item.value === kind)?.label ?? kind;

export type FeedbackInboxItem = {
  id: string;
  kind: FeedbackKind;
  content: string;
  completedAt: string;
};
type AdminFeedbackItem = Omit<FeedbackInboxItem, "completedAt"> & {
  createdAt: string;
  completedAt: string | null;
  senderName: string | null;
  senderEmail: string | null;
};

export function FeedbackDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [kind, setKind] = useState<FeedbackKind>("ny_funksjonalitet");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!content.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await request("/feedback", undefined, { kind, content: content.trim() });
      setContent("");
      setKind("ny_funksjonalitet");
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke sende tilbakemeldingen.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent>
        <DialogTitle>Send tilbakemelding</DialogTitle>
        <DialogDescription>Tilbakemeldingen sendes til klasseadministratoren.</DialogDescription>
        <form className="mt-4 space-y-4" onSubmit={(event) => void submit(event)}>
          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="feedback-kind">
              Type
            </label>
            <Select
              id="feedback-kind"
              value={kind}
              onValueChange={(value) => setKind(value as FeedbackKind)}
              items={feedbackKinds}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="feedback-content">
              Tilbakemelding
            </label>
            <Textarea
              id="feedback-content"
              autoFocus
              required
              maxLength={4000}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Beskriv ønsket eller feilen …"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-risk">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Avbryt
            </Button>
            <Button type="submit" disabled={busy || !content.trim()}>
              Send
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AdminFeedbackLog({ classId }: { classId: string }) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["class-feedback", classId],
    queryFn: () => request<AdminFeedbackItem[]>("/class/feedback"),
    refetchInterval: 30_000,
  });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function complete(id: string) {
    setBusy(id);
    setError("");
    try {
      await request(`/class/feedback/${id}/complete`, undefined, {});
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["class-feedback", classId] }),
        qc.invalidateQueries({ queryKey: ["feedback-inbox"] }),
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke fullføre tilbakemeldingen.");
    } finally {
      setBusy("");
    }
  }
  return (
    <Card className="p-5">
      <h2 className="font-semibold">Tilbakemeldinger</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Alle innspill fra klassen. Fullførte innspill sender en melding til avsenderens innboks.
      </p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-risk">
          {error}
        </p>
      )}
      {query.isError && (
        <p role="alert" className="mt-3 text-sm text-risk">
          Kunne ikke hente tilbakemeldinger.
        </p>
      )}
      {query.isPending && <p className="mt-4 text-sm text-muted-foreground">Laster …</p>}
      {query.data?.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">Ingen tilbakemeldinger ennå.</p>
      )}
      <div className="mt-4 space-y-3">
        {query.data?.map((item) => (
          <div key={item.id} className="rounded-xl border border-border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{feedbackKindLabel(item.kind)}</p>
              <span className="text-xs text-muted-foreground">
                {item.completedAt ? "Fullført" : "Åpen"}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words">{item.content}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {item.senderName || item.senderEmail || "Ukjent bruker"} ·{" "}
              {new Date(item.createdAt).toLocaleString("nb-NO", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
            {!item.completedAt && (
              <Button
                className="mt-3"
                size="sm"
                disabled={busy === item.id}
                onClick={() => void complete(item.id)}
              >
                Complete
              </Button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
