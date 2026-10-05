import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { request } from "../lib/api.ts";
import { useOrg } from "../lib/org.tsx";
import { Button } from "./ui/button.tsx";
import { Card } from "./ui/card.tsx";

type Summary = { id: string; summary: string; generatedAt: string; excludedCount: number };
export function GroupAiSummary({
  kind,
  id,
  name,
}: {
  kind: "company" | "domain";
  id: string;
  name: string;
}) {
  const { org } = useOrg();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const settings = useQuery({
    queryKey: ["checkin-ai", org?.id],
    queryFn: () =>
      request<{ modes: Record<string, string>; hasToken: boolean }>("/org/checkin-ai", org!.id),
    enabled: !!org,
    refetchInterval: 60_000,
  });
  const summary = useQuery({
    queryKey: ["group-ai", org?.id, kind, id],
    queryFn: () =>
      request<{
        summary: Summary | null;
        stale: boolean;
        excludedCount: number;
        includedCount: number;
      }>(`/org/ai/groups/${kind}/${id}`, org!.id),
    enabled: !!org,
    refetchInterval: 60_000,
  });
  async function generate() {
    if (!org) return;
    setBusy(true);
    setError("");
    try {
      await request(`/org/ai/groups/${kind}/${id}/generate`, org.id, {});
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["group-ai", org.id, kind, id] }),
        qc.invalidateQueries({ queryKey: ["ai-usage", org.id] }),
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kunne ikke lage sammendrag");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Sparkles size={16} className="text-primary" />
        <h2 className="font-semibold">Viktigste funn · {name}</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {summary.data?.includedCount ?? 0} kontakter med tillatte samtaler ·{" "}
        {summary.data?.excludedCount ?? 0} utelatt
      </p>
      {summary.data?.summary && (
        <>
          <p className="mt-3 whitespace-pre-wrap text-sm">{summary.data.summary.summary}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            Laget {new Date(summary.data.summary.generatedAt).toLocaleString("nb-NO")}
            {summary.data.stale ? " · nye endringer finnes" : ""}
          </p>
        </>
      )}
      {!summary.data?.summary && (
        <p className="mt-3 text-sm text-muted-foreground">Ingen oppsummering ennå.</p>
      )}
      {settings.data?.modes.group_findings === "manual" && (
        <Button
          className="mt-3"
          size="sm"
          disabled={busy || !settings.data.hasToken || !summary.data?.includedCount}
          onClick={() => void generate()}
        >
          {summary.data?.summary ? "Generer på nytt" : "Generer sammendrag"}
        </Button>
      )}
      {settings.data?.modes.group_findings !== "manual" && (
        <p className="mt-3 text-xs text-muted-foreground">
          Manuell gruppeoppsummering kan slås på i Teaminnstillinger.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-risk">
          {error}
        </p>
      )}
    </Card>
  );
}
